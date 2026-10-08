"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuctionGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const common_1 = require("@nestjs/common");
let AuctionGateway = class AuctionGateway {
    server;
    logger = new common_1.Logger('AuctionGateway');
    afterInit(server) {
        this.logger.log('WebSocket Gateway initialized');
    }
    handleConnection(client) {
        this.logger.log(`Client connected: ${client.id}`);
    }
    handleDisconnect(client) {
        this.logger.log(`Client disconnected: ${client.id}`);
    }
    handleJoinAuction(data, client) {
        client.join(`auction:${data.auctionId}`);
        this.logger.log(`Client ${client.id} joined auction ${data.auctionId}`);
        return { event: 'joined', auctionId: data.auctionId };
    }
    handleLeaveAuction(data, client) {
        client.leave(`auction:${data.auctionId}`);
        return { event: 'left', auctionId: data.auctionId };
    }
    emitBidPlaced(auctionId, data) {
        this.server.to(`auction:${auctionId}`).emit('bid-placed', {
            auctionId,
            ...data,
        });
    }
    emitAuctionExtended(auctionId, data) {
        this.server.to(`auction:${auctionId}`).emit('auction-extended', {
            auctionId,
            ...data,
        });
    }
    emitAuctionStarted(auctionId, data) {
        this.server.emit('auction-started', { auctionId, ...data });
    }
    emitAuctionEnded(auctionId, data) {
        this.server.to(`auction:${auctionId}`).emit('auction-ended', {
            auctionId,
            ...data,
        });
    }
};
exports.AuctionGateway = AuctionGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], AuctionGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('join-auction'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], AuctionGateway.prototype, "handleJoinAuction", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('leave-auction'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], AuctionGateway.prototype, "handleLeaveAuction", null);
exports.AuctionGateway = AuctionGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: process.env.FRONTEND_URL || 'http://localhost:5173',
            credentials: true,
        },
        namespace: '/auction',
    })
], AuctionGateway);
//# sourceMappingURL=auction.gateway.js.map