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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Auction = exports.AuctionStatus = void 0;
const typeorm_1 = require("typeorm");
const bid_entity_1 = require("../../bids/entities/bid.entity");
const auto_bid_entity_1 = require("../../bids/entities/auto-bid.entity");
const audit_log_entity_1 = require("../../audit/entities/audit-log.entity");
exports.AuctionStatus = {
    DRAFT: 'DRAFT',
    SCHEDULED: 'SCHEDULED',
    LIVE: 'LIVE',
    COMPLETING: 'COMPLETING',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
    RESERVE_NOT_MET: 'RESERVE_NOT_MET',
};
let Auction = class Auction {
    id;
    title;
    description;
    startingPrice;
    reservePrice;
    currentPrice;
    startTime;
    endTime;
    minimumBidIncrement;
    antiSnipingDuration;
    extensionDuration;
    maxExtensions;
    extensionCount;
    status;
    winnerId;
    winnerName;
    winningBidAmount;
    createdById;
    leadingBidderId;
    leadingBidderName;
    isClosing;
    version;
    bids;
    autoBids;
    auditLogs;
    createdAt;
    updatedAt;
};
exports.Auction = Auction;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Auction.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Auction.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], Auction.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal' }),
    __metadata("design:type", Number)
], Auction.prototype, "startingPrice", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', nullable: true }),
    __metadata("design:type", Number)
], Auction.prototype, "reservePrice", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal' }),
    __metadata("design:type", Number)
], Auction.prototype, "currentPrice", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Date)
], Auction.prototype, "startTime", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Date)
], Auction.prototype, "endTime", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 500 }),
    __metadata("design:type", Number)
], Auction.prototype, "minimumBidIncrement", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 120 }),
    __metadata("design:type", Number)
], Auction.prototype, "antiSnipingDuration", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 120 }),
    __metadata("design:type", Number)
], Auction.prototype, "extensionDuration", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 3 }),
    __metadata("design:type", Number)
], Auction.prototype, "maxExtensions", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Auction.prototype, "extensionCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', default: exports.AuctionStatus.DRAFT }),
    __metadata("design:type", String)
], Auction.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Auction.prototype, "winnerId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Auction.prototype, "winnerName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', nullable: true }),
    __metadata("design:type", Number)
], Auction.prototype, "winningBidAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Auction.prototype, "createdById", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Auction.prototype, "leadingBidderId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Auction.prototype, "leadingBidderName", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Auction.prototype, "isClosing", void 0);
__decorate([
    (0, typeorm_1.VersionColumn)(),
    __metadata("design:type", Number)
], Auction.prototype, "version", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => bid_entity_1.Bid, (bid) => bid.auction, { cascade: true }),
    __metadata("design:type", Array)
], Auction.prototype, "bids", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => auto_bid_entity_1.AutoBid, (ab) => ab.auction, { cascade: true }),
    __metadata("design:type", Array)
], Auction.prototype, "autoBids", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => audit_log_entity_1.AuditLog, (log) => log.auction, { cascade: true }),
    __metadata("design:type", Array)
], Auction.prototype, "auditLogs", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Auction.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], Auction.prototype, "updatedAt", void 0);
exports.Auction = Auction = __decorate([
    (0, typeorm_1.Entity)('auctions')
], Auction);
//# sourceMappingURL=auction.entity.js.map