import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuctionScheduler } from './auction.scheduler';
import { Auction } from '../auctions/entities/auction.entity';
import { AuctionsModule } from '../auctions/auctions.module';
import { GatewayModule } from '../gateway/gateway.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Auction]),
    AuctionsModule,
    GatewayModule,
    AuditModule,
  ],
  providers: [AuctionScheduler],
})
export class SchedulerModule {}
