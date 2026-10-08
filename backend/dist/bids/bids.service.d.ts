import { DataSource, Repository, EntityManager } from 'typeorm';
import { Bid } from './entities/bid.entity';
import { AutoBid } from './entities/auto-bid.entity';
import { Auction } from '../auctions/entities/auction.entity';
import { PlaceBidDto } from './dto/place-bid.dto';
import { SetAutoBidDto } from './dto/set-auto-bid.dto';
import { AuditService } from '../audit/audit.service';
import { AuctionGateway } from '../gateway/auction.gateway';
import { User } from '../users/entities/user.entity';
export declare class BidsService {
    private bidsRepo;
    private autoBidsRepo;
    private auctionsRepo;
    private dataSource;
    private auditService;
    private auctionGateway;
    constructor(bidsRepo: Repository<Bid>, autoBidsRepo: Repository<AutoBid>, auctionsRepo: Repository<Auction>, dataSource: DataSource, auditService: AuditService, auctionGateway: AuctionGateway);
    placeBid(auctionId: string, bidder: User, dto: PlaceBidDto): Promise<Bid>;
    private executePlaceBid;
    processAutoBids(auctionId: string, providedManager?: EntityManager, providedEvents?: (() => void)[]): Promise<void>;
    setAutoBid(auctionId: string, bidder: User, dto: SetAutoBidDto): Promise<{
        message: string;
    }>;
    getBidHistory(auctionId: string, user?: User): Promise<any[]>;
    getMyAutoBid(auctionId: string, userId: string): Promise<{
        id: string;
        maxAmount: number;
        isActive: boolean;
        auctionId: string;
    }>;
    getAliasMap(auctionId: string, providedManager?: EntityManager): Promise<Map<string, string>>;
}
