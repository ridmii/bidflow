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
exports.Bid = exports.BidType = void 0;
const typeorm_1 = require("typeorm");
const auction_entity_1 = require("../../auctions/entities/auction.entity");
const user_entity_1 = require("../../users/entities/user.entity");
var BidType;
(function (BidType) {
    BidType["MANUAL"] = "MANUAL";
    BidType["AUTO"] = "AUTO";
})(BidType || (exports.BidType = BidType = {}));
let Bid = class Bid {
    id;
    amount;
    type;
    auctionId;
    bidderId;
    bidderName;
    idempotencyKey;
    auction;
    bidder;
    placedAt;
};
exports.Bid = Bid;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Bid.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({}),
    __metadata("design:type", Number)
], Bid.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)({ enum: BidType, default: BidType.MANUAL }),
    __metadata("design:type", String)
], Bid.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Bid.prototype, "auctionId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Bid.prototype, "bidderId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Bid.prototype, "bidderName", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Bid.prototype, "idempotencyKey", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => auction_entity_1.Auction, (auction) => auction.bids, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'auctionId' }),
    __metadata("design:type", auction_entity_1.Auction)
], Bid.prototype, "auction", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, (user) => user.bids, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'bidderId' }),
    __metadata("design:type", user_entity_1.User)
], Bid.prototype, "bidder", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Bid.prototype, "placedAt", void 0);
exports.Bid = Bid = __decorate([
    (0, typeorm_1.Entity)('bids')
], Bid);
//# sourceMappingURL=bid.entity.js.map