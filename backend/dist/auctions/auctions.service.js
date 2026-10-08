"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const clock_service_1 = require("../common/clock.service");
let AuctionsService = class AuctionsService {
    auctionsRepo;
    dataSource;
    auditService;
    auctionGateway;
    clock;
    constructor(auctionsRepo, dataSource, auditService, auctionGateway, clock) {
        this.auctionsRepo = auctionsRepo;
        this.dataSource = dataSource;
        this.auditService = auditService;
        this.auctionGateway = auctionGateway;
        this.clock = clock;
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
        return this.sanitizeAuction(saved, user);
    }
    async findAll(status, user) {
        const query = this.auctionsRepo.createQueryBuilder('auction');
        if (status) {
            query.where('auction.status = :status', { status });
        }
        query.orderBy('auction.startTime', 'DESC');
        const auctions = await query.getMany();
        return auctions.map((a) => this.sanitizeAuction(a, user));
    }
    async findOne(id, user) {
        const auction = await this.auctionsRepo.findOne({ where: { id } });
        if (!auction)
            throw new common_1.NotFoundException('Auction not found');
        return this.sanitizeAuction(auction, user);
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
        return this.sanitizeAuction(saved, user);
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
        return this.sanitizeAuction(saved, user);
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
        return this.sanitizeAuction(saved, user);
    }
    async closeAuction(id) {
        const events = [];
        await this.dataSource.transaction(async (manager) => {
            const now = this.clock.now();
            const claimResult = await manager.query(`UPDATE auctions SET status = 'COMPLETING'
         WHERE id = $1 AND status = 'LIVE' AND "endTime" <= $2`, [id, now]);
            const affected = claimResult[1];
            if (affected !== 1)
                return;
            const auction = await manager.findOne(auction_entity_1.Auction, {
                where: { id },
                lock: { mode: 'pessimistic_write' },
            });
            if (!auction)
                return;
            const { Bid } = await Promise.resolve().then(() => __importStar(require('../bids/entities/bid.entity')));
            const highestBid = await manager
                .createQueryBuilder(Bid, 'bid')
                .where('bid.auctionId = :id', { id })
                .orderBy('bid.amount', 'DESC')
                .addOrderBy('bid.placedAt', 'ASC')
                .getOne();
            const currentPrice = Number(auction.currentPrice);
            const reservePrice = auction.reservePrice ? Number(auction.reservePrice) : null;
            let finalStatus;
            if (!highestBid) {
                finalStatus = auction_entity_1.AuctionStatus.RESERVE_NOT_MET;
            }
            else if (reservePrice && currentPrice < reservePrice) {
                finalStatus = auction_entity_1.AuctionStatus.RESERVE_NOT_MET;
                await this.auditService.log({
                    eventType: audit_log_entity_1.AuditEventType.RESERVE_NOT_MET,
                    auctionId: id,
                    metadata: { highestBid: currentPrice, reservePrice },
                }, manager);
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
                    metadata: { winnerName: highestBid.bidderName, amount: highestBid.amount },
                }, manager);
            }
            auction.status = finalStatus;
            await manager.save(auction);
            await this.auditService.log({
                eventType: audit_log_entity_1.AuditEventType.AUCTION_ENDED,
                auctionId: id,
                metadata: {
                    status: finalStatus,
                    finalPrice: currentPrice,
                    winnerId: auction.winnerId,
                },
            }, manager);
            let winnerAlias = 'Bidder';
            if (auction.winnerId) {
                const bidderOrdering = await manager.query(`SELECT "bidderId" FROM bids WHERE "auctionId" = $1 GROUP BY "bidderId" ORDER BY MIN("placedAt") ASC`, [id]);
                const index = bidderOrdering.findIndex(row => row.bidderId === auction.winnerId);
                if (index !== -1) {
                    winnerAlias = `Bidder ${index + 1}`;
                }
            }
            events.push(() => {
                this.auctionGateway.emitAuctionEnded(id, {
                    status: finalStatus,
                    winnerName: auction.winnerId ? winnerAlias : undefined,
                    winningBidAmount: auction.winningBidAmount,
                    finalPrice: currentPrice,
                });
            });
        });
        events.forEach((fn) => fn());
    }
    async getAuctionAuditLog(id, user) {
        const auction = await this.auctionsRepo.findOne({ where: { id } });
        if (!auction)
            throw new common_1.NotFoundException('Auction not found');
        const logs = await this.auditService.getAuctionLogs(id);
        const isAdmin = user?.role === user_entity_1.UserRole.ADMIN;
        let aliasMap = new Map();
        if (!isAdmin) {
            const { BidsService } = await Promise.resolve().then(() => __importStar(require('../bids/bids.service')));
            const { moduleRef } = await Promise.resolve().then(() => __importStar(require('@nestjs/core')));
            const bidderOrdering = await this.dataSource.query(`SELECT "bidderId" FROM bids WHERE "auctionId" = $1 GROUP BY "bidderId" ORDER BY MIN("placedAt") ASC`, [id]);
            bidderOrdering.forEach((row, i) => {
                aliasMap.set(row.bidderId, `Bidder ${i + 1}`);
            });
        }
        return logs.map(log => {
            const sanitized = { ...log };
            if (!isAdmin) {
                if (sanitized.metadata?.reservePrice !== undefined) {
                    sanitized.metadata = { ...sanitized.metadata };
                    delete sanitized.metadata.reservePrice;
                }
                if (sanitized.actorId) {
                    sanitized.actorName = aliasMap.get(sanitized.actorId) || 'Bidder';
                    sanitized.actorId = aliasMap.get(sanitized.actorId) || 'Bidder';
                }
                if (sanitized.metadata?.winnerName) {
                    sanitized.metadata = { ...sanitized.metadata };
                    sanitized.metadata.winnerName = aliasMap.get(sanitized.metadata.winnerId || sanitized.metadata.winnerName) || 'Bidder';
                }
                if (sanitized.metadata?.winnerId) {
                    sanitized.metadata = { ...sanitized.metadata };
                    sanitized.metadata.winnerId = aliasMap.get(sanitized.metadata.winnerId) || 'Bidder';
                }
            }
            return sanitized;
        });
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
    sanitizeAuction(auction, user) {
        const { reservePrice, ...publicAuction } = auction;
        const isAdmin = user?.role === user_entity_1.UserRole.ADMIN;
        const result = { ...publicAuction, hasReservePrice: reservePrice != null };
        if (isAdmin) {
            result.reservePrice = reservePrice;
        }
        if (auction.status === auction_entity_1.AuctionStatus.COMPLETED || auction.status === auction_entity_1.AuctionStatus.RESERVE_NOT_MET) {
            result.reserveMet = auction.status === auction_entity_1.AuctionStatus.COMPLETED && reservePrice != null;
        }
        return result;
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
        auction_gateway_1.AuctionGateway,
        clock_service_1.ClockService])
], AuctionsService);
//# sourceMappingURL=auctions.service.js.map