import { OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
export declare class AuctionGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    server: Server;
    private logger;
    afterInit(server: Server): void;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    handleJoinAuction(data: {
        auctionId: string;
    }, client: Socket): {
        event: string;
        auctionId: string;
    };
    handleLeaveAuction(data: {
        auctionId: string;
    }, client: Socket): {
        event: string;
        auctionId: string;
    };
    emitBidPlaced(auctionId: string, data: any): void;
    emitAuctionExtended(auctionId: string, data: any): void;
    emitAuctionStarted(auctionId: string, data: any): void;
    emitAuctionEnded(auctionId: string, data: any): void;
}
