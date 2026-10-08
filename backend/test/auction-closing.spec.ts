import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as dotenv from 'dotenv';
import { DataSource, Repository } from 'typeorm';

import { AuctionsService } from '../src/auctions/auctions.service';
import { AuditService } from '../src/audit/audit.service';
import { ClockService } from '../src/common/clock.service';
import { AuctionGateway } from '../src/gateway/auction.gateway';
import { Auction, AuctionStatus } from '../src/auctions/entities/auction.entity';
import { Bid } from '../src/bids/entities/bid.entity';
import { AutoBid } from '../src/bids/entities/auto-bid.entity';
import { AuditLog, AuditEventType } from '../src/audit/entities/audit-log.entity';
import { User } from '../src/users/entities/user.entity';
import { BidsService } from '../src/bids/bids.service';

dotenv.config({ path: '.env.test' });

const PAST = new Date(Date.now() - 60_000);
const FUTURE = new Date(Date.now() + 600_000);

function makeAuction(overrides: Partial<Auction> = {}): Partial<Auction> {
  return {
    title: 'Close Test',
    description: 'test',
    startingPrice: 1000,
    currentPrice: 1000,
    startTime: new Date(Date.now() - 3_600_000),
    endTime: PAST,
    status: AuctionStatus.LIVE,
    ...overrides,
  };
}

