import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '../src/users/entities/user.entity';

describe('Admin Auction Management (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let adminToken: string;
  let bidderToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
    
    dataSource = app.get(DataSource);
    jwtService = app.get(JwtService);
  });

  beforeEach(async () => {
    const userRepo = dataSource.getRepository(User);
    const admin = await userRepo.save({
      name: 'Admin',
      email: 'admin_test_1@test.com',
      password: 'hash',
      role: UserRole.ADMIN,
    });
    const bidder = await userRepo.save({
      name: 'Bidder',
      email: 'bidder_test_1@test.com',
      password: 'hash',
      role: UserRole.BIDDER,
    });

    adminToken = jwtService.sign({ sub: admin.id, email: admin.email, role: admin.role });
    bidderToken = jwtService.sign({ sub: bidder.id, email: bidder.email, role: bidder.role });
  });

  afterAll(async () => {
    await app.close();
  });

  it('no token gets 401', async () => {
    return request(app.getHttpServer())
      .post('/auctions')
      .send({})
      .expect(401);
  });

  it('bidder gets 403', async () => {
    return request(app.getHttpServer())
      .post('/auctions')
      .set('Authorization', `Bearer ${bidderToken}`)
      .send({
        title: 'Valid',
        description: 'desc',
        startingPrice: 100,
        startTime: new Date(Date.now() + 100000).toISOString(),
        endTime: new Date(Date.now() + 200000).toISOString(),
      })
      .expect(403);
  });

  it('creating an auction with every field works', async () => {
    const res = await request(app.getHttpServer())
      .post('/auctions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Full Auction',
        description: 'desc',
        startingPrice: 100,
        reservePrice: 200,
        startTime: new Date(Date.now() + 100000).toISOString(),
        endTime: new Date(Date.now() + 200000).toISOString(),
        incrementTiers: [{ maxPrice: 1000, increment: 50 }],
        antiSnipingDuration: 120,
        extensionDuration: 120,
        maxExtensions: 3,
        status: 'DRAFT',
      })
      .expect(201);
    
    expect(res.body.title).toBe('Full Auction');
    expect(res.body.reservePrice).toBe(200);
  });

  it('invalid case: reserve below starting price returns 400', async () => {
    return request(app.getHttpServer())
      .post('/auctions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Bad Auction',
        description: 'desc',
        startingPrice: 100,
        reservePrice: 50,
        startTime: new Date(Date.now() + 100000).toISOString(),
        endTime: new Date(Date.now() + 200000).toISOString(),
      })
      .expect(400);
  });

  it('invalid case: end before start returns 400', async () => {
    return request(app.getHttpServer())
      .post('/auctions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Bad Auction 2',
        description: 'desc',
        startingPrice: 100,
        startTime: new Date(Date.now() + 200000).toISOString(),
        endTime: new Date(Date.now() + 100000).toISOString(),
      })
      .expect(400);
  });

  it('invalid case: missing title returns 400', async () => {
    return request(app.getHttpServer())
      .post('/auctions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        description: 'desc',
        startingPrice: 100,
        startTime: new Date(Date.now() + 100000).toISOString(),
        endTime: new Date(Date.now() + 200000).toISOString(),
      })
      .expect(400);
  });

  it('invalid case: negative values return 400', async () => {
    return request(app.getHttpServer())
      .post('/auctions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Negative test',
        description: 'desc',
        startingPrice: -100,
        startTime: new Date(Date.now() + 100000).toISOString(),
        endTime: new Date(Date.now() + 200000).toISOString(),
      })
      .expect(400);
  });

  it('editing a LIVE auction is rejected', async () => {
    // Create live
    const createRes = await request(app.getHttpServer())
      .post('/auctions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Live Auction to edit',
        description: 'desc',
        startingPrice: 100,
        startTime: new Date(Date.now() - 100000).toISOString(),
        endTime: new Date(Date.now() + 100000).toISOString(),
        status: 'LIVE'
      })
      .expect(201);
    
    await request(app.getHttpServer())
      .patch(`/auctions/${createRes.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Changed'
      })
      .expect(400);
  });
});
