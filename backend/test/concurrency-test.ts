import { AppDataSource } from '../typeorm-test.config';
import { BidsService } from '../src/bids/bids.service';
import { User, UserRole } from '../src/users/entities/user.entity';
import { Auction, AuctionStatus } from '../src/auctions/entities/auction.entity';

async function run() {
  await AppDataSource.initialize();
  const userRepo = AppDataSource.getRepository(User);
  const auctionRepo = AppDataSource.getRepository(Auction);
  const bidsRepo = AppDataSource.getRepository('Bid');
  const autoBidsRepo = AppDataSource.getRepository('AutoBid');

  const mockService = new BidsService(
    bidsRepo as any,
    autoBidsRepo as any,
    auctionRepo,
    AppDataSource,
    { log: async () => {} } as any,
    { emitBidPlaced: () => {}, emitAuctionExtended: () => {} } as any
  );
  
  // Override processAutoBids so it doesn't crash the process when destroying connection
  mockService.processAutoBids = async () => {};

  // Clear tables
  await userRepo.query('TRUNCATE TABLE "users" CASCADE');
  await auctionRepo.query('TRUNCATE TABLE "auctions" CASCADE');

  const auction = auctionRepo.create({
    title: 'Concurrency Test',
    description: 'Testing simultaneous bids',
    startingPrice: 1000,
    currentPrice: 1000,
    startTime: new Date(Date.now() - 10000),
    endTime: new Date(Date.now() + 100000),
    status: AuctionStatus.LIVE,
    version: 1,
  });
  await auctionRepo.save(auction);

  const bidders = [];
  for (let i = 1; i <= 20; i++) {
    const u = userRepo.create({
      email: 'c_bidder' + i + '@test.com',
      name: 'C Bidder ' + i,
      password: 'pass',
      role: UserRole.BIDDER,
    });
    await userRepo.save(u);
    bidders.push(u);
  }

  console.log('Firing 20 concurrent bids in a Promise.all...');
  const promises = bidders.map((bidder, index) => 
    mockService.placeBid(auction.id, bidder, { amount: 1000 + (index + 1) * 500 })
      .catch(e => { /* suppress */ })
  );

  await Promise.all(promises);

  const updatedAuction = await auctionRepo.findOne({ where: { id: auction.id } });
  console.log('Expected Price: ', 1000 + 20 * 500);
  console.log('Actual Price:   ', updatedAuction?.currentPrice);
  
  await AppDataSource.destroy();
}

run().catch(console.error);
