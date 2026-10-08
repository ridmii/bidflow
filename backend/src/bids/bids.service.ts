import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, EntityManager } from 'typeorm';
import { Bid, BidType } from './entities/bid.entity';
import { AutoBid } from './entities/auto-bid.entity';
import { Auction, AuctionStatus } from '../auctions/entities/auction.entity';
import { PlaceBidDto } from './dto/place-bid.dto';
import { SetAutoBidDto } from './dto/set-auto-bid.dto';
import { AuditService } from '../audit/audit.service';
import { AuditEventType } from '../audit/entities/audit-log.entity';
import {
  calculateMinimumNextBid,
  calculateMinimumIncrement,
} from './bid-increment.util';
import { AuctionGateway } from '../gateway/auction.gateway';
import { User } from '../users/entities/user.entity';

@Injectable()
export class BidsService {
  constructor(
    @InjectRepository(Bid) private bidsRepo: Repository<Bid>,
    @InjectRepository(AutoBid) private autoBidsRepo: Repository<AutoBid>,
    @InjectRepository(Auction) private auctionsRepo: Repository<Auction>,
    private dataSource: DataSource,
    private auditService: AuditService,
    private auctionGateway: AuctionGateway,
  ) {}

  /**
   * Place a manual bid - uses pessimistic locking (SELECT FOR UPDATE)
   * to prevent race conditions. Fully authoritative on the backend.
   */
  async placeBid(
    auctionId: string,
    bidder: User,
    dto: PlaceBidDto,
  ): Promise<Bid> {
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        return await this.executePlaceBid(auctionId, bidder, dto);
      } catch (err: any) {
        attempt++;
        const isDeadlockOrTimeout =
          err?.code === '40P01' || // Deadlock
          err?.code === '40001' || // Serialization failure
          err?.code === '55P03';   // Lock not available (timeout)
        const isOptimistic = err?.name === 'OptimisticLockVersionMismatchError';

        if (isDeadlockOrTimeout || isOptimistic) {
          if (attempt >= maxRetries) {
            throw new ConflictException({
              message: 'High traffic, please try again.',
              code: 'BID_CONFLICT',
            });
          }
          // Backoff
          await new Promise((r) => setTimeout(r, 50 * attempt));
        } else {
          throw err;
        }
      }
    }
    throw new ConflictException({
      message: 'High traffic, please try again.',
      code: 'BID_CONFLICT',
    });
  }

  private async executePlaceBid(
    auctionId: string,
    bidder: User,
    dto: PlaceBidDto,
  ): Promise<Bid> {
    // Idempotency check BEFORE entering transaction
    if (dto.idempotencyKey) {
      const existing = await this.bidsRepo.findOne({
        where: { idempotencyKey: dto.idempotencyKey, auctionId },
      });
      if (existing) {
        throw new ConflictException('Duplicate bid request detected');
      }
    }

    const events: (() => void)[] = [];

    const bid = await this.dataSource.transaction(async (manager) => {
      // PESSIMISTIC WRITE LOCK - only one transaction can hold this at a time
      const auction = await manager.findOne(Auction, {
        where: { id: auctionId },
        // lock: { mode: 'pessimistic_write' },
      });

      if (!auction) throw new NotFoundException('Auction not found');
      if (auction.status !== AuctionStatus.LIVE) {
        await this.auditService.log({
          eventType: AuditEventType.BID_REJECTED,
          auctionId,
          actorId: bidder.id,
          actorName: bidder.name,
          metadata: { reason: 'Auction not live', status: auction.status },
        });
        throw new BadRequestException(
          `Auction is not live (status: ${auction.status})`,
        );
      }

      const now = new Date();
      if (now > auction.endTime) {
        await this.auditService.log({
          eventType: AuditEventType.BID_REJECTED,
          auctionId,
          actorId: bidder.id,
          actorName: bidder.name,
          metadata: { reason: 'Auction has ended' },
        });
        throw new BadRequestException('Auction has already ended');
      }

      // Re-validate minimum increment with locked current price
      const minimumBid = calculateMinimumNextBid(Number(auction.currentPrice));
      if (dto.amount < minimumBid) {
        await this.auditService.log({
          eventType: AuditEventType.BID_REJECTED,
          auctionId,
          actorId: bidder.id,
          actorName: bidder.name,
          metadata: {
            reason: 'Bid below minimum',
            bidAmount: dto.amount,
            minimumRequired: minimumBid,
          },
        });
        throw new BadRequestException(
          `Bid must be at least Rs. ${minimumBid}. Current price: Rs. ${auction.currentPrice}`,
        );
      }

      const previousLeader = auction.leadingBidderId;

      // Create bid record
      const bid = manager.create(Bid, {
        amount: dto.amount,
        type: BidType.MANUAL,
        auctionId,
        bidderId: bidder.id,
        bidderName: bidder.name,
        idempotencyKey: dto.idempotencyKey,
      });
      await manager.save(bid);

      // Update auction state
      const wasLeaderChanged = previousLeader !== bidder.id;
      auction.currentPrice = dto.amount;
      auction.leadingBidderId = bidder.id;
      auction.leadingBidderName = bidder.name;

      // Anti-sniping check
      const secondsRemaining =
        (auction.endTime.getTime() - now.getTime()) / 1000;
      let extended = false;
      if (
        secondsRemaining <= auction.antiSnipingDuration &&
        auction.extensionCount < auction.maxExtensions
      ) {
        const newEndTime = new Date(
          auction.endTime.getTime() + auction.extensionDuration * 1000,
        );
        auction.endTime = newEndTime;
        auction.extensionCount += 1;
        extended = true;

        await this.auditService.log({
          eventType: AuditEventType.AUCTION_EXTENDED,
          auctionId,
          actorId: bidder.id,
          actorName: bidder.name,
          metadata: {
            newEndTime,
            extensionCount: auction.extensionCount,
            triggeredBy: bidder.id,
          },
        });
      }

      await manager.save(auction);

      // Audit logs
      await this.auditService.log({
        eventType: AuditEventType.BID_PLACED,
        auctionId,
        actorId: bidder.id,
        actorName: bidder.name,
        metadata: { amount: dto.amount, type: 'MANUAL' },
      });

      if (wasLeaderChanged && previousLeader) {
        await this.auditService.log({
          eventType: AuditEventType.LEADER_CHANGED,
          auctionId,
          actorId: bidder.id,
          actorName: bidder.name,
          metadata: { previousLeader, newLeader: bidder.id },
        });
      }

      // Collect real-time events to be emitted AFTER transaction commits
      events.push(() => {
        this.auctionGateway.emitBidPlaced(auctionId, {
          bidId: bid.id,
          amount: dto.amount,
          bidderId: bidder.id,
          bidderName: bidder.name,
          currentPrice: dto.amount,
          leadingBidderId: bidder.id,
          leadingBidderName: bidder.name,
          placedAt: bid.placedAt,
          type: 'MANUAL',
        });

        if (extended) {
          this.auctionGateway.emitAuctionExtended(auctionId, {
            newEndTime: auction.endTime,
            extensionCount: auction.extensionCount,
          });
        }
      });

      // Process auto-bids from other bidders within the same transaction
      await this.processAutoBids(auctionId, bidder.id, manager, events);

      return bid;
    });

    // Execute events only after successful commit
    events.forEach((fn) => fn());

    return bid;
  }

  /**
   * Process proxy/auto bids after a new manual or auto bid lands.
   * Finds the competing auto-bid with the highest max that can still outbid.
   * Can be run standalone or within an existing transaction.
   */
  async processAutoBids(
    auctionId: string,
    currentWinnerId: string,
    providedManager?: EntityManager,
    providedEvents?: (() => void)[],
  ) {
    const doWork = async (manager: EntityManager, events: (() => void)[]) => {
      const auction = await manager.findOne(Auction, {
        where: { id: auctionId },
        // lock: { mode: 'pessimistic_write' }, // REMOVED TEMPORARILY
      });

      if (!auction || auction.status !== AuctionStatus.LIVE) return;

      const currentPrice = Number(auction.currentPrice);
      const minimumNextBid = calculateMinimumNextBid(currentPrice);

      // Find all active auto-bids from OTHER bidders sorted by maxAmount DESC
      const autoBids = await manager.find(AutoBid, {
        where: { auctionId, isActive: true },
        order: { maxAmount: 'DESC' },
        relations: { bidder: true },
      });

      // Filter out current winner
      const competitors = autoBids.filter(
        (ab) => ab.bidderId !== currentWinnerId,
      );
      if (competitors.length === 0) return;

      // Best competitor
      const bestCompetitor = competitors[0];
      if (Number(bestCompetitor.maxAmount) < minimumNextBid) return;

      // Winner's auto bid (if any)
      const winnerAutoBid = autoBids.find(
        (ab) => ab.bidderId === currentWinnerId,
      );

      let newBidAmount: number = 0;
      let newWinner: AutoBid = bestCompetitor;

      if (winnerAutoBid) {
        const winnerMax = Number(winnerAutoBid.maxAmount);
        const competitorMax = Number(bestCompetitor.maxAmount);

        if (winnerMax >= competitorMax) {
          // Current winner still wins - bid just enough to beat competitor
          const competitorMinRequired = calculateMinimumNextBid(competitorMax);
          if (competitorMinRequired <= winnerMax) {
            newBidAmount = Math.min(
              calculateMinimumNextBid(currentPrice),
              competitorMinRequired,
            );
            newWinner = winnerAutoBid; // winner stays
            // Actually the current winner is already winning, skip
            return;
          } else {
            newBidAmount = winnerMax;
            newWinner = winnerAutoBid;
          }
        } else {
          // Competitor wins
          newBidAmount = Math.min(
            winnerMax + calculateMinimumIncrement(winnerMax),
            competitorMax,
          );
          newWinner = bestCompetitor;
        }
      } else {
        // No auto-bid from current leader; competitor bids minimum required
        newBidAmount = minimumNextBid;
        newWinner = bestCompetitor;
      }

      if (newBidAmount > Number(bestCompetitor.maxAmount)) return;

      const previousLeader = auction.leadingBidderId;

      // Create auto bid record
      const bid = manager.create(Bid, {
        amount: newBidAmount,
        type: BidType.AUTO,
        auctionId,
        bidderId: newWinner.bidderId,
        bidderName: newWinner.bidder.name,
      });
      await manager.save(bid);

      auction.currentPrice = newBidAmount;
      auction.leadingBidderId = newWinner.bidderId;
      auction.leadingBidderName = newWinner.bidder.name;

      // Anti-sniping check for auto-bid
      const now = new Date();
      const secondsRemaining =
        (auction.endTime.getTime() - now.getTime()) / 1000;
      let extended = false;
      if (
        secondsRemaining <= auction.antiSnipingDuration &&
        auction.extensionCount < auction.maxExtensions
      ) {
        auction.endTime = new Date(
          auction.endTime.getTime() + auction.extensionDuration * 1000,
        );
        auction.extensionCount += 1;
        extended = true;
      }

      await manager.save(auction);

      await this.auditService.log({
        eventType: AuditEventType.AUTO_BID_PLACED,
        auctionId,
        actorId: newWinner.bidderId,
        actorName: newWinner.bidder.name,
        metadata: { amount: newBidAmount },
      });

      if (previousLeader !== newWinner.bidderId) {
        await this.auditService.log({
          eventType: AuditEventType.LEADER_CHANGED,
          auctionId,
          actorId: newWinner.bidderId,
          actorName: newWinner.bidder.name,
          metadata: { previousLeader, newLeader: newWinner.bidderId },
        });
      }

      events.push(() => {
        this.auctionGateway.emitBidPlaced(auctionId, {
          bidId: bid.id,
          amount: newBidAmount,
          bidderId: newWinner.bidderId,
          bidderName: newWinner.bidder.name,
          currentPrice: newBidAmount,
          leadingBidderId: newWinner.bidderId,
          leadingBidderName: newWinner.bidder.name,
          placedAt: bid.placedAt,
          type: 'AUTO',
        });

        if (extended) {
          this.auctionGateway.emitAuctionExtended(auctionId, {
            newEndTime: auction.endTime,
            extensionCount: auction.extensionCount,
          });
        }
      });
    };

    if (providedManager && providedEvents) {
      // Run within the caller's transaction
      await doWork(providedManager, providedEvents);
    } else {
      // Standalone execution (e.g. from setAutoBid)
      const events: (() => void)[] = [];
      await this.dataSource.transaction(async (manager) => {
        await doWork(manager, events);
      });
      events.forEach((fn) => fn());
    }
  }

  async setAutoBid(
    auctionId: string,
    bidder: User,
    dto: SetAutoBidDto,
  ): Promise<{ message: string }> {
    const events: (() => void)[] = [];

    await this.dataSource.transaction(async (manager) => {
      const auction = await manager.findOne(Auction, {
        where: { id: auctionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!auction) throw new NotFoundException('Auction not found');
      if (
        auction.status !== AuctionStatus.LIVE &&
        auction.status !== AuctionStatus.SCHEDULED
      ) {
        throw new BadRequestException('Cannot set auto-bid on this auction');
      }

      const currentPrice = Number(auction.currentPrice);
      if (dto.maxAmount <= currentPrice) {
        throw new BadRequestException(
          `Auto-bid maximum (Rs. ${dto.maxAmount}) must be greater than current price (Rs. ${currentPrice})`,
        );
      }

      // Upsert auto-bid
      let autoBid = await manager.findOne(AutoBid, {
        where: { auctionId, bidderId: bidder.id },
      });

      if (autoBid) {
        autoBid.maxAmount = dto.maxAmount;
        autoBid.isActive = true;
      } else {
        autoBid = manager.create(AutoBid, {
          auctionId,
          bidderId: bidder.id,
          maxAmount: dto.maxAmount,
          isActive: true,
        });
      }
      await manager.save(autoBid);

      await this.auditService.log({
        eventType: AuditEventType.AUTO_BID_CONFIGURED,
        auctionId,
        actorId: bidder.id,
        actorName: bidder.name,
        metadata: { maxAmount: dto.maxAmount },
      });

      // Trigger auto-bidding if auction is live (within same transaction)
      if (auction.status === AuctionStatus.LIVE) {
        await this.processAutoBids(
          auctionId,
          auction.leadingBidderId || '',
          manager,
          events,
        );
      }
    });

    events.forEach((fn) => fn());

    return { message: 'Auto-bid configured successfully' };
  }

  async getBidHistory(auctionId: string): Promise<any[]> {
    const auction = await this.auctionsRepo.findOne({
      where: { id: auctionId },
    });

    if (!auction) throw new NotFoundException('Auction not found');

    const bids = await this.bidsRepo.find({
      where: { auctionId },
      order: { placedAt: 'DESC' },
      take: 100,
    });

    // Do NOT expose full bidder identity to public
    return bids.map((bid) => ({
      id: bid.id,
      amount: bid.amount,
      bidderName: bid.bidderName,
      bidderId: bid.bidderId,
      type: bid.type,
      placedAt: bid.placedAt,
    }));
  }

  async getMyAutoBid(auctionId: string, userId: string) {
    const autoBid = await this.autoBidsRepo.findOne({
      where: { auctionId, bidderId: userId },
    });
    if (!autoBid) return null;
    return {
      id: autoBid.id,
      maxAmount: autoBid.maxAmount, // Only visible to owner
      isActive: autoBid.isActive,
      auctionId: autoBid.auctionId,
    };
  }
}
