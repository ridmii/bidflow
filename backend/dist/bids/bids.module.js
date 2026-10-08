"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BidsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const bids_service_1 = require("./bids.service");
const bids_controller_1 = require("./bids.controller");
const bid_entity_1 = require("./entities/bid.entity");
const auto_bid_entity_1 = require("./entities/auto-bid.entity");
const auction_entity_1 = require("../auctions/entities/auction.entity");
const audit_module_1 = require("../audit/audit.module");
const gateway_module_1 = require("../gateway/gateway.module");
let BidsModule = class BidsModule {
};
exports.BidsModule = BidsModule;
exports.BidsModule = BidsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([bid_entity_1.Bid, auto_bid_entity_1.AutoBid, auction_entity_1.Auction]),
            audit_module_1.AuditModule,
            gateway_module_1.GatewayModule,
        ],
        controllers: [bids_controller_1.BidsController],
        providers: [bids_service_1.BidsService],
        exports: [bids_service_1.BidsService],
    })
], BidsModule);
//# sourceMappingURL=bids.module.js.map