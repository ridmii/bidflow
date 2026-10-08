import { Auction } from '../../auctions/entities/auction.entity';
import { User } from '../../users/entities/user.entity';
export declare class AutoBid {
    id: string;
    maxAmount: number;
    isActive: boolean;
    auctionId: string;
    bidderId: string;
    auction: Auction;
    bidder: User;
    createdAt: Date;
    updatedAt: Date;
}
