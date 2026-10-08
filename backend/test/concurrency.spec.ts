import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AppDataSource } from '../typeorm-test.config';
import { BidsService } from '../src/bids/bids.service';

describe('BidsService - Concurrency', () => {
  let bidsService: any;
  let userRepo: any;
  let auctionRepo: any;
  let bidsRepo: any;
  let autoBidsRepo: any;

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    userRepo = AppDataSource.getRepository('User');
    auctionRepo = AppDataSource.getRepository('Auction');
    bidsRepo = AppDataSource.getRepository('Bid');
    autoBidsRepo = AppDataSource.getRepository('AutoBid');

    bidsService = new BidsService(
      bidsRepo,
      autoBidsRepo,
      auctionRepo,
      AppDataSource,
      { log: async () => {} } as any,
      { emitBidPlaced: () => {}, emitAuctionExtended: () => {} } as any
    );
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });

  beforeEach(async () => {
    if (!AppDataSource.isInitialized) return;
    await userRepo.query('TRUNCATE TABLE "users" CASCADE');
    await auctionRepo.query('TRUNCATE TABLE "auctions" CASCADE');
  });

  const runConcurrencyTest = async (numBids: number, runIndex: number) => {
    const auction = auctionRepo.create({
      title: 'Concurrency Test ' + numBids + ' Run ' + runIndex,
      description: 'Testing simultaneous bids',
      startingPrice: 1000,
      currentPrice: 1000,
      startTime: new Date(Date.now() - 10000),
      endTime: new Date(Date.now() + 100000),
      status: 'LIVE',
      version: 1,
    });
    await auctionRepo.save(auction);

    const bidders = [];
    for (let i = 1; i <= numBids; i++) {
      const u = userRepo.create({
        email: 'c_bidder' + i + '_' + numBids + '_run' + runIndex + '@test.com',
        name: 'C Bidder ' + i,
        password: 'pass',
        role: 'BIDDER',
      });
      await userRepo.save(u);
      bidders.push(u);
    }

    const promises = bidders.map((bidder: any, index: number) => {
      // 50% are just 1000 (will fail) 50% are incrementally higher
      const amount = index % 2 === 0 ? 1000 : 1000 + (index + 1) * 500;
      return bidsService.placeBid(auction.id, bidder, { amount })
        .then((result: any) => ({ status: 'fulfilled', result, bidder, amount }))
        .catch((error: any) => ({ status: 'rejected', error, bidder, amount }));
    });

    const results = await Promise.all(promises);

    const accepted = results.filter((r: any) => r.status === 'fulfilled');
    const rejected = results.filter((r: any) => r.status === 'rejected');

    // Assert: accepted + rejected == requests sent
    expect(accepted.length + rejected.length).toBe(numBids);

    // Assert: no response is a 500; rejected bids return the proper 4xx
    for (const r of rejected as any[]) {
      expect(r.error.status).toBeGreaterThanOrEqual(400);
      expect(r.error.status).toBeLessThan(500); // Only 4xx allowed
    }

    const updatedAuction = await auctionRepo.findOne({ where: { id: auction.id } });
    const allBids = await bidsRepo.find({ 
      where: { auctionId: auction.id },
      order: { amount: 'ASC' } 
    });

    // Assert: bids rows count == accepted count
    expect(allBids.length).toBe(accepted.length);

    if (accepted.length > 0) {
      const highestAccepted = Math.max(...accepted.map((r: any) => r.amount));
      const leader = (accepted.find((r: any) => r.amount === highestAccepted) as any).bidder;

      // Assert: final auction price == highest accepted bid amount
      expect(Number(updatedAuction.currentPrice)).toBe(highestAccepted);
      
      // Assert: leader == the bidder of that highest accepted bid
      expect(updatedAuction.leadingBidderId).toBe(leader.id);

      // Assert: accepted amounts are strictly increasing in insertion order (allBids is ordered by amount naturally? Wait, user asked: 'ordered by insertion (id/created order)')
      // Let's order by placedAt, id! But they are already sorted by amount in the query!
      // Wait, let's just query them by insertion order.
    }

    // Re-query to get exactly by placedAt/id order
    const orderedBids = await bidsRepo.find({ 
      where: { auctionId: auction.id },
      order: { placedAt: 'ASC', id: 'ASC' } 
    });

    if (orderedBids.length > 0) {
      const dbAmounts = orderedBids.map((b: any) => Number(b.amount));
      for (let i = 1; i < dbAmounts.length; i++) {
         expect(dbAmounts[i]).toBeGreaterThan(dbAmounts[i-1]);
      }
    }

    return { accepted: accepted.length, rejected: rejected.length };
  };

  it('handles 10 simultaneous bids cleanly', async () => {
    const res = await runConcurrencyTest(10, 99);
    console.log('10 bids run: ' + res.accepted + ' accepted, ' + res.rejected + ' rejected');
  });

  it('handles 50 simultaneous bids cleanly 20 times in a row', async () => {
    for(let i = 1; i <= 20; i++) {
        const res = await runConcurrencyTest(50, i);
        console.log('Run ' + i + ': ' + res.accepted + ' accepted, ' + res.rejected + ' rejected');
    }
  }, 120000); // timeout 120s
});
