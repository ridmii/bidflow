import { Bid } from '../../bids/entities/bid.entity';
import { AutoBid } from '../../bids/entities/auto-bid.entity';
export declare const UserRole: {
    ADMIN: "ADMIN";
    BIDDER: "BIDDER";
};
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
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
