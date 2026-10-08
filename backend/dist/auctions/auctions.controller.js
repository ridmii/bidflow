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
exports.AuctionsController = void 0;
const common_1 = require("@nestjs/common");
const common_2 = require("@nestjs/common");
const auctions_service_1 = require("./auctions.service");
const create_auction_dto_1 = require("./dto/create-auction.dto");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const auction_entity_1 = require("./entities/auction.entity");
const optional_jwt_auth_guard_1 = require("../auth/guards/optional-jwt-auth.guard");
let AuctionsController = class AuctionsController {
    auctionsService;
    constructor(auctionsService) {
        this.auctionsService = auctionsService;
    }
    findAll(req, status) {
        return this.auctionsService.findAll(status, req.user);
    }
    findOne(id, req) {
        return this.auctionsService.findOne(id, req.user);
    }
    getMinimumNextBid(id) {
        return this.auctionsService.getMinimumNextBid(id);
    }
    getAuditLog(id, req) {
        return this.auctionsService.getAuctionAuditLog(id, req.user);
    }
    create(req, dto) {
        return this.auctionsService.create(req.user, dto);
    }
    update(id, req, dto) {
        return this.auctionsService.update(id, req.user, dto);
    }
    schedule(id, req) {
        return this.auctionsService.scheduleAuction(id, req.user);
    }
    cancel(id, req) {
        return this.auctionsService.cancelAuction(id, req.user);
    }
    delete(id, req) {
        return this.auctionsService.deleteAuction(id, req.user);
    }
};
exports.AuctionsController = AuctionsController;
__decorate([
    (0, common_2.Get)(),
    (0, common_2.UseGuards)(optional_jwt_auth_guard_1.OptionalJwtAuthGuard),
    __param(0, (0, common_2.Request)()),
    __param(1, (0, common_2.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AuctionsController.prototype, "findAll", null);
__decorate([
    (0, common_2.Get)(':id'),
    (0, common_2.UseGuards)(optional_jwt_auth_guard_1.OptionalJwtAuthGuard),
    __param(0, (0, common_2.Param)('id')),
    __param(1, (0, common_2.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AuctionsController.prototype, "findOne", null);
__decorate([
    (0, common_2.Get)(':id/minimum-bid'),
    __param(0, (0, common_2.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AuctionsController.prototype, "getMinimumNextBid", null);
__decorate([
    (0, common_2.Get)(':id/audit'),
    (0, common_2.UseGuards)(optional_jwt_auth_guard_1.OptionalJwtAuthGuard),
    __param(0, (0, common_2.Param)('id')),
    __param(1, (0, common_2.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AuctionsController.prototype, "getAuditLog", null);
__decorate([
    (0, common_2.Post)(),
    (0, common_2.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_2.HttpCode)(common_2.HttpStatus.CREATED),
    __param(0, (0, common_2.Request)()),
    __param(1, (0, common_2.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_auction_dto_1.CreateAuctionDto]),
    __metadata("design:returntype", void 0)
], AuctionsController.prototype, "create", null);
__decorate([
    (0, common_2.Patch)(':id'),
    (0, common_2.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_2.Param)('id')),
    __param(1, (0, common_2.Request)()),
    __param(2, (0, common_2.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, create_auction_dto_1.UpdateAuctionDto]),
    __metadata("design:returntype", void 0)
], AuctionsController.prototype, "update", null);
__decorate([
    (0, common_2.Post)(':id/schedule'),
    (0, common_2.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_2.Param)('id')),
    __param(1, (0, common_2.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AuctionsController.prototype, "schedule", null);
__decorate([
    (0, common_2.Post)(':id/cancel'),
    (0, common_2.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_2.Param)('id')),
    __param(1, (0, common_2.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AuctionsController.prototype, "cancel", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_2.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_2.Param)('id')),
    __param(1, (0, common_2.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AuctionsController.prototype, "delete", null);
exports.AuctionsController = AuctionsController = __decorate([
    (0, common_2.Controller)('auctions'),
    __metadata("design:paramtypes", [auctions_service_1.AuctionsService])
], AuctionsController);
//# sourceMappingURL=auctions.controller.js.map