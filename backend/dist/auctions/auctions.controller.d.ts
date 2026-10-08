import { AuctionsService } from './auctions.service';
import { CreateAuctionDto, UpdateAuctionDto } from './dto/create-auction.dto';
import { AuctionStatus } from './entities/auction.entity';
export declare class AuctionsController {
    private readonly auctionsService;
    constructor(auctionsService: AuctionsService);
    findAll(status?: AuctionStatus): Promise<any[]>;
    findOne(id: string): Promise<any>;
    getMinimumNextBid(id: string): Promise<any>;
    getAuditLog(id: string): Promise<any[]>;
    create(req: any, dto: CreateAuctionDto): Promise<import("./entities/auction.entity").Auction>;
    update(id: string, req: any, dto: UpdateAuctionDto): Promise<any>;
    schedule(id: string, req: any): Promise<any>;
    cancel(id: string, req: any): Promise<any>;
    delete(id: string, req: any): Promise<{
        success: boolean;
    }>;
}
