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
exports.BidsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const bid_entity_1 = require("./entities/bid.entity");
const auto_bid_entity_1 = require("./entities/auto-bid.entity");
const auction_entity_1 = require("../auctions/entities/auction.entity");
const audit_service_1 = require("../audit/audit.service");
const audit_log_entity_1 = require("../audit/entities/audit-log.entity");
const bid_increment_util_1 = require("./bid-increment.util");
const auction_gateway_1 = require("../gateway/auction.gateway");
let BidsService = class BidsService {
    bidsRepo;
    autoBidsRepo;
    auctionsRepo;
    dataSource;
    auditService;
    auctionGateway;
    constructor(bidsRepo, autoBidsRepo, auctionsRepo, dataSource, auditService, auctionGateway) {
        this.bidsRepo = bidsRepo;
        this.autoBidsRepo = autoBidsRepo;
        this.auctionsRepo = auctionsRepo;
        this.dataSource = dataSource;
        this.auditService = auditService;
        this.auctionGateway = auctionGateway;
    }
    async placeBid(auctionId, bidder, dto) {
        const maxRetries = 3;
        let attempt = 0;
        while (attempt < maxRetries) {
            try {
                return await this.executePlaceBid(auctionId, bidder, dto);
            }
            catch (err) {
                attempt++;
                const isDeadlockOrTimeout = err?.code === '40P01' ||
                    err?.code === '40001' ||
                    err?.code === '55P03';
                const isOptimistic = err?.name === 'OptimisticLockVersionMismatchError';
                if (isDeadlockOrTimeout || isOptimistic) {
                    if (attempt >= maxRetries) {
                        throw new common_1.ConflictException({
                            message: 'High traffic, please try again.',
                            code: 'BID_CONFLICT',
                        });
                    }
                    await new Promise((r) => setTimeout(r, 50 * attempt));
                }
                else if (err?.code === '23505' && dto.idempotencyKey) {
                    const existing = await this.bidsRepo.findOne({
                        where: { idempotencyKey: dto.idempotencyKey, auctionId, bidderId: bidder.id },
                    });
                    if (existing) {
                        return existing;
                    }
                    throw err;
                }
                else {
                    throw err;
                }
            }
        }
        throw new common_1.ConflictException({
            message: 'High traffic, please try again.',
            code: 'BID_CONFLICT',
        });
    }
    async executePlaceBid(auctionId, bidder, dto) {
        const events = [];
        const bid = await this.dataSource.transaction(async (manager) => {
            await manager.query(`SET LOCAL lock_timeout = '5000'`);
            const auction = await manager.findOne(auction_entity_1.Auction, {
                where: { id: auctionId },
                lock: { mode: 'pessimistic_write' },
            });
            if (dto.idempotencyKey) {
                const existing = await manager.findOne(bid_entity_1.Bid, {
                    where: { idempotencyKey: dto.idempotencyKey, auctionId, bidderId: bidder.id },
                });
                if (existing) {
                    return existing;
                }
            }
            if (!auction)
                throw new common_1.NotFoundException('Auction not found');
            if (auction.status !== auction_entity_1.AuctionStatus.LIVE) {
                await this.auditService.log({
                    eventType: audit_log_entity_1.AuditEventType.BID_REJECTED,
                    auctionId,
                    actorId: bidder.id,
                    actorName: bidder.name,
                    metadata: { reason: 'Auction not live', status: auction.status },
                }, manager);
                throw new common_1.BadRequestException(`Auction is not live (status: ${auction.status})`);
            }
            const now = new Date();
            if (now > auction.endTime) {
                await this.auditService.log({
                    eventType: audit_log_entity_1.AuditEventType.BID_REJECTED,
                    auctionId,
                    actorId: bidder.id,
                    actorName: bidder.name,
                    metadata: { reason: 'Auction has ended' },
                }, manager);
                throw new common_1.BadRequestException('Auction has already ended');
            }
            const minimumBid = (0, bid_increment_util_1.calculateMinimumNextBid)(Number(auction.currentPrice));
            if (dto.amount < minimumBid) {
                await this.auditService.log({
                    eventType: audit_log_entity_1.AuditEventType.BID_REJECTED,
                    auctionId,
                    actorId: bidder.id,
                    actorName: bidder.name,
                    metadata: {
                        reason: 'Bid below minimum',
                        bidAmount: dto.amount,
                        minimumRequired: minimumBid,
                    },
                }, manager);
                throw new common_1.BadRequestException(`Bid must be at least Rs. ${minimumBid}. Current price: Rs. ${auction.currentPrice}`);
            }
            const previousLeader = auction.leadingBidderId;
            if (previousLeader === bidder.id) {
                throw new common_1.ConflictException({
                    message: 'You are already the leading bidder',
                    code: 'ALREADY_LEADING',
                });
            }
            const bid = manager.create(bid_entity_1.Bid, {
                amount: dto.amount,
                type: bid_entity_1.BidType.MANUAL,
                auctionId,
                bidderId: bidder.id,
                bidderName: bidder.name,
                idempotencyKey: dto.idempotencyKey,
            });
            await manager.save(bid);
            auction.currentPrice = dto.amount;
            auction.leadingBidderId = bidder.id;
            auction.leadingBidderName = bidder.name;
            const secondsRemaining = (auction.endTime.getTime() - now.getTime()) / 1000;
            let extended = false;
            if (secondsRemaining <= auction.antiSnipingDuration &&
                auction.extensionCount < auction.maxExtensions) {
                const newEndTime = new Date(auction.endTime.getTime() + auction.extensionDuration * 1000);
                auction.endTime = newEndTime;
                auction.extensionCount += 1;
                extended = true;
                await this.auditService.log({
                    eventType: audit_log_entity_1.AuditEventType.AUCTION_EXTENDED,
                    auctionId,
                    actorId: bidder.id,
                    actorName: bidder.name,
                    metadata: {
                        newEndTime,
                        extensionCount: auction.extensionCount,
                        triggeredBy: bidder.id,
                    },
                }, manager);
            }
            await manager.save(auction);
            await this.auditService.log({
                eventType: audit_log_entity_1.AuditEventType.BID_PLACED,
                auctionId,
                actorId: bidder.id,
                actorName: bidder.name,
                metadata: { amount: dto.amount, type: 'MANUAL' },
            }, manager);
            const aliasMap = await this.getAliasMap(auctionId, manager);
            const bidderAlias = aliasMap.get(bidder.id) || 'Bidder';
            events.push(() => {
                this.auctionGateway.emitBidPlaced(auctionId, {
                    bidId: bid.id,
                    amount: dto.amount,
                    bidderName: bidderAlias,
                    currentPrice: dto.amount,
                    leadingBidderName: bidderAlias,
                    placedAt: bid.placedAt,
                    type: 'MANUAL',
                });
                if (extended) {
                    this.auctionGateway.emitAuctionExtended(auctionId, {
                        newEndTime: auction.endTime,
                        extensionCount: auction.extensionCount,
                    });
                }
            });
            await this.processAutoBids(auctionId, manager, events);
            const finalAuction = await manager.findOne(auction_entity_1.Auction, { where: { id: auctionId } });
            if (previousLeader && finalAuction && finalAuction.leadingBidderId !== previousLeader) {
                await this.auditService.log({
                    eventType: audit_log_entity_1.AuditEventType.LEADER_CHANGED,
                    auctionId,
                    actorId: finalAuction.leadingBidderId,
                    actorName: finalAuction.leadingBidderName,
                    metadata: { previousLeader, newLeader: finalAuction.leadingBidderId },
                }, manager);
            }
            return bid;
        });
        events.forEach((fn) => fn());
        return bid;
    }
    async processAutoBids(auctionId, providedManager, providedEvents) {
        const doWork = async (manager, events) => {
            const auction = await manager.findOne(auction_entity_1.Auction, {
                where: { id: auctionId },
                lock: { mode: 'pessimistic_write' },
            });
            if (!auction || auction.status !== auction_entity_1.AuctionStatus.LIVE)
                return;
            const autoBids = await manager.find(auto_bid_entity_1.AutoBid, {
                where: { auctionId, isActive: true },
                relations: { bidder: true },
            });
            const bidderMaxes = new Map();
            if (auction.leadingBidderId) {
                let leaderTime = Date.now();
                const lastBid = await manager.findOne(bid_entity_1.Bid, {
                    where: { auctionId, bidderId: auction.leadingBidderId },
                    order: { placedAt: 'DESC' }
                });
                if (lastBid && lastBid.placedAt) {
                    leaderTime = new Date(lastBid.placedAt).getTime();
                }
                bidderMaxes.set(auction.leadingBidderId, {
                    userId: auction.leadingBidderId,
                    name: auction.leadingBidderName,
                    maxAmount: Number(auction.currentPrice),
                    time: leaderTime
                });
            }
            for (const ab of autoBids) {
                const abMax = Number(ab.maxAmount);
                const existing = bidderMaxes.get(ab.bidderId);
                if (existing) {
                    existing.maxAmount = Math.max(existing.maxAmount, abMax);
                    if (existing.maxAmount === abMax) {
                        existing.time = ab.updatedAt.getTime();
                    }
                }
                else {
                    bidderMaxes.set(ab.bidderId, {
                        userId: ab.bidderId,
                        name: ab.bidder.name,
                        maxAmount: abMax,
                        time: ab.updatedAt.getTime()
                    });
                }
            }
            if (bidderMaxes.size === 0)
                return;
            const currentPrice = Number(auction.currentPrice);
            if (bidderMaxes.size === 1) {
                const singleUser = Array.from(bidderMaxes.values())[0];
                if (singleUser.userId === auction.leadingBidderId)
                    return;
                if (singleUser.maxAmount >= currentPrice) {
                    const bid = manager.create(bid_entity_1.Bid, {
                        amount: currentPrice,
                        type: bid_entity_1.BidType.AUTO,
                        auctionId,
                        bidderId: singleUser.userId,
                        bidderName: singleUser.name,
                    });
                    await manager.save(bid);
                    auction.currentPrice = currentPrice;
                    auction.leadingBidderId = singleUser.userId;
                    auction.leadingBidderName = singleUser.name;
                    await manager.save(auction);
                    await this.auditService.log({
                        eventType: audit_log_entity_1.AuditEventType.AUTO_BID_PLACED,
                        auctionId,
                        actorId: singleUser.userId,
                        actorName: singleUser.name,
                        metadata: { amount: currentPrice },
                    }, manager);
                    const aliasMap = await this.getAliasMap(auctionId, manager);
                    const alias = aliasMap.get(singleUser.userId) || 'Bidder';
                    events.push(() => {
                        this.auctionGateway.emitBidPlaced(auctionId, {
                            bidId: bid.id,
                            amount: currentPrice,
                            bidderName: alias,
                            currentPrice: currentPrice,
                            leadingBidderName: alias,
                            placedAt: bid.placedAt,
                            type: 'AUTO',
                        });
                    });
                }
                return;
            }
            const sorted = Array.from(bidderMaxes.values()).sort((a, b) => {
                if (b.maxAmount !== a.maxAmount)
                    return b.maxAmount - a.maxAmount;
                return a.time - b.time;
            });
            const winner = sorted[0];
            const challenger = sorted[1];
            let newPrice = currentPrice;
            if (winner.maxAmount > challenger.maxAmount) {
                const challengerInc = (0, bid_increment_util_1.calculateMinimumIncrement)(challenger.maxAmount);
                const competitorMinRequired = challenger.maxAmount + challengerInc;
                newPrice = Math.min(winner.maxAmount, competitorMinRequired);
            }
            else {
                newPrice = winner.maxAmount;
            }
            newPrice = Math.max(currentPrice, newPrice);
            if (winner.userId === auction.leadingBidderId && newPrice === currentPrice) {
                return;
            }
            const bid = manager.create(bid_entity_1.Bid, {
                amount: newPrice,
                type: bid_entity_1.BidType.AUTO,
                auctionId,
                bidderId: winner.userId,
                bidderName: winner.name,
            });
            await manager.save(bid);
            auction.currentPrice = newPrice;
            auction.leadingBidderId = winner.userId;
            auction.leadingBidderName = winner.name;
            const now = new Date();
            const secondsRemaining = (auction.endTime.getTime() - now.getTime()) / 1000;
            let extended = false;
            if (secondsRemaining <= auction.antiSnipingDuration &&
                auction.extensionCount < auction.maxExtensions) {
                auction.endTime = new Date(auction.endTime.getTime() + auction.extensionDuration * 1000);
                auction.extensionCount += 1;
                extended = true;
            }
            await manager.save(auction);
            await this.auditService.log({
                eventType: audit_log_entity_1.AuditEventType.AUTO_BID_PLACED,
                auctionId,
                actorId: winner.userId,
                actorName: winner.name,
                metadata: { amount: newPrice },
            }, manager);
            const aliasMap = await this.getAliasMap(auctionId, manager);
            const winnerAlias = aliasMap.get(winner.userId) || 'Bidder';
            events.push(() => {
                this.auctionGateway.emitBidPlaced(auctionId, {
                    bidId: bid.id,
                    amount: newPrice,
                    bidderName: winnerAlias,
                    currentPrice: newPrice,
                    leadingBidderName: winnerAlias,
                    placedAt: bid.placedAt,
                    type: 'AUTO',
                });
                if (extended) {
                    this.auctionGateway.emitAuctionExtended(auctionId, {
                        newEndTime: auction.endTime,
                        extensionCount: auction.extensionCount,
                    });
                }
            });
        };
        if (providedManager && providedEvents) {
            await doWork(providedManager, providedEvents);
        }
        else {
            const events = [];
            await this.dataSource.transaction(async (manager) => {
                await manager.query(`SET LOCAL lock_timeout = '5000'`);
                await doWork(manager, events);
            });
            events.forEach((fn) => fn());
        }
    }
    async setAutoBid(auctionId, bidder, dto) {
        const events = [];
        await this.dataSource.transaction(async (manager) => {
            await manager.query(`SET LOCAL lock_timeout = '5000'`);
            const auction = await manager.findOne(auction_entity_1.Auction, {
                where: { id: auctionId },
                lock: { mode: 'pessimistic_write' },
            });
            if (!auction)
                throw new common_1.NotFoundException('Auction not found');
            if (auction.status !== auction_entity_1.AuctionStatus.LIVE &&
                auction.status !== auction_entity_1.AuctionStatus.SCHEDULED) {
                throw new common_1.BadRequestException('Cannot set auto-bid on this auction');
            }
            const currentPrice = Number(auction.currentPrice);
            const minNext = currentPrice + (0, bid_increment_util_1.calculateMinimumIncrement)(currentPrice);
            if (dto.maxAmount < minNext) {
                throw new common_1.BadRequestException(`Auto-bid maximum (Rs. ${dto.maxAmount}) must be at least the minimum next bid (Rs. ${minNext})`);
            }
            const previousLeader = auction.leadingBidderId;
            let autoBid = await manager.findOne(auto_bid_entity_1.AutoBid, {
                where: { auctionId, bidderId: bidder.id },
            });
            if (autoBid) {
                autoBid.maxAmount = dto.maxAmount;
                autoBid.isActive = true;
            }
            else {
                autoBid = manager.create(auto_bid_entity_1.AutoBid, {
                    auctionId,
                    bidderId: bidder.id,
                    maxAmount: dto.maxAmount,
                    isActive: true,
                });
            }
            await manager.save(autoBid);
            await this.auditService.log({
                eventType: audit_log_entity_1.AuditEventType.AUTO_BID_CONFIGURED,
                auctionId,
                actorId: bidder.id,
                actorName: bidder.name,
                metadata: { status: 'CONFIGURED' },
            }, manager);
            if (auction.status === auction_entity_1.AuctionStatus.LIVE) {
                await this.processAutoBids(auctionId, manager, events);
            }
            const finalAuction = await manager.findOne(auction_entity_1.Auction, { where: { id: auctionId } });
            if (previousLeader && finalAuction && finalAuction.leadingBidderId !== previousLeader) {
                await this.auditService.log({
                    eventType: audit_log_entity_1.AuditEventType.LEADER_CHANGED,
                    auctionId,
                    actorId: finalAuction.leadingBidderId,
                    actorName: finalAuction.leadingBidderName,
                    metadata: { previousLeader, newLeader: finalAuction.leadingBidderId },
                }, manager);
            }
        });
        events.forEach((fn) => fn());
        return { message: 'Auto-bid configured successfully' };
    }
    async getBidHistory(auctionId, user) {
        const auction = await this.auctionsRepo.findOne({
            where: { id: auctionId },
        });
        if (!auction)
            throw new common_1.NotFoundException('Auction not found');
        const bids = await this.bidsRepo.find({
            where: { auctionId },
            order: { placedAt: 'DESC' },
            take: 100,
        });
        const aliasMap = await this.getAliasMap(auctionId);
        return bids.map((bid) => ({
            id: bid.id,
            amount: bid.amount,
            bidderName: aliasMap.get(bid.bidderId) || 'Bidder',
            isYou: user ? bid.bidderId === user.id : false,
            type: bid.type,
            placedAt: bid.placedAt,
        }));
    }
    async getMyAutoBid(auctionId, userId) {
        const autoBid = await this.autoBidsRepo.findOne({
            where: { auctionId, bidderId: userId },
        });
        if (!autoBid)
            return null;
        return {
            id: autoBid.id,
            maxAmount: autoBid.maxAmount,
            isActive: autoBid.isActive,
            auctionId: autoBid.auctionId,
        };
    }
    async getAliasMap(auctionId, providedManager) {
        const runner = providedManager || this.bidsRepo.manager;
        const bidderOrdering = await runner.query(`SELECT "bidderId" FROM bids WHERE "auctionId" = $1 GROUP BY "bidderId" ORDER BY MIN("placedAt") ASC`, [auctionId]);
        const map = new Map();
        bidderOrdering.forEach((row, i) => {
            map.set(row.bidderId, `Bidder ${i + 1}`);
        });
        return map;
    }
};
exports.BidsService = BidsService;
exports.BidsService = BidsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(bid_entity_1.Bid)),
    __param(1, (0, typeorm_1.InjectRepository)(auto_bid_entity_1.AutoBid)),
    __param(2, (0, typeorm_1.InjectRepository)(auction_entity_1.Auction)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource,
        audit_service_1.AuditService,
        auction_gateway_1.AuctionGateway])
], BidsService);
//# sourceMappingURL=bids.service.js.map