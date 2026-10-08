import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuctionsService } from './auctions.service';
import { AuctionsController } from './auctions.controller';
import { Auction } from './entities/auction.entity';
import { AuditModule } from '../audit/audit.module';
import { GatewayModule } from '../gateway/gateway.module';
import { ClockService } from '../common/clock.service';

@Module({
  imports: [TypeOrmModule.forFeature([Auction]), AuditModule, GatewayModule],
  controllers: [AuctionsController],
  providers: [AuctionsService, ClockService],
  exports: [AuctionsService, ClockService],
})
export class AuctionsModule {}
