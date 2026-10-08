import { BidsService } from './bids.service';
import { PlaceBidDto } from './dto/place-bid.dto';
import { SetAutoBidDto } from './dto/set-auto-bid.dto';
export declare class BidsController {
    private readonly bidsService;
    constructor(bidsService: BidsService);
    placeBid(auctionId: string, req: any, dto: PlaceBidDto): Promise<{
        message: string;
        bid: {
            id: string;
            amount: number;
            placedAt: Date;
            auctionId: string;
        };
    }>;
    getBidHistory(auctionId: string): Promise<any[]>;
    setAutoBid(auctionId: string, req: any, dto: SetAutoBidDto): Promise<{
        message: string;
    }>;
    getMyAutoBid(auctionId: string, req: any): Promise<{
        id: string;
        maxAmount: number;
        isActive: boolean;
        auctionId: string;
    }>;
}
