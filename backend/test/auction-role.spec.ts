import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { JwtService } from '@nestjs/jwt';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

describe('AuctionsController - Role enforcement', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  // Fixed UUIDs so tokens and DB rows always match
  const ADMIN_UUID = 'a0000000-0000-0000-0000-000000000001';
  const BIDDER_UUID = 'b0000000-0000-0000-0000-000000000001';
  let auctionId: string;

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

  // Re-seed after global beforeEach truncation
  beforeEach(async () => {
    const userRepo = dataSource.getRepository('User');
    await userRepo.save([
      { id: ADMIN_UUID, email: 'role-admin@test.com', name: 'Admin', password: 'hash', role: 'ADMIN' },
      { id: BIDDER_UUID, email: 'role-bidder@test.com', name: 'Bidder', password: 'hash', role: 'BIDDER' },
    ]);
    const auctionRepo = dataSource.getRepository('Auction');
    const auction = await auctionRepo.save({
      title: 'Role Test', description: 'desc',
      startingPrice: 1000, currentPrice: 1000,
      startTime: new Date(Date.now() + 3_600_000),
      endTime: new Date(Date.now() + 7_200_000),
      status: 'DRAFT', version: 1, createdById: ADMIN_UUID,
    });
    auctionId = auction.id;
  });

  const adminToken = () =>
    jwtService.sign({ sub: ADMIN_UUID, email: 'role-admin@test.com', role: 'ADMIN' });
  const bidderToken = () =>
    jwtService.sign({ sub: BIDDER_UUID, email: 'role-bidder@test.com', role: 'BIDDER' });

  it('POST /auctions — no token returns 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/auctions')
      .send({ title: 'T', description: 'D', startingPrice: 100,
        startTime: new Date(Date.now() + 1000).toISOString(),
        endTime: new Date(Date.now() + 100000).toISOString() });
    expect(res.status).toBe(401);
  });

  it('POST /auctions — bidder token returns 403', async () => {
    const res = await request(app.getHttpServer())
      .post('/auctions')
      .set('Authorization', 'Bearer ' + bidderToken())
      .send({ title: 'T', description: 'D', startingPrice: 100,
        startTime: new Date(Date.now() + 1000).toISOString(),
        endTime: new Date(Date.now() + 100000).toISOString() });
    expect(res.status).toBe(403);
  });

  it('PATCH /auctions/:id — no token returns 401', async () => {
    const res = await request(app.getHttpServer())
      .patch('/auctions/' + auctionId).send({ title: 'New' });
    expect(res.status).toBe(401);
  });

  it('PATCH /auctions/:id — bidder token returns 403', async () => {
    const res = await request(app.getHttpServer())
      .patch('/auctions/' + auctionId)
      .set('Authorization', 'Bearer ' + bidderToken())
      .send({ title: 'New' });
    expect(res.status).toBe(403);
  });

  it('POST /auctions/:id/schedule — no token returns 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/auctions/' + auctionId + '/schedule');
    expect(res.status).toBe(401);
  });

  it('POST /auctions/:id/schedule — bidder token returns 403', async () => {
    const res = await request(app.getHttpServer())
      .post('/auctions/' + auctionId + '/schedule')
      .set('Authorization', 'Bearer ' + bidderToken());
    expect(res.status).toBe(403);
  });

  it('POST /auctions/:id/cancel — no token returns 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/auctions/' + auctionId + '/cancel');
    expect(res.status).toBe(401);
  });

  it('POST /auctions/:id/cancel — bidder token returns 403', async () => {
    const res = await request(app.getHttpServer())
      .post('/auctions/' + auctionId + '/cancel')
      .set('Authorization', 'Bearer ' + bidderToken());
    expect(res.status).toBe(403);
  });

  it('DELETE /auctions/:id — no token returns 401', async () => {
    const res = await request(app.getHttpServer())
      .delete('/auctions/' + auctionId);
    expect(res.status).toBe(401);
  });

  it('DELETE /auctions/:id — bidder token returns 403', async () => {
    const res = await request(app.getHttpServer())
      .delete('/auctions/' + auctionId)
      .set('Authorization', 'Bearer ' + bidderToken());
    expect(res.status).toBe(403);
  });

  it('GET /auctions — bidder cannot list DRAFT auctions, including with a DRAFT filter', async () => {
    const allAuctions = await request(app.getHttpServer())
      .get('/auctions')
      .set('Authorization', 'Bearer ' + bidderToken());
    expect(allAuctions.status).toBe(200);
    expect(allAuctions.body).toHaveLength(0);

    const drafts = await request(app.getHttpServer())
      .get('/auctions?status=DRAFT')
      .set('Authorization', 'Bearer ' + bidderToken());
    expect(drafts.status).toBe(200);
    expect(drafts.body).toHaveLength(0);
  });

  it('GET /auctions/:id — bidder cannot fetch a DRAFT auction', async () => {
    const res = await request(app.getHttpServer())
      .get('/auctions/' + auctionId)
      .set('Authorization', 'Bearer ' + bidderToken());
    expect(res.status).toBe(404);
  });

  it('POST /auctions — admin token creates auction (smoke test)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auctions')
      .set('Authorization', 'Bearer ' + adminToken())
      .send({ title: 'Admin Auction', description: 'desc', startingPrice: 500,
        startTime: new Date(Date.now() + 3_600_000).toISOString(),
        endTime: new Date(Date.now() + 7_200_000).toISOString() });
    expect(res.status).toBe(201);
  });
});
