import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { Auction } from './src/auctions/entities/auction.entity';
import { Bid } from './src/bids/entities/bid.entity';
import { AutoBid } from './src/bids/entities/auto-bid.entity';
import { User } from './src/users/entities/user.entity';
import { AuditLog } from './src/audit/entities/audit-log.entity';

config({ path: '.env.test' });

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'auction_test_db',
  entities: [Auction, Bid, AutoBid, User, AuditLog],
  synchronize: false,
  logging: 'all',
  logger: 'file',
});
