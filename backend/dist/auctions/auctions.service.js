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
exports.AuctionsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const auction_entity_1 = require("./entities/auction.entity");
const audit_service_1 = require("../audit/audit.service");
const audit_log_entity_1 = require("../audit/entities/audit-log.entity");
const auction_gateway_1 = require("../gateway/auction.gateway");
const user_entity_1 = require("../users/entities/user.entity");
const bid_increment_util_1 = require("../bids/bid-increment.util");
let AuctionsService = class AuctionsService {
    auctionsRepo;
    dataSource;
    auditService;
    auctionGateway;
    constructor(auctionsRepo, dataSource, auditService, auctionGateway) {
        this.auctionsRepo = auctionsRepo;
        this.dataSource = dataSource;
        this.auditService = auditService;
        this.auctionGateway = auctionGateway;
    }
    async create(user, dto) {
        if (user.role !== user_entity_1.UserRole.ADMIN) {
            throw new common_1.ForbiddenException('Only admins can create auctions');
        }
        const startTime = new Date(dto.startTime);
        const endTime = new Date(dto.endTime);
        if (startTime >= endTime) {
            throw new common_1.BadRequestException('End time must be after start time');
        }
        const now = new Date();
        const status = startTime <= now ? auction_entity_1.AuctionStatus.SCHEDULED : auction_entity_1.AuctionStatus.DRAFT;
        const auction = this.auctionsRepo.create({
            title: dto.title,
            description: dto.description,
            startingPrice: dto.startingPrice,
            reservePrice: dto.reservePrice,
            currentPrice: dto.startingPrice,
            startTime,
            endTime,
            minimumBidIncrement: dto.minimumBidIncrement || 500,
            antiSnipingDuration: dto.antiSnipingDuration ?? 120,
            extensionDuration: dto.extensionDuration ?? 120,
            maxExtensions: dto.maxExtensions ?? 3,
            status: dto.status || (startTime <= now ? auction_entity_1.AuctionStatus.SCHEDULED : auction_entity_1.AuctionStatus.DRAFT),
            createdById: user.id,
        });
        const saved = await this.auctionsRepo.save(auction);
        await this.auditService.log({
            eventType: audit_log_entity_1.AuditEventType.AUCTION_CREATED,
            auctionId: saved.id,
            actorId: user.id,
            actorName: user.name,
            metadata: { title: dto.title, startingPrice: dto.startingPrice },
        });
        return saved;
    }
    async findAll(status) {
        const query = this.auctionsRepo.createQueryBuilder('auction');
        if (status) {
            query.where('auction.status = :status', { status });
        }
        query.orderBy('auction.startTime', 'DESC');
        const auctions = await query.getMany();
        return auctions.map((a) => this.sanitizeAuction(a));
    }
    async findOne(id) {
        const auction = await this.auctionsRepo.findOne({ where: { id } });
        if (!auction)
            throw new common_1.NotFoundException('Auction not found');
        return this.sanitizeAuction(auction);
    }
    async update(id, user, dto) {
        if (user.role !== user_entity_1.UserRole.ADMIN) {
            throw new common_1.ForbiddenException('Only admins can update auctions');
        }
        const auction = await this.auctionsRepo.findOne({ where: { id } });
        if (!auction)
            throw new common_1.NotFoundException('Auction not found');
        if (auction.status === auction_entity_1.AuctionStatus.LIVE ||
            auction.status === auction_entity_1.AuctionStatus.COMPLETED) {
            throw new common_1.BadRequestException('Cannot edit a live or completed auction');
        }
        Object.assign(auction, dto);
        const saved = await this.auctionsRepo.save(auction);
        return this.sanitizeAuction(saved);
    }
    async scheduleAuction(id, user) {
        if (user.role !== user_entity_1.UserRole.ADMIN) {
            throw new common_1.ForbiddenException('Only admins can schedule auctions');
        }
        const auction = await this.auctionsRepo.findOne({ where: { id } });
        if (!auction)
            throw new common_1.NotFoundException('Auction not found');
        if (auction.status !== auction_entity_1.AuctionStatus.DRAFT) {
            throw new common_1.BadRequestException('Only draft auctions can be scheduled');
        }
        auction.status = auction_entity_1.AuctionStatus.SCHEDULED;
        const saved = await this.auctionsRepo.save(auction);
        await this.auditService.log({
            eventType: audit_log_entity_1.AuditEventType.AUCTION_SCHEDULED,
            auctionId: id,
            actorId: user.id,
            actorName: user.name,
            metadata: { startTime: auction.startTime },
        });
        return this.sanitizeAuction(saved);
    }
    async cancelAuction(id, user) {
        if (user.role !== user_entity_1.UserRole.ADMIN) {
            throw new common_1.ForbiddenException('Only admins can cancel auctions');
        }
        const auction = await this.auctionsRepo.findOne({ where: { id } });
        if (!auction)
            throw new common_1.NotFoundException('Auction not found');
        if (auction.status === auction_entity_1.AuctionStatus.COMPLETED) {
            throw new common_1.BadRequestException('Cannot cancel a completed auction');
        }
        auction.status = auction_entity_1.AuctionStatus.CANCELLED;
        const saved = await this.auctionsRepo.save(auction);
        await this.auditService.log({
            eventType: audit_log_entity_1.AuditEventType.AUCTION_CANCELLED,
            auctionId: id,
            actorId: user.id,
            actorName: user.name,
            metadata: {},
        });
        this.auctionGateway.emitAuctionEnded(id, {
            status: auction_entity_1.AuctionStatus.CANCELLED,
            message: 'Auction has been cancelled',
        });
        return this.sanitizeAuction(saved);
    }
    async closeAuction(id) {
        await this.dataSource.transaction(async (manager) => {
            const auction = await manager.findOne(auction_entity_1.Auction, {
                where: { id },
            });
            if (!auction)
                return;
            if (auction.status !== auction_entity_1.AuctionStatus.LIVE)
                return;
            if (auction.isClosing)
                return;
            const now = new Date();
            if (now < auction.endTime)
                return;
            auction.isClosing = true;
            await manager.save(auction);
            const highestBid = await manager
                .createQueryBuilder(require('../bids/entities/bid.entity').Bid, 'bid')
                .where('bid.auctionId = :id', { id })
                .orderBy('bid.amount', 'DESC')
                .addOrderBy('bid.placedAt', 'ASC')
                .getOne();
            const currentPrice = Number(auction.currentPrice);
            const reservePrice = auction.reservePrice
                ? Number(auction.reservePrice)
                : null;
            let finalStatus;
            if (!highestBid) {
                finalStatus = auction_entity_1.AuctionStatus.RESERVE_NOT_MET;
            }
            else if (reservePrice && currentPrice < reservePrice) {
                finalStatus = auction_entity_1.AuctionStatus.RESERVE_NOT_MET;
                await this.auditService.log({
                    eventType: audit_log_entity_1.AuditEventType.RESERVE_NOT_MET,
                    auctionId: id,
                    metadata: {
                        highestBid: currentPrice,
                        reservePrice,
                    },
                });
            }
            else {
                finalStatus = auction_entity_1.AuctionStatus.COMPLETED;
                auction.winnerId = highestBid.bidderId;
                auction.winnerName = highestBid.bidderName;
                auction.winningBidAmount = highestBid.amount;
                await this.auditService.log({
                    eventType: audit_log_entity_1.AuditEventType.WINNER_SELECTED,
                    auctionId: id,
                    actorId: highestBid.bidderId,
                    actorName: highestBid.bidderName,
                    metadata: {
                        winnerName: highestBid.bidderName,
                        amount: highestBid.amount,
                    },
                });
            }
            auction.status = finalStatus;
            auction.isClosing = false;
            await manager.save(auction);
            await this.auditService.log({
                eventType: audit_log_entity_1.AuditEventType.AUCTION_ENDED,
                auctionId: id,
                metadata: {
                    status: finalStatus,
                    finalPrice: currentPrice,
                    winnerId: auction.winnerId,
                },
            });
            this.auctionGateway.emitAuctionEnded(id, {
                status: finalStatus,
                winnerId: auction.winnerId,
                winnerName: auction.winnerName,
                winningBidAmount: auction.winningBidAmount,
                finalPrice: currentPrice,
            });
        });
    }
    async getAuctionAuditLog(id) {
        const auction = await this.auctionsRepo.findOne({ where: { id } });
        if (!auction)
            throw new common_1.NotFoundException('Auction not found');
        return this.auditService.getAuctionLogs(id);
    }
    async getMinimumNextBid(id) {
        const auction = await this.auctionsRepo.findOne({ where: { id } });
        if (!auction)
            throw new common_1.NotFoundException('Auction not found');
        const minimumBid = (0, bid_increment_util_1.calculateMinimumNextBid)(Number(auction.currentPrice));
        return {
            currentPrice: auction.currentPrice,
            minimumNextBid: minimumBid,
            minimumIncrement: minimumBid - Number(auction.currentPrice),
        };
    }
    sanitizeAuction(auction) {
        const { reservePrice, ...publicAuction } = auction;
        return {
            ...publicAuction,
            hasReservePrice: reservePrice != null,
        };
    }
    async deleteAuction(id, user) {
        if (user.role !== 'ADMIN') {
            throw new common_1.NotFoundException('Only admins can delete auctions');
        }
        const auction = await this.auctionsRepo.findOne({ where: { id } });
        if (!auction) {
            throw new common_1.NotFoundException('Auction not found');
        }
        await this.auctionsRepo.manager.delete('AuditLog', { auctionId: id });
        await this.auctionsRepo.manager.delete('AutoBid', { auctionId: id });
        await this.auctionsRepo.manager.delete('Bid', { auctionId: id });
        await this.auctionsRepo.remove(auction);
        return { success: true };
    }
};
exports.AuctionsService = AuctionsService;
exports.AuctionsService = AuctionsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(auction_entity_1.Auction)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.DataSource,
        audit_service_1.AuditService,
        auction_gateway_1.AuctionGateway])
], AuctionsService);
//# sourceMappingURL=auctions.service.js.map