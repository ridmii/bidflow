"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchedulerModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const auction_scheduler_1 = require("./auction.scheduler");
const auction_entity_1 = require("../auctions/entities/auction.entity");
const auctions_module_1 = require("../auctions/auctions.module");
const gateway_module_1 = require("../gateway/gateway.module");
const audit_module_1 = require("../audit/audit.module");
let SchedulerModule = class SchedulerModule {
};
exports.SchedulerModule = SchedulerModule;
exports.SchedulerModule = SchedulerModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([auction_entity_1.Auction]),
            auctions_module_1.AuctionsModule,
            gateway_module_1.GatewayModule,
            audit_module_1.AuditModule,
        ],
        providers: [auction_scheduler_1.AuctionScheduler],
    })
], SchedulerModule);
//# sourceMappingURL=scheduler.module.js.map