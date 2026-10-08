import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { JwtService } from '@nestjs/jwt';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Privacy leak test:
 * As a bidder, call auction list/detail and bid-history endpoints and assert
 * that no response body contains reservePrice, any maxAmount, or a real name/email.
 */
describe('Privacy - no sensitive data leaks to bidders', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let auctionId: string;

  const SELLER_UUID = 'c0000000-0000-0000-0000-000000000001';
  const BIDDER_UUID = 'c0000000-0000-0000-0000-000000000002';
  const BIDDER_TOKEN_FN = () =>
    jwtService.sign({ sub: BIDDER_UUID, email: 'priv-bidder@test.com', role: 'BIDDER' });
  const ADMIN_TOKEN_FN = () =>
    jwtService.sign({ sub: SELLER_UUID, email: 'priv-seller@test.com', role: 'ADMIN' });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = moduleFixture.get<DataSource>(getDataSourceToken());
    jwtService = moduleFixture.get<JwtService>(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const userRepo = dataSource.getRepository('User');
    await userRepo.save([
      { id: SELLER_UUID, email: 'priv-seller@test.com', name: 'Real Seller Name', password: 'hash', role: 'ADMIN' },
      { id: BIDDER_UUID, email: 'priv-bidder@test.com', name: 'Real Bidder Name', password: 'hash', role: 'BIDDER' },
    ]);

    const auctionRepo = dataSource.getRepository('Auction');
    const auction = await auctionRepo.save({
      title: 'Privacy Test Auction', description: 'desc',
      startingPrice: 1000, currentPrice: 1500,
      reservePrice: 9999, // Must NEVER appear in bidder responses
      startTime: new Date(Date.now() - 3_600_000),
      endTime: new Date(Date.now() + 3_600_000),
      status: 'LIVE', version: 1, createdById: SELLER_UUID,
      leadingBidderId: BIDDER_UUID, leadingBidderName: 'Real Bidder Name',
    });
    auctionId = auction.id;

    const bidRepo = dataSource.getRepository('Bid');
    await bidRepo.save({
      amount: 1500, type: 'MANUAL', auctionId,
      bidderId: BIDDER_UUID, bidderName: 'Real Bidder Name',
      placedAt: new Date(),
    });

    const autoBidRepo = dataSource.getRepository('AutoBid');
    await autoBidRepo.save({
      maxAmount: 7777, isActive: true, auctionId, bidderId: BIDDER_UUID,
    });
  });

  const FORBIDDEN_PATTERNS = [
    /reservePrice/,
    /reserve_price/,
    /maxAmount/,
    /max_amount/,
    /7777/,            // the auto-bid max value
    /9999/,            // the reserve price value
    /Real Seller Name/,
    /Real Bidder Name/,
    /priv-seller@test\.com/,
    /priv-bidder@test\.com/,
  ];

  function assertNoLeak(body: any) {
    const text = JSON.stringify(body);
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(text, `Response must not contain ${pattern}`).not.toMatch(pattern);
    }
  }

  it('GET /auctions — list does not leak sensitive fields', async () => {
    const res = await request(app.getHttpServer())
      .get('/auctions')
      .set('Authorization', 'Bearer ' + BIDDER_TOKEN_FN());
    expect(res.status).toBe(200);
    assertNoLeak(res.body);
  });

  it('GET /auctions/:id — detail does not leak sensitive fields', async () => {
    const res = await request(app.getHttpServer())
      .get('/auctions/' + auctionId)
      .set('Authorization', 'Bearer ' + BIDDER_TOKEN_FN());
    expect(res.status).toBe(200);
    assertNoLeak(res.body);
  });

  it('GET /auctions/:id/bids — bid history does not leak sensitive fields', async () => {
    const res = await request(app.getHttpServer())
      .get('/auctions/' + auctionId + '/bids')
      .set('Authorization', 'Bearer ' + BIDDER_TOKEN_FN());
    expect(res.status).toBe(200);
    assertNoLeak(res.body);
    // Aliases should be present
    expect(JSON.stringify(res.body)).toMatch(/Bidder \d/);
  });

  it('GET /auctions/:id — admin still sees reservePrice', async () => {
    const res = await request(app.getHttpServer())
      .get('/auctions/' + auctionId)
      .set('Authorization', 'Bearer ' + ADMIN_TOKEN_FN());
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toMatch(/reservePrice/);
  });
});
