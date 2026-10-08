import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
  namespace: '/auction',
})
export class AuctionGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private logger = new Logger('AuctionGateway');

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join-auction')
  handleJoinAuction(
    @MessageBody() data: { auctionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`auction:${data.auctionId}`);
    this.logger.log(`Client ${client.id} joined auction ${data.auctionId}`);
    return { event: 'joined', auctionId: data.auctionId };
  }

  @SubscribeMessage('leave-auction')
  handleLeaveAuction(
    @MessageBody() data: { auctionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(`auction:${data.auctionId}`);
    return { event: 'left', auctionId: data.auctionId };
  }

  emitBidPlaced(auctionId: string, data: any) {
    this.server.to(`auction:${auctionId}`).emit('bid-placed', {
      auctionId,
      ...data,
    });
  }

  emitAuctionExtended(auctionId: string, data: any) {
    this.server.to(`auction:${auctionId}`).emit('auction-extended', {
      auctionId,
      ...data,
    });
  }

  emitAuctionStarted(auctionId: string, data: any) {
    this.server.emit('auction-started', { auctionId, ...data });
  }

  emitAuctionEnded(auctionId: string, data: any) {
    this.server.to(`auction:${auctionId}`).emit('auction-ended', {
      auctionId,
      ...data,
    });
  }
}
