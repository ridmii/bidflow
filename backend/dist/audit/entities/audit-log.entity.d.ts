import { Auction } from '../../auctions/entities/auction.entity';
export declare enum AuditEventType {
    AUCTION_CREATED = "AUCTION_CREATED",
    AUCTION_STARTED = "AUCTION_STARTED",
    AUCTION_SCHEDULED = "AUCTION_SCHEDULED",
    AUCTION_CANCELLED = "AUCTION_CANCELLED",
    AUCTION_EXTENDED = "AUCTION_EXTENDED",
    AUCTION_ENDED = "AUCTION_ENDED",
    WINNER_SELECTED = "WINNER_SELECTED",
    RESERVE_NOT_MET = "RESERVE_NOT_MET",
    BID_PLACED = "BID_PLACED",
    BID_REJECTED = "BID_REJECTED",
    AUTO_BID_PLACED = "AUTO_BID_PLACED",
    AUTO_BID_CONFIGURED = "AUTO_BID_CONFIGURED",
    LEADER_CHANGED = "LEADER_CHANGED"
}
export declare class AuditLog {
    id: string;
    eventType: AuditEventType;
    auctionId: string;
    actorId: string;
    actorName: string;
    metadata: Record<string, any>;
    auction: Auction;
    createdAt: Date;
}
