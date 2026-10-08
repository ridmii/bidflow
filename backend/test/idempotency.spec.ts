import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { JwtService } from '@nestjs/jwt';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

describe('BidsController (e2e) - Idempotency', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

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

  const setupAuction = async (price = 1000) => {
    const auctionRepo = dataSource.getRepository('Auction');
    const auction = auctionRepo.create({
      title: 'Idempotency Test',
      description: 'Testing',
      startingPrice: price,
      currentPrice: price,
      startTime: new Date(Date.now() - 10000),
      endTime: new Date(Date.now() + 100000),
      status: 'LIVE',
      version: 1,
    });
    return await auctionRepo.save(auction);
  };

  const setupUser = async (email: string) => {
    const userRepo = dataSource.getRepository('User');
    const u = userRepo.create({
      email,
      name: 'Test Bidder',
      password: 'pass',
      role: 'BIDDER',
    });
    return await userRepo.save(u);
  };

  const getToken = (userId: string, email: string) => {
    return jwtService.sign({ sub: userId, email, role: 'BIDDER' });
  };

  it('missing header returns 400', async () => {
    const auction = await setupAuction();
    const user = await setupUser('user1@test.com');
    const token = getToken(user.id, user.email);

    const res = await request(app.getHttpServer())
      .post('/auctions/' + auction.id + '/bids')
      .set('Authorization', 'Bearer ' + token)
      .send({ amount: 1500 });
      
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Idempotency-Key header is required/);
  });

  it('same key sent 5 times in parallel gives exactly one bid row', async () => {
    const auction = await setupAuction();
    const user = await setupUser('user2@test.com');
    const token = getToken(user.id, user.email);
    const bidsRepo = dataSource.getRepository('Bid');
    
    const key = 'idem-key-1';
    
    const requests = Array.from({ length: 5 }).map(() =>
      request(app.getHttpServer())
        .post('/auctions/' + auction.id + '/bids')
        .set('Authorization', 'Bearer ' + token)
        .set('Idempotency-Key', key)
        .send({ amount: 1500 })
    );

    const responses = await Promise.all(requests);

    // One succeeds with 201, others should also receive 201 because idempotency returns exactly the same response
    responses.forEach(res => {
      expect(res.status).toBe(201);
      expect(res.body.bid).toBeDefined();
    });

    const firstBidId = responses[0].body.bid.id;
    responses.forEach(res => {
      expect(res.body.bid.id).toBe(firstBidId); // Exact same bid returned
    });

    // Check DB
    const bidsInDb = await bidsRepo.find({ where: { auctionId: auction.id } });
    expect(bidsInDb.length).toBe(1);
  }, 15000);

  it('two different users using the same key string do not collide', async () => {
    const auction = await setupAuction();
    const user1 = await setupUser('u1@test.com');
    const user2 = await setupUser('u2@test.com');
    const token1 = getToken(user1.id, user1.email);
    const token2 = getToken(user2.id, user2.email);
    const bidsRepo = dataSource.getRepository('Bid');
    
    const key = 'shared-key';

    await request(app.getHttpServer())
      .post('/auctions/' + auction.id + '/bids')
      .set('Authorization', 'Bearer ' + token1)
      .set('Idempotency-Key', key)
      .send({ amount: 1500 });

    await request(app.getHttpServer())
      .post('/auctions/' + auction.id + '/bids')
      .set('Authorization', 'Bearer ' + token2)
      .set('Idempotency-Key', key)
      .send({ amount: 2000 });
    
    const dbBids = await bidsRepo.find({ where: { auctionId: auction.id } });
    expect(dbBids.length).toBe(2);
  }, 15000);

  it('same user using the same key on a different auction does not collide', async () => {
    const auction1 = await setupAuction();
    const auction2 = await setupAuction();
    const user = await setupUser('u@test.com');
    const token = getToken(user.id, user.email);
    const bidsRepo = dataSource.getRepository('Bid');
    
    const key = 'multi-auction-key';

    const res1 = await request(app.getHttpServer())
      .post('/auctions/' + auction1.id + '/bids')
      .set('Authorization', 'Bearer ' + token)
      .set('Idempotency-Key', key)
      .send({ amount: 1500 });

    const res2 = await request(app.getHttpServer())
      .post('/auctions/' + auction2.id + '/bids')
      .set('Authorization', 'Bearer ' + token)
      .set('Idempotency-Key', key)
      .send({ amount: 1500 });
    
    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    
    const dbBids = await bidsRepo.find();
    expect(dbBids.length).toBe(2);
  }, 15000);
});
