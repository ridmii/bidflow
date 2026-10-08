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

      // Self-outbid prevention: if the bidder is already the leader, reject
      if (auction.leadingBidderId === bidder.id) {
        await this.auditService.log({
          eventType: AuditEventType.BID_REJECTED,
          auctionId,
          actorId: bidder.id,
          actorName: bidder.name,
          metadata: { reason: 'Already leading - use auto-bid to raise maximum' },
        }, manager);
        throw new ConflictException({
          message: 'You are already the leading bidder. Raise your auto-bid maximum instead.',
          code: 'ALREADY_LEADING',
        });
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

      if (wasLeaderChanged && previousLeader) {
        await this.auditService.log({
          eventType: AuditEventType.LEADER_CHANGED,
          auctionId,
          actorId: bidder.id,
          actorName: bidder.name,
          metadata: { previousLeader, newLeader: bidder.id },
        }, manager);
      }

      // Collect real-time events to be emitted AFTER transaction commits
      events.push(() => {
        this.auctionGateway.emitBidPlaced(auctionId, {
          bidId: bid.id,
          amount: dto.amount,
          currentPrice: dto.amount,
          leadingBidderId: bidder.id,
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

      // Process auto-bids from the current leader (if any) within the same transaction.
      // The manual bid is treated as maxC = dto.amount for the comparison.
      await this.resolveAutoBidAfterManualBid(
        auctionId,
        bidder.id,
        dto.amount,
        manager,
        events,
      );

      return bid;
    });

    // Execute events only after successful commit
    events.forEach((fn) => fn());

    return bid;
  }

  /**
   * After a MANUAL bid of amount `manualAmount` by `bidderId` lands and is accepted,
   * check if the previous leader has an auto-bid that can re-take the lead.
   * The manual bid is treated as maxC = manualAmount for the comparison.
   */
  private async resolveAutoBidAfterManualBid(
    auctionId: string,
    manualBidderId: string,
    manualAmount: number,
    manager: EntityManager,
    events: (() => void)[],
  ): Promise<void> {
    // Find the auto-bid of the previous leaders (everyone except the manual bidder)
    const leaderAutoBid = await manager.findOne(AutoBid, {
      where: { auctionId, isActive: true },
      order: { maxAmount: 'DESC' },
      relations: { bidder: true },
    });

    if (!leaderAutoBid || leaderAutoBid.bidderId === manualBidderId) {
      // No competing auto-bid or the auto-bid belongs to the manual bidder themselves
      return;
    }

    // Guard: bidder relation must be loaded (won't be in mocked tests without real DB)
    if (!leaderAutoBid.bidder) return;

    const auction = await manager.findOne(Auction, { where: { id: auctionId } });
    if (!auction) return;

    const maxL = Number(leaderAutoBid.maxAmount);
    const maxC = manualAmount; // manual bid treated as max equal to bid amount
    const currentPrice = Number(auction.currentPrice);

    if (maxL <= maxC) {
      // Leader's max doesn't beat the manual bid — manual bidder wins (already set)
      return;
    }

    // Leader can respond: maxL > maxC
    // new price = min(maxL, maxC + inc(maxC))
    const newPrice = Math.min(maxL, maxC + calculateMinimumIncrement(maxC));

    const previousLeader = auction.leadingBidderId;

    // Create AUTO bid record for the responding leader
    const bid = manager.create(Bid, {
      amount: newPrice,
      type: BidType.AUTO,
      auctionId,
      bidderId: leaderAutoBid.bidderId,
      bidderName: leaderAutoBid.bidder.name,
    });
    await manager.save(bid);

    auction.currentPrice = newPrice;
    auction.leadingBidderId = leaderAutoBid.bidderId;
    auction.leadingBidderName = leaderAutoBid.bidder.name;
    await manager.save(auction);

    await this.auditService.log({
      eventType: AuditEventType.AUTO_BID_PLACED,
      auctionId,
      actorId: leaderAutoBid.bidderId,
      actorName: leaderAutoBid.bidder.name,
      metadata: { amount: newPrice, type: 'AUTO' },
    }, manager);

    // Log leader change if the manual bidder had briefly become leader
    if (previousLeader !== leaderAutoBid.bidderId) {
      await this.auditService.log({
        eventType: AuditEventType.LEADER_CHANGED,
        auctionId,
        actorId: leaderAutoBid.bidderId,
        actorName: leaderAutoBid.bidder.name,
        metadata: { previousLeader, newLeader: leaderAutoBid.bidderId },
      }, manager);
    }

    events.push(() => {
      this.auctionGateway.emitBidPlaced(auctionId, {
        bidId: bid.id,
        amount: newPrice,
        currentPrice: newPrice,
        leadingBidderId: leaderAutoBid.bidderId,
        placedAt: bid.placedAt,
        type: 'AUTO',
      });
    });
  }

  /**
   * Process proxy/auto bids when a new auto-bid maximum is set.
   *
   * ONE-SHOT algorithm (no loop, always terminates):
   *
   * Let L = current leading auto-bid (highest maxAmount among active auto-bids for the current leader)
   *     C = best challenger (highest maxAmount among active auto-bids NOT belonging to the current leader)
   *     incAt(p) = calculateMinimumIncrement(p)
   *     currentPrice = auction.currentPrice
   *
   * If there is no challenger (single auto-bidder), make them leader at current price (no price change).
   *
   * If challenger's maxC < currentPrice + incAt(currentPrice):
   *   → reject with "bid too low" (handled in setAutoBid before this is called)
   *
   * With a competitor:
   *   If maxC > maxL: C becomes leader; new price = min(maxC, maxL + incAt(maxL))
   *   If maxC < maxL: L stays leader;  new price = min(maxL, maxC + incAt(maxC))
   *   If maxC === maxL: earlier createdAt wins; price = maxL (tied max, no price change needed)
   *
   * With 3+ bidders: sort by maxAmount DESC; compare only top-2.
   * All others are simply outbid; no per-step simulation.
   *
   * Maximums NEVER appear in any event payload, socket payload, or audit metadata.
   */
  async processAutoBids(
    auctionId: string,
    triggeringBidderId: string, // the bidder who just set/changed their auto-bid
    manager: EntityManager,
    events: (() => void)[],
  ): Promise<void> {
    const auction = await manager.findOne(Auction, {
      where: { id: auctionId },
      // already under pessimistic lock from caller
    });

    if (!auction || auction.status !== AuctionStatus.LIVE) return;

    const currentPrice = Number(auction.currentPrice);

    // Load all active auto-bids sorted by maxAmount DESC, then createdAt ASC (earlier wins ties)
    const autoBids = await manager.find(AutoBid, {
      where: { auctionId, isActive: true },
      order: { maxAmount: 'DESC', createdAt: 'ASC' },
      relations: { bidder: true },
    });

    if (autoBids.length === 0) return;

    // Single auto-bidder: become leader at current price, no price change
    if (autoBids.length === 1) {
      const sole = autoBids[0];
      if (auction.leadingBidderId !== sole.bidderId) {
        const previousLeader = auction.leadingBidderId;
        auction.leadingBidderId = sole.bidderId;
        auction.leadingBidderName = sole.bidder.name;
        await manager.save(auction);

        await this.auditService.log({
          eventType: AuditEventType.LEADER_CHANGED,
          auctionId,
          actorId: sole.bidderId,
          actorName: sole.bidder.name,
          metadata: { previousLeader, newLeader: sole.bidderId },
        }, manager);
      }
      return;
    }

    // Identify top-2 bids
    // The "leader" is the top-1. The "challenger" is the top-2 (or best non-leader).
    const [top1, top2] = autoBids;
    const maxTop1 = Number(top1.maxAmount);
    const maxTop2 = Number(top2.maxAmount);

    let winner: AutoBid;
    let newPrice: number;

    if (maxTop1 > maxTop2) {
      // top1 wins
      winner = top1;
      // price = min(maxTop1, maxTop2 + inc(maxTop2))
      newPrice = Math.min(maxTop1, maxTop2 + calculateMinimumIncrement(maxTop2));
    } else if (maxTop1 < maxTop2) {
      // This shouldn't happen because we sorted DESC, but handle defensively
      winner = top2;
      newPrice = Math.min(maxTop2, maxTop1 + calculateMinimumIncrement(maxTop1));
    } else {
      // Tie: earlier createdAt wins (already sorted: top1 has earlier createdAt)
      winner = top1;
      newPrice = maxTop1; // price = the tied max
    }

    // Ensure newPrice is at least the minimum next bid (defensive)
    const minimumNext = calculateMinimumNextBid(currentPrice);
    if (newPrice < minimumNext) {
      newPrice = minimumNext;
    }

    const previousLeader = auction.leadingBidderId;
    const leaderChanged = previousLeader !== winner.bidderId;

    // Only update if the price actually changes or leader changes
    if (!leaderChanged && Number(auction.currentPrice) === newPrice) return;

    // Create AUTO bid record (only if price actually moves)
    if (Number(auction.currentPrice) !== newPrice || leaderChanged) {
      const bid = manager.create(Bid, {
        amount: newPrice,
        type: BidType.AUTO,
        auctionId,
        bidderId: winner.bidderId,
        bidderName: winner.bidder.name,
      });
      await manager.save(bid);

      auction.currentPrice = newPrice;
      auction.leadingBidderId = winner.bidderId;
      auction.leadingBidderName = winner.bidder.name;
      await manager.save(auction);

      // Audit: amount only (NO maxAmount)
      await this.auditService.log({
        eventType: AuditEventType.AUTO_BID_PLACED,
        auctionId,
        actorId: winner.bidderId,
        actorName: winner.bidder.name,
        metadata: { amount: newPrice, type: 'AUTO' },
      }, manager);

      if (leaderChanged) {
        await this.auditService.log({
          eventType: AuditEventType.LEADER_CHANGED,
          auctionId,
          actorId: winner.bidderId,
          actorName: winner.bidder.name,
          metadata: { previousLeader, newLeader: winner.bidderId },
        }, manager);
      }

      events.push(() => {
        this.auctionGateway.emitBidPlaced(auctionId, {
          bidId: bid.id,
          amount: newPrice,
          currentPrice: newPrice,
          leadingBidderId: winner.bidderId,
          placedAt: bid.placedAt,
          type: 'AUTO',
        });
      });
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
      const minNext = calculateMinimumNextBid(currentPrice);
      if (dto.maxAmount < minNext) {
        throw new BadRequestException(
          `Auto-bid maximum (Rs. ${dto.maxAmount}) must be at least the minimum next bid (Rs. ${minNext})`,
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

      // Audit: do NOT log maxAmount (it's private)
      await this.auditService.log({
        eventType: AuditEventType.AUTO_BID_CONFIGURED,
        auctionId,
        actorId: bidder.id,
        actorName: bidder.name,
        metadata: { configured: true },
      }, manager);

      // Trigger auto-bid resolution if auction is live
      if (auction.status === AuctionStatus.LIVE) {
        await this.processAutoBids(
          auctionId,
          bidder.id,
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

    // Build stable per-auction alias map (Bidder 1, Bidder 2, ...)
    // Numbered by first bid appearance, not by real name or ID
    const aliasMap = new Map<string, string>();
    let aliasCounter = 1;
    // Sort chronologically to determine first-bid order
    const chronological = [...bids].sort(
      (a, b) => a.placedAt.getTime() - b.placedAt.getTime(),
    );
    for (const bid of chronological) {
      if (!aliasMap.has(bid.bidderId)) {
        aliasMap.set(bid.bidderId, `Bidder ${aliasCounter++}`);
      }
    }

    return bids.map((bid) => ({
      id: bid.id,
      amount: bid.amount,
      bidderAlias: aliasMap.get(bid.bidderId) ?? 'Bidder',
      type: bid.type,
      placedAt: bid.placedAt,
      // NOTE: bidderId and bidderName are intentionally omitted here.
      // The controller/caller can add isYou: bidderId === requestingUserId
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
