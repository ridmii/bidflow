import { Bid } from '../../bids/entities/bid.entity';
import { AutoBid } from '../../bids/entities/auto-bid.entity';
export declare enum UserRole {
    ADMIN = "admin",
    BIDDER = "bidder"
}
export declare class User {
    id: string;
    email: string;
    name: string;
    password: string;
    role: UserRole;
    isActive: boolean;
    bids: Bid[];
    autoBids: AutoBid[];
    createdAt: Date;
    updatedAt: Date;
}
