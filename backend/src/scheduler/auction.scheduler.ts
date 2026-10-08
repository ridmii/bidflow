import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, In } from 'typeorm';
import { Auction, AuctionStatus } from '../auctions/entities/auction.entity';
import { AuctionsService } from '../auctions/auctions.service';
import { AuctionGateway } from '../gateway/auction.gateway';
import { AuditService } from '../audit/audit.service';
import { AuditEventType } from '../audit/entities/audit-log.entity';

@Injectable()
export class AuctionScheduler {
  private readonly logger = new Logger(AuctionScheduler.name);

  constructor(
    @InjectRepository(Auction) private auctionsRepo: Repository<Auction>,
    private auctionsService: AuctionsService,
    private auctionGateway: AuctionGateway,
    private auditService: AuditService,
  ) {}

  /**
   * Every 30 seconds: Start SCHEDULED auctions whose startTime has passed
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async startScheduledAuctions() {
    const now = new Date();
    const auctions = await this.auctionsRepo.find({
      where: {
        status: AuctionStatus.SCHEDULED,
        startTime: LessThanOrEqual(now),
      },
    });

    for (const auction of auctions) {
      try {
        auction.status = AuctionStatus.LIVE;
        await this.auctionsRepo.save(auction);

        await this.auditService.log({
          eventType: AuditEventType.AUCTION_STARTED,
          auctionId: auction.id,
          metadata: { startTime: auction.startTime },
        });

        this.auctionGateway.emitAuctionStarted(auction.id, {
          auctionId: auction.id,
          title: auction.title,
          startTime: auction.startTime,
          endTime: auction.endTime,
          currentPrice: auction.currentPrice,
        });

        this.logger.log(`Started auction: ${auction.id} - ${auction.title}`);
      } catch (err) {
        this.logger.error(`Failed to start auction ${auction.id}: ${err}`);
      }
    }
  }

  /**
   * Every 15 seconds: Close LIVE auctions whose endTime has passed
   */
  @Cron('*/15 * * * * *')
  async closeExpiredAuctions() {
    const now = new Date();
    const auctions = await this.auctionsRepo.find({
      where: {
        status: AuctionStatus.LIVE,
        endTime: LessThanOrEqual(now),
        isClosing: false,
      },
    });

    for (const auction of auctions) {
      try {
        this.logger.log(`Closing auction: ${auction.id} - ${auction.title}`);
        await this.auctionsService.closeAuction(auction.id);
      } catch (err) {
        this.logger.error(`Failed to close auction ${auction.id}: ${err}`);
      }
    }
  }
}