describe('Auction Closing', () => {
  let moduleRef: TestingModule;
  let auctionsService: AuctionsService;
  let bidsService: BidsService;
  let dataSource: DataSource;
  let auctionRepo: Repository<Auction>;
  let userRepo: Repository<User>;
  let auditRepo: Repository<AuditLog>;
  let mockClock: { now: () => Date };

  const SELLER_ID = '10000000-0000-0000-0000-000000000001';
  const BIDDER_ID = '10000000-0000-0000-0000-000000000002';

  const mockGateway = {
    emitAuctionEnded: () => {},
    emitBidPlaced: () => {},
    emitAuctionExtended: () => {},
    emitAuctionStarted: () => {},
    emitLeaderChanged: () => {},
  };

  beforeAll(async () => {
    mockClock = { now: () => new Date() };

    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432', 10),
          username: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres',
          database: process.env.DB_NAME || 'auction_test_db',
          entities: [Bid, AutoBid, Auction, User, AuditLog],
          synchronize: false,
        }),
        TypeOrmModule.forFeature([Bid, AutoBid, Auction, User, AuditLog]),
      ],
      providers: [
        AuctionsService,
        AuditService,
        BidsService,
        { provide: ClockService, useValue: mockClock },
        { provide: AuctionGateway, useValue: mockGateway },
      ],
    }).compile();

    auctionsService = moduleRef.get<AuctionsService>(AuctionsService);
    bidsService = moduleRef.get<BidsService>(BidsService);
    dataSource = moduleRef.get<DataSource>(DataSource);
    auctionRepo = dataSource.getRepository(Auction);
    userRepo = dataSource.getRepository(User);
    auditRepo = dataSource.getRepository(AuditLog);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE audit_logs CASCADE');
    await dataSource.query('TRUNCATE TABLE bids CASCADE');
    await dataSource.query('TRUNCATE TABLE auto_bids CASCADE');
    await dataSource.query('TRUNCATE TABLE auctions CASCADE');
    await userRepo.save([
      { id: SELLER_ID, name: 'Seller', email: 'seller@t.com', password: 'hash', role: 'ADMIN' },
      { id: BIDDER_ID, name: 'Bidder', email: 'bidder@t.com', password: 'hash', role: 'bidder' },
    ]);
    mockClock.now = () => new Date();
  });

  it('1. Close twice in sequence -> one winner, one AUCTION_ENDED, one WINNER_SELECTED', async () => {
    const auction = await auctionRepo.save(makeAuction({
      sellerId: SELLER_ID,
      leadingBidderId: BIDDER_ID,
      leadingBidderName: 'Bidder',
      currentPrice: 5000,
    }));
    await dataSource.query(
      `INSERT INTO bids (id, amount, type, "auctionId", "bidderId", "bidderName", "placedAt")
       VALUES (gen_random_uuid(), 5000, 'MANUAL', $1, $2, 'Bidder', now())`,
      [auction.id, BIDDER_ID],
    );

    await auctionsService.closeAuction(auction.id);
    await auctionsService.closeAuction(auction.id);

    const closed = await auctionRepo.findOneBy({ id: auction.id });
    expect(closed?.status).toBe(AuctionStatus.COMPLETED);
    expect(closed?.winnerId).toBe(BIDDER_ID);

    const endedLogs = await auditRepo.findBy({ auctionId: auction.id, eventType: AuditEventType.AUCTION_ENDED });
    const winnerLogs = await auditRepo.findBy({ auctionId: auction.id, eventType: AuditEventType.WINNER_SELECTED });
    expect(endedLogs).toHaveLength(1);
    expect(winnerLogs).toHaveLength(1);
  });

  it('2. Close 5 times in parallel -> same result (exactly one close)', async () => {
    const auction = await auctionRepo.save(makeAuction({
      sellerId: SELLER_ID,
      leadingBidderId: BIDDER_ID,
      leadingBidderName: 'Bidder',
      currentPrice: 8000,
    }));
    await dataSource.query(
      `INSERT INTO bids (id, amount, type, "auctionId", "bidderId", "bidderName", "placedAt")
       VALUES (gen_random_uuid(), 8000, 'MANUAL', $1, $2, 'Bidder', now())`,
      [auction.id, BIDDER_ID],
    );

    await Promise.all(Array.from({ length: 5 }, () => auctionsService.closeAuction(auction.id)));

    const closed = await auctionRepo.findOneBy({ id: auction.id });
    expect(closed?.status).toBe(AuctionStatus.COMPLETED);

    const endedLogs = await auditRepo.findBy({ auctionId: auction.id, eventType: AuditEventType.AUCTION_ENDED });
    expect(endedLogs).toHaveLength(1);
  });

  it('3a. Reserve not met -> RESERVE_NOT_MET, no winner', async () => {
    const auction = await auctionRepo.save(makeAuction({
      sellerId: SELLER_ID,
      reservePrice: 10000,
      currentPrice: 5000,
      leadingBidderId: BIDDER_ID,
      leadingBidderName: 'Bidder',
    }));
    await dataSource.query(
      `INSERT INTO bids (id, amount, type, "auctionId", "bidderId", "bidderName", "placedAt")
       VALUES (gen_random_uuid(), 5000, 'MANUAL', $1, $2, 'Bidder', now())`,
      [auction.id, BIDDER_ID],
    );

    await auctionsService.closeAuction(auction.id);
    const closed = await auctionRepo.findOneBy({ id: auction.id });
    expect(closed?.status).toBe(AuctionStatus.RESERVE_NOT_MET);
    expect(closed?.winnerId).toBeNull();
  });

  it('3b. Reserve met -> leader wins', async () => {
    const auction = await auctionRepo.save(makeAuction({
      sellerId: SELLER_ID,
      reservePrice: 4000,
      currentPrice: 5000,
      leadingBidderId: BIDDER_ID,
      leadingBidderName: 'Bidder',
    }));
    await dataSource.query(
      `INSERT INTO bids (id, amount, type, "auctionId", "bidderId", "bidderName", "placedAt")
       VALUES (gen_random_uuid(), 5000, 'MANUAL', $1, $2, 'Bidder', now())`,
      [auction.id, BIDDER_ID],
    );

    await auctionsService.closeAuction(auction.id);
    const closed = await auctionRepo.findOneBy({ id: auction.id });
    expect(closed?.status).toBe(AuctionStatus.COMPLETED);
    expect(closed?.winnerId).toBe(BIDDER_ID);
    expect(Number(closed?.winningBidAmount)).toBe(5000);
  });

  it('4. Bid after closing -> rejected', async () => {
    const auction = await auctionRepo.save(makeAuction({ sellerId: SELLER_ID }));
    await auctionsService.closeAuction(auction.id);

    const bidder = await userRepo.findOneBy({ id: BIDDER_ID }) as User;
    await expect(
      bidsService.placeBid(auction.id, bidder, { amount: 1500 }),
    ).rejects.toThrow(/not live/i);
  });

  it('5. Extended auction is not closed at its original end time', async () => {
    // DB end_time is in the future (post-extension), clock says original time has passed
    const auction = await auctionRepo.save(makeAuction({
      sellerId: SELLER_ID,
      endTime: FUTURE, // extended end_time stored in DB
    }));

    // Simulate clock at original end time — but DB end_time is still future
    mockClock.now = () => new Date(PAST.getTime() + 1000);

    await auctionsService.closeAuction(auction.id);

    const checked = await auctionRepo.findOneBy({ id: auction.id });
    expect(checked?.status).toBe(AuctionStatus.LIVE);
  });
});
