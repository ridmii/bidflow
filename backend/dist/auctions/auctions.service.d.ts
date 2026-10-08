import { DataSource, Repository } from 'typeorm';
import { Auction, AuctionStatus } from './entities/auction.entity';
import { CreateAuctionDto, UpdateAuctionDto } from './dto/create-auction.dto';
import { AuditService } from '../audit/audit.service';
import { AuctionGateway } from '../gateway/auction.gateway';
import { User } from '../users/entities/user.entity';
import { ClockService } from '../common/clock.service';
export declare class AuctionsService {
    private auctionsRepo;
    private dataSource;
    private auditService;
    private auctionGateway;
    private clock;
    constructor(auctionsRepo: Repository<Auction>, dataSource: DataSource, auditService: AuditService, auctionGateway: AuctionGateway, clock: ClockService);
    create(user: User, dto: CreateAuctionDto): Promise<any>;
    findAll(status?: AuctionStatus, user?: User): Promise<any[]>;
    findOne(id: string, user?: User): Promise<any>;
    update(id: string, user: User, dto: UpdateAuctionDto): Promise<any>;
    scheduleAuction(id: string, user: User): Promise<any>;
    cancelAuction(id: string, user: User): Promise<any>;
    closeAuction(id: string): Promise<void>;
    getAuctionAuditLog(id: string, user?: User): Promise<any[]>;
    getMinimumNextBid(id: string): Promise<any>;
    private sanitizeAuction;
    deleteAuction(id: string, user: User): Promise<{
        success: boolean;
    }>;
}
