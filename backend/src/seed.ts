import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './users/entities/user.entity';
import { Auction, AuctionStatus } from './auctions/entities/auction.entity';
import { AppDataSource } from '../typeorm.config';

async function seed() {
  await AppDataSource.initialize();
  console.log('Database connected.');

  const userRepo = AppDataSource.getRepository(User);
  const auctionRepo = AppDataSource.getRepository(Auction);

  const adminEmail = 'admin@auction.com';
  let admin = await userRepo.findOne({ where: { email: adminEmail } });
  if (!admin) {
    admin = userRepo.create({
      email: adminEmail,
      name: 'Admin User',
      password: await bcrypt.hash('password123', 10),
      role: UserRole.ADMIN,
    });
    await userRepo.save(admin);
    console.log('Created Admin.');
  }

  const bidders = [];
  for (let i = 1; i <= 3; i++) {
    const email = 'bidder' + i + '@auction.com';
    let bidder = await userRepo.findOne({ where: { email } });
    if (!bidder) {
      bidder = userRepo.create({
        email,
        name: 'Bidder ' + i,
        password: await bcrypt.hash('password123', 10),
        role: UserRole.BIDDER,
      });
      await userRepo.save(bidder);
      console.log('Created Bidder ' + i);
    }
    bidders.push(bidder);
  }

  const titles = ['Antique Vase', 'Vintage Watch', 'Classic Car'];
  const statuses = [AuctionStatus.DRAFT, AuctionStatus.SCHEDULED, AuctionStatus.LIVE];

  for (let i = 0; i < 3; i++) {
    const title = titles[i];
    let auction = await auctionRepo.findOne({ where: { title } });
    if (!auction) {
      const now = new Date();
      auction = auctionRepo.create({
        title,
        description: 'Description for ' + title,
        startingPrice: 1000 * (i + 1),
        currentPrice: 1000 * (i + 1),
        startTime: new Date(now.getTime() - 100000),
        endTime: new Date(now.getTime() + 100000 * (i + 1)),
        status: statuses[i],
        createdById: admin.id,
        version: 1
      });
      await auctionRepo.save(auction);
      console.log('Created Auction: ' + title);
    }
  }

  console.log('Seeding complete.');
  await AppDataSource.destroy();
}

seed().catch(console.error);
