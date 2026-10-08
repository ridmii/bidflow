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
        if (dto.idempotencyKey) {
            const existing = await this.bidsRepo.findOne({
                where: { idempotencyKey: dto.idempotencyKey, auctionId },
            });
            if (existing) {
                throw new common_1.ConflictException('Duplicate bid request detected');
            }
        }
        return await this.dataSource.transaction(async (manager) => {
            const auction = await manager.findOne(auction_entity_1.Auction, {
                where: { id: auctionId },
                lock: { mode: 'pessimistic_write' },
            });
            if (!auction)
                throw new common_1.NotFoundException('Auction not found');
            if (auction.status !== auction_entity_1.AuctionStatus.LIVE) {
                await this.auditService.log({
                    eventType: audit_log_entity_1.AuditEventType.BID_REJECTED,
                    auctionId,
                    actorId: bidder.id,
                    actorName: bidder.name,
                    metadata: { reason: 'Auction not live', status: auction.status },
                });
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
                });
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
                });
                throw new common_1.BadRequestException(`Bid must be at least Rs. ${minimumBid}. Current price: Rs. ${auction.currentPrice}`);
            }
            const previousLeader = auction.leadingBidderId;
            const bid = manager.create(bid_entity_1.Bid, {
                amount: dto.amount,
                type: bid_entity_1.BidType.MANUAL,
                auctionId,
                bidderId: bidder.id,
                bidderName: bidder.name,
                idempotencyKey: dto.idempotencyKey,
            });
            await manager.save(bid);
            const wasLeaderChanged = previousLeader !== bidder.id;
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
                });
            }
            await manager.save(auction);
            await this.auditService.log({
                eventType: audit_log_entity_1.AuditEventType.BID_PLACED,
                auctionId,
                actorId: bidder.id,
                actorName: bidder.name,
                metadata: { amount: dto.amount, type: 'MANUAL' },
            });
            if (wasLeaderChanged && previousLeader) {
                await this.auditService.log({
                    eventType: audit_log_entity_1.AuditEventType.LEADER_CHANGED,
                    auctionId,
                    actorId: bidder.id,
                    actorName: bidder.name,
                    metadata: { previousLeader, newLeader: bidder.id },
                });
            }
            process.nextTick(() => {
                this.auctionGateway.emitBidPlaced(auctionId, {
                    bidId: bid.id,
                    amount: dto.amount,
                    bidderId: bidder.id,
                    bidderName: bidder.name,
                    currentPrice: dto.amount,
                    leadingBidderId: bidder.id,
                    leadingBidderName: bidder.name,
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
            process.nextTick(() => this.processAutoBids(auctionId, bidder.id));
            return bid;
        });
    }
    async processAutoBids(auctionId, currentWinnerId) {
        return await this.dataSource.transaction(async (manager) => {
            const auction = await manager.findOne(auction_entity_1.Auction, {
                where: { id: auctionId },
                lock: { mode: 'pessimistic_write' },
            });
            if (!auction || auction.status !== auction_entity_1.AuctionStatus.LIVE)
                return;
            const currentPrice = Number(auction.currentPrice);
            const minimumNextBid = (0, bid_increment_util_1.calculateMinimumNextBid)(currentPrice);
            const autoBids = await manager.find(auto_bid_entity_1.AutoBid, {
                where: { auctionId, isActive: true },
                order: { maxAmount: 'DESC' },
                relations: { bidder: true },
            });
            const competitors = autoBids.filter((ab) => ab.bidderId !== currentWinnerId);
            if (competitors.length === 0)
                return;
            const bestCompetitor = competitors[0];
            if (Number(bestCompetitor.maxAmount) < minimumNextBid)
                return;
            const winnerAutoBid = autoBids.find((ab) => ab.bidderId === currentWinnerId);
            let newBidAmount = 0;
            let newWinner = bestCompetitor;
            if (winnerAutoBid) {
                const winnerMax = Number(winnerAutoBid.maxAmount);
                const competitorMax = Number(bestCompetitor.maxAmount);
                if (winnerMax >= competitorMax) {
                    const competitorMinRequired = (0, bid_increment_util_1.calculateMinimumNextBid)(competitorMax);
                    if (competitorMinRequired <= winnerMax) {
                        newBidAmount = Math.min((0, bid_increment_util_1.calculateMinimumNextBid)(currentPrice), competitorMinRequired);
                        newWinner = winnerAutoBid;
                        return;
                    }
                    else {
                        newBidAmount = winnerMax;
                        newWinner = winnerAutoBid;
                    }
                }
                else {
                    newBidAmount = Math.min(winnerMax + (0, bid_increment_util_1.calculateMinimumIncrement)(winnerMax), competitorMax);
                    newWinner = bestCompetitor;
                }
            }
            else {
                newBidAmount = minimumNextBid;
                newWinner = bestCompetitor;
            }
            if (newBidAmount > Number(bestCompetitor.maxAmount))
                return;
            const previousLeader = auction.leadingBidderId;
            const bid = manager.create(bid_entity_1.Bid, {
                amount: newBidAmount,
                type: bid_entity_1.BidType.AUTO,
                auctionId,
                bidderId: newWinner.bidderId,
                bidderName: newWinner.bidder.name,
            });
            await manager.save(bid);
            auction.currentPrice = newBidAmount;
            auction.leadingBidderId = newWinner.bidderId;
            auction.leadingBidderName = newWinner.bidder.name;
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
                actorId: newWinner.bidderId,
                actorName: newWinner.bidder.name,
                metadata: { amount: newBidAmount },
            });
            if (previousLeader !== newWinner.bidderId) {
                await this.auditService.log({
                    eventType: audit_log_entity_1.AuditEventType.LEADER_CHANGED,
                    auctionId,
                    actorId: newWinner.bidderId,
                    actorName: newWinner.bidder.name,
                    metadata: { previousLeader, newLeader: newWinner.bidderId },
                });
            }
            this.auctionGateway.emitBidPlaced(auctionId, {
                bidId: bid.id,
                amount: newBidAmount,
                bidderId: newWinner.bidderId,
                bidderName: newWinner.bidder.name,
                currentPrice: newBidAmount,
                leadingBidderId: newWinner.bidderId,
                leadingBidderName: newWinner.bidder.name,
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
    }
    async setAutoBid(auctionId, bidder, dto) {
        const auction = await this.auctionsRepo.findOne({
            where: { id: auctionId },
        });
        if (!auction)
            throw new common_1.NotFoundException('Auction not found');
        if (auction.status !== auction_entity_1.AuctionStatus.LIVE &&
            auction.status !== auction_entity_1.AuctionStatus.SCHEDULED) {
            throw new common_1.BadRequestException('Cannot set auto-bid on this auction');
        }
        const currentPrice = Number(auction.currentPrice);
        if (dto.maxAmount <= currentPrice) {
            throw new common_1.BadRequestException(`Auto-bid maximum (Rs. ${dto.maxAmount}) must be greater than current price (Rs. ${currentPrice})`);
        }
        let autoBid = await this.autoBidsRepo.findOne({
            where: { auctionId, bidderId: bidder.id },
        });
        if (autoBid) {
            autoBid.maxAmount = dto.maxAmount;
            autoBid.isActive = true;
        }
        else {
            autoBid = this.autoBidsRepo.create({
                auctionId,
                bidderId: bidder.id,
                maxAmount: dto.maxAmount,
                isActive: true,
            });
        }
        await this.autoBidsRepo.save(autoBid);
        await this.auditService.log({
            eventType: audit_log_entity_1.AuditEventType.AUTO_BID_CONFIGURED,
            auctionId,
            actorId: bidder.id,
            actorName: bidder.name,
            metadata: { maxAmount: dto.maxAmount },
        });
        if (auction.status === auction_entity_1.AuctionStatus.LIVE) {
            process.nextTick(() => this.processAutoBids(auctionId, auction.leadingBidderId || ''));
        }
        return { message: 'Auto-bid configured successfully' };
    }
    async getBidHistory(auctionId) {
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
        return bids.map((bid) => ({
            id: bid.id,
            amount: bid.amount,
            bidderName: bid.bidderName,
            bidderId: bid.bidderId,
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