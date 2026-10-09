import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, NotFoundException, BadRequestException } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtService } from '@nestjs/jwt';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Auction, AuctionStatus } from '../src/auctions/entities/auction.entity';
import { User } from '../src/users/entities/user.entity';
import { BidsService } from '../src/bids/bids.service';

describe('Bid edge cases against auction_test_db', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let bidsService: BidsService;
  let auctions: Repository<Auction>;
  const BIDDER_ID = 'd0000000-0000-0000-0000-000000000001';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = moduleFixture.get<DataSource>(getDataSourceToken());
    jwtService = moduleFixture.get<JwtService>(JwtService);
    bidsService = moduleFixture.get<BidsService>(BidsService);
    auctions = dataSource.getRepository(Auction);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.getRepository(User).save({
      id: BIDDER_ID,
      email: 'edge-bidder@test.com',
      name: 'Edge Bidder',
      password: 'hash',
      role: 'BIDDER',
    });
  });

  const bidder = (): Promise<User> =>
    dataSource.getRepository(User).findOneByOrFail({ id: BIDDER_ID });

  const makeAuction = (overrides: Partial<Auction> = {}) =>
    auctions.save({
      title: 'Bid edge test',
      description: 'Test auction',
      startingPrice: 1000,
      currentPrice: 1000,
      startTime: new Date(Date.now() - 60_000),
      endTime: new Date(Date.now() + 3_600_000),
      status: AuctionStatus.LIVE,
      ...overrides,
    });

  const token = () =>
    jwtService.sign({ sub: BIDDER_ID, email: 'edge-bidder@test.com', role: 'BIDDER' });

  it('rejects bids below the minimum amount', async () => {
    const auction = await makeAuction();
    await expect(
      bidsService.placeBid(auction.id, await bidder(), { amount: 1099 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects bids before a scheduled auction starts', async () => {
    const auction = await makeAuction({
      status: AuctionStatus.SCHEDULED,
      startTime: new Date(Date.now() + 60_000),
    });
    await expect(
      bidsService.placeBid(auction.id, await bidder(), { amount: 1100 }),
    ).rejects.toThrow(/not live/i);
  });

  it('rejects bids after a LIVE auction ends', async () => {
    const auction = await makeAuction({ endTime: new Date(Date.now() - 1000) });
    await expect(
      bidsService.placeBid(auction.id, await bidder(), { amount: 1100 }),
    ).rejects.toThrow(/ended/i);
  });

  it('rejects bids on cancelled auctions', async () => {
    const auction = await makeAuction({ status: AuctionStatus.CANCELLED });
    await expect(
      bidsService.placeBid(auction.id, await bidder(), { amount: 1100 }),
    ).rejects.toThrow(/not live/i);
  });

  it('returns not found for a nonexistent auction', async () => {
    await expect(
      bidsService.placeBid('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', await bidder(), { amount: 1100 }),
    ).rejects.toThrow(NotFoundException);
  });

  it.each([
    [10_000, 10_100],
    [10_001, 10_501],
    [50_000, 50_500],
    [50_001, 51_001],
    [100_000, 101_000],
    [100_001, 102_501],
  ])('accepts the exact increment boundary bid at current price %i', async (price, minimum) => {
    const auction = await makeAuction({ currentPrice: price });
    const placed = await bidsService.placeBid(auction.id, await bidder(), { amount: minimum });
    expect(Number(placed.amount)).toBe(minimum);
  });

  it('returns 409 ALREADY_LEADING for a leader manual bid', async () => {
    const auction = await makeAuction({ leadingBidderId: BIDDER_ID });
    const res = await request(app.getHttpServer())
      .post(`/auctions/${auction.id}/bids`)
      .set('Authorization', `Bearer ${token()}`)
      .set('Idempotency-Key', 'leader-rebid')
      .send({ amount: 1100 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_LEADING');
  });

  it('extends for a bid within the anti-sniping window', async () => {
    const auction = await makeAuction({
      endTime: new Date(Date.now() + 60_000),
      antiSnipingDuration: 120,
      extensionDuration: 30,
      maxExtensions: 3,
    });

    await bidsService.placeBid(auction.id, await bidder(), { amount: 1100 });
    const updated = await auctions.findOneByOrFail({ id: auction.id });
    expect(updated.extensionCount).toBe(1);
    expect(updated.endTime.getTime()).toBeGreaterThan(auction.endTime.getTime());
  });

  it('does not extend for a bid outside the anti-sniping window', async () => {
    const auction = await makeAuction({
      endTime: new Date(Date.now() + 180_000),
      antiSnipingDuration: 120,
      extensionDuration: 30,
    });

    await bidsService.placeBid(auction.id, await bidder(), { amount: 1100 });
    const updated = await auctions.findOneByOrFail({ id: auction.id });
    expect(updated.extensionCount).toBe(0);
    expect(updated.endTime.getTime()).toBe(auction.endTime.getTime());
  });

  it('does not extend after a rejected bid inside the anti-sniping window', async () => {
    const auction = await makeAuction({
      endTime: new Date(Date.now() + 60_000),
      antiSnipingDuration: 120,
      extensionDuration: 30,
    });

    await expect(
      bidsService.placeBid(auction.id, await bidder(), { amount: 1099 }),
    ).rejects.toThrow(BadRequestException);
    const updated = await auctions.findOneByOrFail({ id: auction.id });
    expect(updated.extensionCount).toBe(0);
    expect(updated.endTime.getTime()).toBe(auction.endTime.getTime());
  });

  it('does not exceed the configured maximum extension count', async () => {
    const auction = await makeAuction({
      endTime: new Date(Date.now() + 60_000),
      antiSnipingDuration: 120,
      extensionDuration: 30,
      extensionCount: 1,
      maxExtensions: 1,
    });

    await bidsService.placeBid(auction.id, await bidder(), { amount: 1100 });
    const updated = await auctions.findOneByOrFail({ id: auction.id });
    expect(updated.extensionCount).toBe(1);
  });
});
