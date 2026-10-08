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
exports.AutoBid = void 0;
const typeorm_1 = require("typeorm");
const auction_entity_1 = require("../../auctions/entities/auction.entity");
const user_entity_1 = require("../../users/entities/user.entity");
let AutoBid = class AutoBid {
    id;
    maxAmount;
    isActive;
    auctionId;
    bidderId;
    auction;
    bidder;
    createdAt;
    updatedAt;
};
exports.AutoBid = AutoBid;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], AutoBid.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({}),
    __metadata("design:type", Number)
], AutoBid.prototype, "maxAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], AutoBid.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], AutoBid.prototype, "auctionId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], AutoBid.prototype, "bidderId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => auction_entity_1.Auction, (auction) => auction.autoBids, {
        onDelete: 'CASCADE',
    }),
    (0, typeorm_1.JoinColumn)({ name: 'auctionId' }),
    __metadata("design:type", auction_entity_1.Auction)
], AutoBid.prototype, "auction", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, (user) => user.autoBids, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'bidderId' }),
    __metadata("design:type", user_entity_1.User)
], AutoBid.prototype, "bidder", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], AutoBid.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], AutoBid.prototype, "updatedAt", void 0);
exports.AutoBid = AutoBid = __decorate([
    (0, typeorm_1.Entity)('auto_bids'),
    (0, typeorm_1.Unique)(['auctionId', 'bidderId'])
], AutoBid);
//# sourceMappingURL=auto-bid.entity.js.map