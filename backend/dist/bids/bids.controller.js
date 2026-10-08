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
exports.BidsController = void 0;
const common_1 = require("@nestjs/common");
const bids_service_1 = require("./bids.service");
const place_bid_dto_1 = require("./dto/place-bid.dto");
const set_auto_bid_dto_1 = require("./dto/set-auto-bid.dto");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
let BidsController = class BidsController {
    bidsService;
    constructor(bidsService) {
        this.bidsService = bidsService;
    }
    async placeBid(auctionId, req, dto) {
        const bid = await this.bidsService.placeBid(auctionId, req.user, dto);
        return {
            message: 'Bid placed successfully',
            bid: {
                id: bid.id,
                amount: bid.amount,
                placedAt: bid.placedAt,
                auctionId: bid.auctionId,
            },
        };
    }
    async getBidHistory(auctionId) {
        return this.bidsService.getBidHistory(auctionId);
    }
    async setAutoBid(auctionId, req, dto) {
        return this.bidsService.setAutoBid(auctionId, req.user, dto);
    }
    async getMyAutoBid(auctionId, req) {
        return this.bidsService.getMyAutoBid(auctionId, req.user.id);
    }
};
exports.BidsController = BidsController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Param)('auctionId')),
    __param(1, (0, common_1.Request)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, place_bid_dto_1.PlaceBidDto]),
    __metadata("design:returntype", Promise)
], BidsController.prototype, "placeBid", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Param)('auctionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BidsController.prototype, "getBidHistory", null);
__decorate([
    (0, common_1.Post)('auto'),
    __param(0, (0, common_1.Param)('auctionId')),
    __param(1, (0, common_1.Request)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, set_auto_bid_dto_1.SetAutoBidDto]),
    __metadata("design:returntype", Promise)
], BidsController.prototype, "setAutoBid", null);
__decorate([
    (0, common_1.Get)('auto/me'),
    __param(0, (0, common_1.Param)('auctionId')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], BidsController.prototype, "getMyAutoBid", null);
exports.BidsController = BidsController = __decorate([
    (0, common_1.Controller)('auctions/:auctionId/bids'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [bids_service_1.BidsService])
], BidsController);
//# sourceMappingURL=bids.controller.js.map