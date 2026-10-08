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
        } else if (err?.code === '23505' && dto.idempotencyKey) {
          // Unique constraint violation (backstop for idempotency)
          const existing = await this.bidsRepo.findOne({
            where: { idempotencyKey: dto.idempotencyKey, auctionId, bidderId: bidder.id },
          });
          if (existing) {
            return existing;
          }
          throw err;
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
    const events: (() => void)[] = [];

                const bid = await this.dataSource.transaction(async (manager) => {
      await manager.query(`SET LOCAL lock_timeout = '5000'`); // 5 seconds
      // PESSIMISTIC WRITE LOCK - only one transaction can hold this at a time
      const auction = await manager.findOne(Auction, {
        where: { id: auctionId },
        lock: { mode: 'pessimistic_write' },
      });

      // Idempotency check AFTER acquiring the lock (safe serialization)
      if (dto.idempotencyKey) {
        const existing = await manager.findOne(Bid, {
          where: { idempotencyKey: dto.idempotencyKey, auctionId, bidderId: bidder.id },
        });
        if (existing) {
                    return existing; // Return the exact original result, no new events emitted
        }
      }

      if (!auction) throw new NotFoundException('Auction not found');
      if (auction.status !== AuctionStatus.LIVE) {
        await this.auditService.log({
          eventType: AuditEventType.BID_REJECTED,
          auctionId,
          actorId: bidder.id,
          actorName: bidder.name,
          metadata: { reason: 'Auction not live', status: auction.status },
        }, manager);
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
        }, manager);
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
        }, manager);
        throw new BadRequestException(
          `Bid must be at least Rs. ${minimumBid}. Current price: Rs. ${auction.currentPrice}`,
        );
      }

      const previousLeader = auction.leadingBidderId;

      if (previousLeader === bidder.id) {
        throw new ConflictException({
          message: 'You are already the leading bidder',
          code: 'ALREADY_LEADING',
        });
      }

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
        }, manager);
      }

      await manager.save(auction);
      
      // Audit logs
      await this.auditService.log({
        eventType: AuditEventType.BID_PLACED,
        auctionId,
        actorId: bidder.id,
        actorName: bidder.name,
        metadata: { amount: dto.amount, type: 'MANUAL' },
      }, manager);

      const aliasMap = await this.getAliasMap(auctionId, manager);
      const bidderAlias = aliasMap.get(bidder.id) || 'Bidder';

      // Collect real-time events to be emitted AFTER transaction commits
      events.push(() => {
        this.auctionGateway.emitBidPlaced(auctionId, {
          bidId: bid.id,
          amount: dto.amount,
          bidderName: bidderAlias,
          currentPrice: dto.amount,
          leadingBidderName: bidderAlias,
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

      // Process auto-bids from ALL active auto-bids within the same transaction
      await this.processAutoBids(auctionId, manager, events);
      
      const finalAuction = await manager.findOne(Auction, { where: { id: auctionId } });
      if (previousLeader && finalAuction && finalAuction.leadingBidderId !== previousLeader) {
        await this.auditService.log({
          eventType: AuditEventType.LEADER_CHANGED,
          auctionId,
          actorId: finalAuction.leadingBidderId,
          actorName: finalAuction.leadingBidderName,
          metadata: { previousLeader, newLeader: finalAuction.leadingBidderId },
        }, manager);
      }
      
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
    providedManager?: EntityManager,
    providedEvents?: (() => void)[],
  ) {
    const doWork = async (manager: EntityManager, events: (() => void)[]) => {
      const auction = await manager.findOne(Auction, {
        where: { id: auctionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!auction || auction.status !== AuctionStatus.LIVE) return;

      const autoBids = await manager.find(AutoBid, {
        where: { auctionId, isActive: true },
        relations: { bidder: true },
      });

      // Build a map of maxes
      const bidderMaxes = new Map<string, { userId: string, name: string, maxAmount: number, time: number }>();
      
      // Add current leader if they exist
      if (auction.leadingBidderId) {
        let leaderTime = Date.now();
        const lastBid = await manager.findOne(Bid, {
          where: { auctionId, bidderId: auction.leadingBidderId },
          order: { placedAt: 'DESC' }
        });
        if (lastBid && lastBid.placedAt) {
          leaderTime = new Date(lastBid.placedAt).getTime();
        }
        
        bidderMaxes.set(auction.leadingBidderId, {
          userId: auction.leadingBidderId,
          name: auction.leadingBidderName,
          maxAmount: Number(auction.currentPrice),
          time: leaderTime
        });
      }

      for (const ab of autoBids) {
        const abMax = Number(ab.maxAmount);
        const existing = bidderMaxes.get(ab.bidderId);
        if (existing) {
          existing.maxAmount = Math.max(existing.maxAmount, abMax);
          if (existing.maxAmount === abMax) {
            existing.time = ab.updatedAt.getTime();
          }
        } else {
          bidderMaxes.set(ab.bidderId, {
            userId: ab.bidderId,
            name: ab.bidder.name,
            maxAmount: abMax,
            time: ab.updatedAt.getTime()
          });
        }
      }

      if (bidderMaxes.size === 0) return;
      
      const currentPrice = Number(auction.currentPrice);
      
      if (bidderMaxes.size === 1) {
        const singleUser = Array.from(bidderMaxes.values())[0];
        if (singleUser.userId === auction.leadingBidderId) return;
        
        if (singleUser.maxAmount >= currentPrice) {
          const bid = manager.create(Bid, {
            amount: currentPrice,
            type: BidType.AUTO,
            auctionId,
            bidderId: singleUser.userId,
            bidderName: singleUser.name,
          });
          await manager.save(bid);
          
          auction.currentPrice = currentPrice;
          auction.leadingBidderId = singleUser.userId;
          auction.leadingBidderName = singleUser.name;
          await manager.save(auction);
          
          await this.auditService.log({
            eventType: AuditEventType.AUTO_BID_PLACED,
            auctionId,
            actorId: singleUser.userId,
            actorName: singleUser.name,
            metadata: { amount: currentPrice },
          }, manager);
          
          const aliasMap = await this.getAliasMap(auctionId, manager);
          const alias = aliasMap.get(singleUser.userId) || 'Bidder';

          events.push(() => {
            this.auctionGateway.emitBidPlaced(auctionId, {
              bidId: bid.id,
              amount: currentPrice,
              bidderName: alias,
              currentPrice: currentPrice,
              leadingBidderName: alias,
              placedAt: bid.placedAt,
              type: 'AUTO',
            });
          });
        }
        return;
      }

      const sorted = Array.from(bidderMaxes.values()).sort((a, b) => {
        if (b.maxAmount !== a.maxAmount) return b.maxAmount - a.maxAmount;
        return a.time - b.time;
      });

      const winner = sorted[0];
      const challenger = sorted[1];
      
      // Calculate new price
      let newPrice = currentPrice;
      if (winner.maxAmount > challenger.maxAmount) {
         // maxC < maxL: leader stays, price = min(maxL, maxC + incAt(maxC))
         const challengerInc = calculateMinimumIncrement(challenger.maxAmount);
         const competitorMinRequired = challenger.maxAmount + challengerInc;
         newPrice = Math.min(winner.maxAmount, competitorMinRequired);
      } else {
         // maxC == maxL: the earlier max wins, price = maxL
         newPrice = winner.maxAmount;
      }
      
      newPrice = Math.max(currentPrice, newPrice);

      // No change needed
      if (winner.userId === auction.leadingBidderId && newPrice === currentPrice) {
        return;
      }

      // We have a new AUTO bid
      const bid = manager.create(Bid, {
        amount: newPrice,
        type: BidType.AUTO,
        auctionId,
        bidderId: winner.userId,
        bidderName: winner.name,
      });
      await manager.save(bid);

      auction.currentPrice = newPrice;
      auction.leadingBidderId = winner.userId;
      auction.leadingBidderName = winner.name;

      // Anti-sniping check
      const now = new Date();
      const secondsRemaining = (auction.endTime.getTime() - now.getTime()) / 1000;
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
        actorId: winner.userId,
        actorName: winner.name,
        metadata: { amount: newPrice },
      }, manager);

      const aliasMap = await this.getAliasMap(auctionId, manager);
      const winnerAlias = aliasMap.get(winner.userId) || 'Bidder';

      events.push(() => {
        this.auctionGateway.emitBidPlaced(auctionId, {
          bidId: bid.id,
          amount: newPrice,
          bidderName: winnerAlias,
          currentPrice: newPrice,
          leadingBidderName: winnerAlias,
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
      await doWork(providedManager, providedEvents);
    } else {
      const events: (() => void)[] = [];
      await this.dataSource.transaction(async (manager) => {
        await manager.query(`SET LOCAL lock_timeout = '5000'`);
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
      await manager.query(`SET LOCAL lock_timeout = '5000'`);
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
      const minNext = currentPrice + calculateMinimumIncrement(currentPrice);
      if (dto.maxAmount < minNext) {
        throw new BadRequestException(
          `Auto-bid maximum (Rs. ${dto.maxAmount}) must be at least the minimum next bid (Rs. ${minNext})`,
        );
      }

      const previousLeader = auction.leadingBidderId;

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
        metadata: { status: 'CONFIGURED' },
      }, manager);

      // Trigger auto-bidding if auction is live (within same transaction)
      if (auction.status === AuctionStatus.LIVE) {
        await this.processAutoBids(
          auctionId,
          manager,
          events,
        );
      }
      
      const finalAuction = await manager.findOne(Auction, { where: { id: auctionId } });
      if (previousLeader && finalAuction && finalAuction.leadingBidderId !== previousLeader) {
        await this.auditService.log({
          eventType: AuditEventType.LEADER_CHANGED,
          auctionId,
          actorId: finalAuction.leadingBidderId,
          actorName: finalAuction.leadingBidderName,
          metadata: { previousLeader, newLeader: finalAuction.leadingBidderId },
        }, manager);
      }
    });

    events.forEach((fn) => fn());

    return { message: 'Auto-bid configured successfully' };
  }

  async getBidHistory(auctionId: string, user?: User): Promise<any[]> {
    const auction = await this.auctionsRepo.findOne({
      where: { id: auctionId },
    });

    if (!auction) throw new NotFoundException('Auction not found');

    const bids = await this.bidsRepo.find({
      where: { auctionId },
      order: { placedAt: 'DESC' },
      take: 100,
    });

    const aliasMap = await this.getAliasMap(auctionId);

    // Do NOT expose full bidder identity to public
    return bids.map((bid) => ({
      id: bid.id,
      amount: bid.amount,
      bidderName: aliasMap.get(bid.bidderId) || 'Bidder',
      isYou: user ? bid.bidderId === user.id : false,
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

  async getAliasMap(auctionId: string, providedManager?: EntityManager): Promise<Map<string, string>> {
    const runner = providedManager || this.bidsRepo.manager;
    const bidderOrdering = await runner.query(
      `SELECT "bidderId" FROM bids WHERE "auctionId" = $1 GROUP BY "bidderId" ORDER BY MIN("placedAt") ASC`,
      [auctionId]
    );
      
    const map = new Map<string, string>();
    bidderOrdering.forEach((row, i) => {
      map.set(row.bidderId, `Bidder ${i + 1}`);
    });
    return map;
  }
}
