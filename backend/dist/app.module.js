"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const schedule_1 = require("@nestjs/schedule");
const throttler_1 = require("@nestjs/throttler");
const auth_module_1 = require("./auth/auth.module");
const users_module_1 = require("./users/users.module");
const auctions_module_1 = require("./auctions/auctions.module");
const bids_module_1 = require("./bids/bids.module");
const gateway_module_1 = require("./gateway/gateway.module");
const scheduler_module_1 = require("./scheduler/scheduler.module");
const audit_module_1 = require("./audit/audit.module");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const auction_entity_1 = require("./auctions/entities/auction.entity");
const bid_entity_1 = require("./bids/entities/bid.entity");
const auto_bid_entity_1 = require("./bids/entities/auto-bid.entity");
const user_entity_1 = require("./users/entities/user.entity");
const audit_log_entity_1 = require("./audit/entities/audit-log.entity");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env'
            }),
            typeorm_1.TypeOrmModule.forRootAsync({
                imports: [config_1.ConfigModule],
                useFactory: (config) => {
                    const dbName = config.get('DB_NAME');
                    if (process.env.NODE_ENV === 'test' && !dbName?.endsWith('_test_db')) {
                        throw new Error('Safety Check: Tests must run against a database ending with _test_db');
                    }
                    return {
                        type: 'postgres',
                        host: config.get('DB_HOST', 'localhost'),
                        port: config.get('DB_PORT', 5432),
                        username: config.get('DB_USERNAME'),
                        password: config.get('DB_PASSWORD'),
                        database: dbName,
                        entities: [auction_entity_1.Auction, bid_entity_1.Bid, auto_bid_entity_1.AutoBid, user_entity_1.User, audit_log_entity_1.AuditLog],
                        synchronize: false,
                        logging: process.env.NODE_ENV === 'development',
                        extra: {
                            max: process.env.NODE_ENV === 'test' ? 20 : 10,
                        }
                    };
                },
                inject: [config_1.ConfigService],
            }),
            schedule_1.ScheduleModule.forRoot(),
            throttler_1.ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            auctions_module_1.AuctionsModule,
            bids_module_1.BidsModule,
            gateway_module_1.GatewayModule,
            scheduler_module_1.SchedulerModule,
            audit_module_1.AuditModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [app_service_1.AppService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map