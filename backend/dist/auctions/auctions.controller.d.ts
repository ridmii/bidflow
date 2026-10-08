import { AuctionsService } from './auctions.service';
import { CreateAuctionDto, UpdateAuctionDto } from './dto/create-auction.dto';
import { AuctionStatus } from './entities/auction.entity';
export declare class AuctionsController {
    private readonly auctionsService;
    constructor(auctionsService: AuctionsService);
    findAll(req: any, status?: AuctionStatus): Promise<any[]>;
    findOne(id: string, req: any): Promise<any>;
    getMinimumNextBid(id: string): Promise<any>;
    getAuditLog(id: string, req: any): Promise<any[]>;
    create(req: any, dto: CreateAuctionDto): Promise<any>;
    update(id: string, req: any, dto: UpdateAuctionDto): Promise<any>;
    schedule(id: string, req: any): Promise<any>;
    cancel(id: string, req: any): Promise<any>;
    delete(id: string, req: any): Promise<{
        success: boolean;
    }>;
}
