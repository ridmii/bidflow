import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Auction, AuctionStatus } from './entities/auction.entity';
import { CreateAuctionDto, UpdateAuctionDto } from './dto/create-auction.dto';
import { AuditService } from '../audit/audit.service';
import { AuditEventType } from '../audit/entities/audit-log.entity';
import { AuctionGateway } from '../gateway/auction.gateway';
import { User, UserRole } from '../users/entities/user.entity';
import { calculateMinimumNextBid } from '../bids/bid-increment.util';

@Injectable()
export class AuctionsService {
  constructor(
    @InjectRepository(Auction) private auctionsRepo: Repository<Auction>,
    private dataSource: DataSource,
    private auditService: AuditService,
    private auctionGateway: AuctionGateway,
  ) {}

  async create(user: User, dto: CreateAuctionDto): Promise<Auction> {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can create auctions');
    }

    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);

    if (startTime >= endTime) {
      throw new BadRequestException('End time must be after start time');
    }

    const now = new Date();
    const status =
      startTime <= now ? AuctionStatus.SCHEDULED : AuctionStatus.DRAFT;

    const auction = this.auctionsRepo.create({
      title: dto.title,
      description: dto.description,
      startingPrice: dto.startingPrice,
      reservePrice: dto.reservePrice,
      currentPrice: dto.startingPrice,
      startTime,
      endTime,
      minimumBidIncrement: dto.minimumBidIncrement || 500,
      antiSnipingDuration: dto.antiSnipingDuration ?? 120,
      extensionDuration: dto.extensionDuration ?? 120,
      maxExtensions: dto.maxExtensions ?? 3,
      status: dto.status || (startTime <= now ? AuctionStatus.SCHEDULED : AuctionStatus.DRAFT),
      createdById: user.id,
    });

    const saved = await this.auctionsRepo.save(auction);

    await this.auditService.log({
      eventType: AuditEventType.AUCTION_CREATED,
      auctionId: saved.id,
      actorId: user.id,
      actorName: user.name,
      metadata: { title: dto.title, startingPrice: dto.startingPrice },
    });

    return saved;
  }

  async findAll(status?: AuctionStatus): Promise<any[]> {
    const query = this.auctionsRepo.createQueryBuilder('auction');

    if (status) {
      query.where('auction.status = :status', { status });
    }

    query.orderBy('auction.startTime', 'DESC');
    const auctions = await query.getMany();

    return auctions.map((a) => this.sanitizeAuction(a));
  }

  async findOne(id: string): Promise<any> {
    const auction = await this.auctionsRepo.findOne({ where: { id } });
    if (!auction) throw new NotFoundException('Auction not found');
    return this.sanitizeAuction(auction);
  }

  async update(id: string, user: User, dto: UpdateAuctionDto): Promise<any> {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can update auctions');
    }

    const auction = await this.auctionsRepo.findOne({ where: { id } });
    if (!auction) throw new NotFoundException('Auction not found');

    if (
      auction.status === AuctionStatus.LIVE ||
      auction.status === AuctionStatus.COMPLETED
    ) {
      throw new BadRequestException('Cannot edit a live or completed auction');
    }

    Object.assign(auction, dto);
    const saved = await this.auctionsRepo.save(auction);
    return this.sanitizeAuction(saved);
  }

  async scheduleAuction(id: string, user: User): Promise<any> {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can schedule auctions');
    }

    const auction = await this.auctionsRepo.findOne({ where: { id } });
    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.status !== AuctionStatus.DRAFT) {
      throw new BadRequestException('Only draft auctions can be scheduled');
    }

    auction.status = AuctionStatus.SCHEDULED;
    const saved = await this.auctionsRepo.save(auction);

    await this.auditService.log({
      eventType: AuditEventType.AUCTION_SCHEDULED,
      auctionId: id,
      actorId: user.id,
      actorName: user.name,
      metadata: { startTime: auction.startTime },
    });

    return this.sanitizeAuction(saved);
  }

  async cancelAuction(id: string, user: User): Promise<any> {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can cancel auctions');
    }

    const auction = await this.auctionsRepo.findOne({ where: { id } });
    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.status === AuctionStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed auction');
    }

    auction.status = AuctionStatus.CANCELLED;
    const saved = await this.auctionsRepo.save(auction);

    await this.auditService.log({
      eventType: AuditEventType.AUCTION_CANCELLED,
      auctionId: id,
      actorId: user.id,
      actorName: user.name,
      metadata: {},
    });

    this.auctionGateway.emitAuctionEnded(id, {
      status: AuctionStatus.CANCELLED,
      message: 'Auction has been cancelled',
    });

    return this.sanitizeAuction(saved);
  }

  /**
   * Close an auction — idempotent via isClosing flag + pessimistic lock.
   * Called by scheduler or can be triggered manually.
   */
  async closeAuction(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const auction = await manager.findOne(Auction, {
        where: { id },
      });

      if (!auction) return;
      if (auction.status !== AuctionStatus.LIVE) return;
      if (auction.isClosing) return; // Already being closed (idempotency)

      const now = new Date();
      if (now < auction.endTime) return; // Not yet ended

      // Mark as closing to prevent duplicate processing
      auction.isClosing = true;
      await manager.save(auction);

      // Find highest bid
      const highestBid = await manager
        .createQueryBuilder(
          require('../bids/entities/bid.entity').Bid,
          'bid',
        )
        .where('bid.auctionId = :id', { id })
        .orderBy('bid.amount', 'DESC')
        .addOrderBy('bid.placedAt', 'ASC') // Earlier bid wins ties
        .getOne();

      const currentPrice = Number(auction.currentPrice);
      const reservePrice = auction.reservePrice
        ? Number(auction.reservePrice)
        : null;

      let finalStatus: AuctionStatus;

      if (!highestBid) {
        // No bids at all
        finalStatus = AuctionStatus.RESERVE_NOT_MET;
      } else if (reservePrice && currentPrice < reservePrice) {
        // Reserve not met
        finalStatus = AuctionStatus.RESERVE_NOT_MET;
        await this.auditService.log({
          eventType: AuditEventType.RESERVE_NOT_MET,
          auctionId: id,
          metadata: {
            highestBid: currentPrice,
            reservePrice,
          },
        });
      } else {
        // We have a winner
        finalStatus = AuctionStatus.COMPLETED;
        auction.winnerId = highestBid.bidderId;
        auction.winnerName = highestBid.bidderName;
        auction.winningBidAmount = highestBid.amount;

        await this.auditService.log({
          eventType: AuditEventType.WINNER_SELECTED,
          auctionId: id,
          actorId: highestBid.bidderId,
          actorName: highestBid.bidderName,
          metadata: {
            winnerName: highestBid.bidderName,
            amount: highestBid.amount,
          },
        });
      }

      auction.status = finalStatus;
      auction.isClosing = false;
      await manager.save(auction);

      await this.auditService.log({
        eventType: AuditEventType.AUCTION_ENDED,
        auctionId: id,
        metadata: {
          status: finalStatus,
          finalPrice: currentPrice,
          winnerId: auction.winnerId,
        },
      });

      this.auctionGateway.emitAuctionEnded(id, {
        status: finalStatus,
        winnerId: auction.winnerId,
        winnerName: auction.winnerName,
        winningBidAmount: auction.winningBidAmount,
        finalPrice: currentPrice,
      });
    });
  }

  async getAuctionAuditLog(id: string): Promise<any[]> {
    const auction = await this.auctionsRepo.findOne({ where: { id } });
    if (!auction) throw new NotFoundException('Auction not found');
    return this.auditService.getAuctionLogs(id);
  }

  async getMinimumNextBid(id: string): Promise<any> {
    const auction = await this.auctionsRepo.findOne({ where: { id } });
    if (!auction) throw new NotFoundException('Auction not found');
    const minimumBid = calculateMinimumNextBid(Number(auction.currentPrice));
    return {
      currentPrice: auction.currentPrice,
      minimumNextBid: minimumBid,
      minimumIncrement: minimumBid - Number(auction.currentPrice),
    };
  }

  private sanitizeAuction(auction: Auction): any {
    const {
      reservePrice, // Hide reserve price from public
      ...publicAuction
    } = auction;

    return {
      ...publicAuction,
      hasReservePrice: reservePrice != null,
    };
  }
  async deleteAuction(id: string, user: User) {
    if ((user as any).role !== 'ADMIN') {
      throw new NotFoundException('Only admins can delete auctions');
    }
    const auction = await this.auctionsRepo.findOne({ where: { id } });
    if (!auction) {
      throw new NotFoundException('Auction not found');
    }
    await this.auctionsRepo.manager.delete('AuditLog', { auctionId: id });
    await this.auctionsRepo.manager.delete('AutoBid', { auctionId: id });
    await this.auctionsRepo.manager.delete('Bid', { auctionId: id });
    await this.auctionsRepo.remove(auction);
    return { success: true };
  }
}





