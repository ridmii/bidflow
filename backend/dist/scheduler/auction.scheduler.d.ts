import { Repository } from 'typeorm';
import { Auction } from '../auctions/entities/auction.entity';
import { AuctionsService } from '../auctions/auctions.service';
import { AuctionGateway } from '../gateway/auction.gateway';
import { AuditService } from '../audit/audit.service';
export declare class AuctionScheduler {
    private auctionsRepo;
    private auctionsService;
    private auctionGateway;
    private auditService;
    private readonly logger;
    constructor(auctionsRepo: Repository<Auction>, auctionsService: AuctionsService, auctionGateway: AuctionGateway, auditService: AuditService);
    startScheduledAuctions(): Promise<void>;
    closeExpiredAuctions(): Promise<void>;
}
