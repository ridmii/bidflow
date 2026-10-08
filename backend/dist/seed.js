"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const bcrypt = __importStar(require("bcrypt"));
const user_entity_1 = require("./users/entities/user.entity");
const auction_entity_1 = require("./auctions/entities/auction.entity");
const typeorm_config_1 = require("../typeorm.config");
async function seed() {
    await typeorm_config_1.AppDataSource.initialize();
    console.log('Database connected.');
    const userRepo = typeorm_config_1.AppDataSource.getRepository(user_entity_1.User);
    const auctionRepo = typeorm_config_1.AppDataSource.getRepository(auction_entity_1.Auction);
    const adminEmail = 'admin@auction.com';
    let admin = await userRepo.findOne({ where: { email: adminEmail } });
    if (!admin) {
        admin = userRepo.create({
            email: adminEmail,
            name: 'Admin User',
            password: await bcrypt.hash('password123', 10),
            role: user_entity_1.UserRole.ADMIN,
        });
        await userRepo.save(admin);
        console.log('Created Admin.');
    }
    const bidders = [];
    for (let i = 1; i <= 3; i++) {
        const email = 'bidder' + i + '@auction.com';
        let bidder = await userRepo.findOne({ where: { email } });
        if (!bidder) {
            bidder = userRepo.create({
                email,
                name: 'Bidder ' + i,
                password: await bcrypt.hash('password123', 10),
                role: user_entity_1.UserRole.BIDDER,
            });
            await userRepo.save(bidder);
            console.log('Created Bidder ' + i);
        }
        bidders.push(bidder);
    }
    const titles = ['Antique Vase', 'Vintage Watch', 'Classic Car'];
    const statuses = [auction_entity_1.AuctionStatus.DRAFT, auction_entity_1.AuctionStatus.SCHEDULED, auction_entity_1.AuctionStatus.LIVE];
    for (let i = 0; i < 3; i++) {
        const title = titles[i];
        let auction = await auctionRepo.findOne({ where: { title } });
        if (!auction) {
            const now = new Date();
            auction = auctionRepo.create({
                title,
                description: 'Description for ' + title,
                startingPrice: 1000 * (i + 1),
                currentPrice: 1000 * (i + 1),
                startTime: new Date(now.getTime() - 100000),
                endTime: new Date(now.getTime() + 100000 * (i + 1)),
                status: statuses[i],
                createdById: admin.id,
                version: 1
            });
            await auctionRepo.save(auction);
            console.log('Created Auction: ' + title);
        }
    }
    console.log('Seeding complete.');
    await typeorm_config_1.AppDataSource.destroy();
}
seed().catch(console.error);
//# sourceMappingURL=seed.js.map