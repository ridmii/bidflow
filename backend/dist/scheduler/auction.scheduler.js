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
var AuctionScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuctionScheduler = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const auction_entity_1 = require("../auctions/entities/auction.entity");
const auctions_service_1 = require("../auctions/auctions.service");
const auction_gateway_1 = require("../gateway/auction.gateway");
const audit_service_1 = require("../audit/audit.service");
const audit_log_entity_1 = require("../audit/entities/audit-log.entity");
let AuctionScheduler = AuctionScheduler_1 = class AuctionScheduler {
    auctionsRepo;
    auctionsService;
    auctionGateway;
    auditService;
    logger = new common_1.Logger(AuctionScheduler_1.name);
    constructor(auctionsRepo, auctionsService, auctionGateway, auditService) {
        this.auctionsRepo = auctionsRepo;
        this.auctionsService = auctionsService;
        this.auctionGateway = auctionGateway;
        this.auditService = auditService;
    }
    async startScheduledAuctions() {
        const now = new Date();
        const auctions = await this.auctionsRepo.find({
            where: {
                status: auction_entity_1.AuctionStatus.SCHEDULED,
                startTime: (0, typeorm_2.LessThanOrEqual)(now),
            },
        });
        for (const auction of auctions) {
            try {
                auction.status = auction_entity_1.AuctionStatus.LIVE;
                await this.auctionsRepo.save(auction);
                await this.auditService.log({
                    eventType: audit_log_entity_1.AuditEventType.AUCTION_STARTED,
                    auctionId: auction.id,
                    metadata: { startTime: auction.startTime },
                });
                this.auctionGateway.emitAuctionStarted(auction.id, {
                    auctionId: auction.id,
                    title: auction.title,
                    startTime: auction.startTime,
                    endTime: auction.endTime,
                    currentPrice: auction.currentPrice,
                });
                this.logger.log(`Started auction: ${auction.id} - ${auction.title}`);
            }
            catch (err) {
                this.logger.error(`Failed to start auction ${auction.id}: ${err}`);
            }
        }
    }
    async closeExpiredAuctions() {
        const now = new Date();
        const auctions = await this.auctionsRepo.find({
            where: {
                status: auction_entity_1.AuctionStatus.LIVE,
                endTime: (0, typeorm_2.LessThanOrEqual)(now),
                isClosing: false,
            },
        });
        for (const auction of auctions) {
            try {
                this.logger.log(`Closing auction: ${auction.id} - ${auction.title}`);
                await this.auctionsService.closeAuction(auction.id);
            }
            catch (err) {
                this.logger.error(`Failed to close auction ${auction.id}: ${err}`);
            }
        }
    }
};
exports.AuctionScheduler = AuctionScheduler;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_30_SECONDS),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AuctionScheduler.prototype, "startScheduledAuctions", null);
__decorate([
    (0, schedule_1.Cron)('*/15 * * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AuctionScheduler.prototype, "closeExpiredAuctions", null);
exports.AuctionScheduler = AuctionScheduler = AuctionScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(auction_entity_1.Auction)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        auctions_service_1.AuctionsService,
        auction_gateway_1.AuctionGateway,
        audit_service_1.AuditService])
], AuctionScheduler);
//# sourceMappingURL=auction.scheduler.js.map