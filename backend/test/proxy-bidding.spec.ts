import { Test, TestingModule } from '@nestjs/testing';
import { BidsService } from '../src/bids/bids.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bid } from '../src/bids/entities/bid.entity';
import { AutoBid } from '../src/bids/entities/auto-bid.entity';
import { Auction, AuctionStatus } from '../src/auctions/entities/auction.entity';
import { User } from '../src/users/entities/user.entity';
import { AuditLog } from '../src/audit/entities/audit-log.entity';
import { AuditService } from '../src/audit/audit.service';
import { AuctionGateway } from '../src/gateway/auction.gateway';
import { DataSource, Repository } from 'typeorm';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

describe('Proxy Bidding', () => {
  let moduleRef: TestingModule;
  let bidsService: BidsService;
  let dataSource: DataSource;

  let auctionRepo: Repository<Auction>;
  let userRepo: Repository<User>;

  let testAuctionId: string;
  let userA: User;
  let userB: User;
  let userC: User;

  beforeAll(async () => {
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
        BidsService,
        AuditService,
        {
          provide: AuctionGateway,
          useValue: { emitBidPlaced: () => {}, emitLeaderChanged: () => {}, emitAuctionExtended: () => {} },
        },
      ],
    }).compile();

    bidsService = moduleRef.get<BidsService>(BidsService);
    dataSource = moduleRef.get<DataSource>(DataSource);

    auctionRepo = dataSource.getRepository(Auction);
    userRepo = dataSource.getRepository(User);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await userRepo.save([
      { id: '00000000-0000-0000-0000-000000000001', name: 'User A', email: 'a@test.com', password: 'hash', role: 'bidder' },
      { id: '00000000-0000-0000-0000-000000000002', name: 'User B', email: 'b@test.com', password: 'hash', role: 'bidder' },
      { id: '00000000-0000-0000-0000-000000000003', name: 'User C', email: 'c@test.com', password: 'hash', role: 'bidder' },
    ]);

    userA = await userRepo.findOneBy({ id: '00000000-0000-0000-0000-000000000001' }) as User;
    userB = await userRepo.findOneBy({ id: '00000000-0000-0000-0000-000000000002' }) as User;
    userC = await userRepo.findOneBy({ id: '00000000-0000-0000-0000-000000000003' }) as User;

    const auction = await auctionRepo.save({
      title: 'Proxy Test Auction',
      description: 'Test description',
      sellerId: userA.id, // Just use a valid user as seller
      startingPrice: 1000,
      startTime: new Date(),
      currentPrice: 1000,
      status: AuctionStatus.LIVE,
      endTime: new Date(Date.now() + 100000),
    });
    testAuctionId = auction.id;
  });

  it('1. A max 20,000, then B max 15,000 -> A leads, price 15,500.', async () => {
    await bidsService.setAutoBid(testAuctionId, userA, { maxAmount: 20000 });
    await bidsService.setAutoBid(testAuctionId, userB, { maxAmount: 15000 });

    const auction = await auctionRepo.findOneBy({ id: testAuctionId });
    expect(auction?.leadingBidderId).toBe(userA.id);
    expect(Number(auction?.currentPrice)).toBe(15500);
  });

  it('2. Then C max 25,000 -> C leads, price 20,500.', async () => {
    await bidsService.setAutoBid(testAuctionId, userA, { maxAmount: 20000 });
    await bidsService.setAutoBid(testAuctionId, userB, { maxAmount: 15000 });
    await bidsService.setAutoBid(testAuctionId, userC, { maxAmount: 25000 });

    const auction = await auctionRepo.findOneBy({ id: testAuctionId });
    expect(auction?.leadingBidderId).toBe(userC.id);
    expect(Number(auction?.currentPrice)).toBe(20500);
  });

  it('3. A and B both max 20,000, A first -> A leads, price 20,000.', async () => {
    await bidsService.setAutoBid(testAuctionId, userA, { maxAmount: 20000 });
    await new Promise(r => setTimeout(r, 10));
    await bidsService.setAutoBid(testAuctionId, userB, { maxAmount: 20000 });

    const auction = await auctionRepo.findOneBy({ id: testAuctionId });
    expect(auction?.leadingBidderId).toBe(userA.id);
    expect(Number(auction?.currentPrice)).toBe(20000);
  });

  it('4. Challenger max below the minimum next bid -> rejected.', async () => {
    await bidsService.setAutoBid(testAuctionId, userA, { maxAmount: 20000 });
    await expect(bidsService.setAutoBid(testAuctionId, userB, { maxAmount: 1050 }))
      .rejects.toThrow(/minimum next bid/);
  });

  it('5. Three automatic bidders with different maxes -> correct leader and price.', async () => {
    await bidsService.setAutoBid(testAuctionId, userA, { maxAmount: 10000 });
    await bidsService.setAutoBid(testAuctionId, userB, { maxAmount: 20000 });
    await bidsService.setAutoBid(testAuctionId, userC, { maxAmount: 30000 });

    const auction = await auctionRepo.findOneBy({ id: testAuctionId });
    expect(auction?.leadingBidderId).toBe(userC.id);
    expect(Number(auction?.currentPrice)).toBe(20500);
  });

  it('6. Increment tier crossing while auto-bidding', async () => {
    const auction = await auctionRepo.findOneBy({ id: testAuctionId });
    if (auction) {
      auction.currentPrice = 9800;
      await auctionRepo.save(auction);
    }
    
    await bidsService.setAutoBid(testAuctionId, userA, { maxAmount: 20000 });
    await bidsService.setAutoBid(testAuctionId, userB, { maxAmount: 9900 });

    const updated = await auctionRepo.findOneBy({ id: testAuctionId });
    expect(updated?.leadingBidderId).toBe(userA.id);
    expect(Number(updated?.currentPrice)).toBe(10000);
  });

  it('7. Manual bid against a higher max -> leader stays, price = bid + increment', async () => {
    await bidsService.setAutoBid(testAuctionId, userA, { maxAmount: 20000 });
    await bidsService.placeBid(testAuctionId, userB, { amount: 15000 });

    const auction = await auctionRepo.findOneBy({ id: testAuctionId });
    expect(auction?.leadingBidderId).toBe(userA.id);
    expect(Number(auction?.currentPrice)).toBe(15500);
  });

  it('8. Single auto bidder with no competition -> price does not jump to their max.', async () => {
    await bidsService.setAutoBid(testAuctionId, userA, { maxAmount: 20000 });
    
    const auction = await auctionRepo.findOneBy({ id: testAuctionId });
    expect(auction?.leadingBidderId).toBe(userA.id);
    expect(Number(auction?.currentPrice)).toBe(1000);
  });

  it('9. Maximums never appear in auto-bid audit event payloads', async () => {
    await bidsService.setAutoBid(testAuctionId, userA, { maxAmount: 20000 });
    await bidsService.setAutoBid(testAuctionId, userB, { maxAmount: 15000 });

    const logs = await dataSource.query(
      `SELECT metadata FROM audit_logs WHERE "auctionId" = $1`,
      [testAuctionId],
    );

    for (const log of logs) {
      const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
      expect(meta).not.toHaveProperty('maxAmount');
      expect(meta).not.toHaveProperty('maxC');
      expect(meta).not.toHaveProperty('maxL');
    }
  });
});
