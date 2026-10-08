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
exports.AuditLog = exports.AuditEventType = void 0;
const typeorm_1 = require("typeorm");
const auction_entity_1 = require("../../auctions/entities/auction.entity");
var AuditEventType;
(function (AuditEventType) {
    AuditEventType["AUCTION_CREATED"] = "AUCTION_CREATED";
    AuditEventType["AUCTION_STARTED"] = "AUCTION_STARTED";
    AuditEventType["AUCTION_SCHEDULED"] = "AUCTION_SCHEDULED";
    AuditEventType["AUCTION_CANCELLED"] = "AUCTION_CANCELLED";
    AuditEventType["AUCTION_EXTENDED"] = "AUCTION_EXTENDED";
    AuditEventType["AUCTION_ENDED"] = "AUCTION_ENDED";
    AuditEventType["WINNER_SELECTED"] = "WINNER_SELECTED";
    AuditEventType["RESERVE_NOT_MET"] = "RESERVE_NOT_MET";
    AuditEventType["BID_PLACED"] = "BID_PLACED";
    AuditEventType["BID_REJECTED"] = "BID_REJECTED";
    AuditEventType["AUTO_BID_PLACED"] = "AUTO_BID_PLACED";
    AuditEventType["AUTO_BID_CONFIGURED"] = "AUTO_BID_CONFIGURED";
    AuditEventType["LEADER_CHANGED"] = "LEADER_CHANGED";
})(AuditEventType || (exports.AuditEventType = AuditEventType = {}));
let AuditLog = class AuditLog {
    id;
    eventType;
    auctionId;
    actorId;
    actorName;
    metadata;
    auction;
    createdAt;
};
exports.AuditLog = AuditLog;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], AuditLog.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ enum: AuditEventType }),
    __metadata("design:type", String)
], AuditLog.prototype, "eventType", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], AuditLog.prototype, "auctionId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], AuditLog.prototype, "actorId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], AuditLog.prototype, "actorName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'json', nullable: true }),
    __metadata("design:type", Object)
], AuditLog.prototype, "metadata", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => auction_entity_1.Auction, (auction) => auction.auditLogs, {
        onDelete: 'CASCADE',
        nullable: true,
    }),
    (0, typeorm_1.JoinColumn)({ name: 'auctionId' }),
    __metadata("design:type", auction_entity_1.Auction)
], AuditLog.prototype, "auction", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], AuditLog.prototype, "createdAt", void 0);
exports.AuditLog = AuditLog = __decorate([
    (0, typeorm_1.Entity)('audit_logs')
], AuditLog);
//# sourceMappingURL=audit-log.entity.js.map