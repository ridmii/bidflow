import { Auction } from '../../auctions/entities/auction.entity';
import { User } from '../../users/entities/user.entity';
export declare enum BidType {
    MANUAL = "MANUAL",
    AUTO = "AUTO"
}
export declare class Bid {
    id: string;
    amount: number;
    type: BidType;
    auctionId: string;
    bidderId: string;
    bidderName: string;
    idempotencyKey: string;
    auction: Auction;
    bidder: User;
    placedAt: Date;
}
