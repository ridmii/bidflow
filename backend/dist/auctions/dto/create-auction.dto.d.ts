import { AuctionStatus } from '../entities/auction.entity';
export declare class CreateAuctionDto {
    status?: AuctionStatus;
    title: string;
    description: string;
    startingPrice: number;
    reservePrice?: number;
    startTime: string;
    endTime: string;
    minimumBidIncrement?: number;
    antiSnipingDuration?: number;
    extensionDuration?: number;
    maxExtensions?: number;
}
export declare class UpdateAuctionDto {
    title?: string;
    description?: string;
    startTime?: string;
    endTime?: string;
    status?: AuctionStatus;
}
