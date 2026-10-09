import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { JwtService } from '@nestjs/jwt';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { once } from 'node:events';
import { io, Socket } from 'socket.io-client';
import { AuctionsService } from '../src/auctions/auctions.service';
import { BidsService } from '../src/bids/bids.service';

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

    await dataSource.getRepository('AuditLog').save({
      eventType: 'RESERVE_NOT_MET',
      auctionId,
      actorId: BIDDER_UUID,
      actorName: 'Real Bidder Name',
      metadata: { reservePrice: 9999 },
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
    /Socket Real Bidder/,
    /priv-seller@test\.com/,
    /priv-bidder@test\.com/,
    /socket-priv-bidder@test\.com/,
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

  it('GET /auctions/:id/audit — bidder does not see private metadata or identities', async () => {
    const res = await request(app.getHttpServer())
      .get('/auctions/' + auctionId + '/audit')
      .set('Authorization', 'Bearer ' + BIDDER_TOKEN_FN());
    expect(res.status).toBe(200);
    assertNoLeak(res.body);
  });

  it('GET /auctions/:id/minimum-bid — public response contains no private data', async () => {
    const res = await request(app.getHttpServer())
      .get('/auctions/' + auctionId + '/minimum-bid');
    expect(res.status).toBe(200);
    assertNoLeak(res.body);
  });

  it('GET /auctions/:id/bids/auto/me — does not expose any bidder maximum', async () => {
    const otherId = 'c0000000-0000-0000-0000-000000000003';
    await dataSource.getRepository('User').save({
      id: otherId,
      email: 'other-priv-bidder@test.com',
      name: 'Other Real Bidder',
      password: 'hash',
      role: 'BIDDER',
    });
    await dataSource.getRepository('AutoBid').save({
      maxAmount: 8888,
      isActive: true,
      auctionId,
      bidderId: otherId,
    });

    const res = await request(app.getHttpServer())
      .get('/auctions/' + auctionId + '/bids/auto/me')
      .set('Authorization', 'Bearer ' + BIDDER_TOKEN_FN());
    expect(res.status).toBe(200);
    assertNoLeak(res.body);
    expect(JSON.stringify(res.body)).not.toContain('8888');
    expect(JSON.stringify(res.body)).not.toContain('Other Real Bidder');
    expect(JSON.stringify(res.body)).not.toContain('other-priv-bidder@test.com');
  });

  it('bid and auction-ended socket payloads contain aliases, not private values or identities', async () => {
    const secondBidderId = 'c0000000-0000-0000-0000-000000000004';
    const secondBidder = await dataSource.getRepository('User').save({
      id: secondBidderId,
      email: 'socket-priv-bidder@test.com',
      name: 'Socket Real Bidder',
      password: 'hash',
      role: 'BIDDER',
    });
    await app.listen(0);
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected the auction test server to have a TCP address');
    }
    const socket: Socket = io(`http://127.0.0.1:${address.port}/auction`, {
      transports: ['websocket'],
    });
    const withTimeout = <T>(
      promise: Promise<T>,
      eventName: string,
      timeoutMs = 3000,
    ) =>
      new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`Socket ${eventName} timed out`)),
          timeoutMs,
        );
        promise.then(
          (value) => {
            clearTimeout(timeout);
            resolve(value);
          },
          (error) => {
            clearTimeout(timeout);
            reject(error);
          },
        );
      });

    try {
      await withTimeout(once(socket, 'connect'), 'connect', 5000);
      socket.emit('join-auction', { auctionId });
      await new Promise((resolve) => setTimeout(resolve, 25));

      const bidEvent = once(socket, 'bid-placed').then(([payload]) => payload);
      await app.get(BidsService).placeBid(auctionId, secondBidder, {
        amount: 2000,
        idempotencyKey: 'socket-privacy-bid',
      });
      assertNoLeak(await withTimeout(bidEvent, 'bid-placed'));

      await dataSource.getRepository('Auction').update(auctionId, {
        reservePrice: 1000,
        endTime: new Date(Date.now() - 1000),
      });
      const endedEvent = once(socket, 'auction-ended').then(([payload]) => payload);
      await app.get(AuctionsService).closeAuction(auctionId);
      assertNoLeak(await withTimeout(endedEvent, 'auction-ended'));
    } finally {
      socket.disconnect();
    }
  }, 15000);

  it('GET /auctions/:id — admin still sees reservePrice', async () => {
    const res = await request(app.getHttpServer())
      .get('/auctions/' + auctionId)
      .set('Authorization', 'Bearer ' + ADMIN_TOKEN_FN());
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toMatch(/reservePrice/);
  });
});
