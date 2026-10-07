import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AuctionsModule } from './auctions/auctions.module';
import { BidsModule } from './bids/bids.module';
import { AuctionGateway } from './gateway/auction.gateway';
import { GatewayModule } from './gateway/gateway.module';
import { AuctionScheduler } from './scheduler/auction.scheduler';
import { SchedulerModule } from './scheduler/scheduler.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    ConfigModule.forRoot({ 
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env'
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const dbName = config.get<string>('DB_NAME');
        if (process.env.NODE_ENV === 'test' && !dbName?.endsWith('_test_db')) {
          throw new Error('Safety Check: Tests must run against a database ending with _test_db');
        }
        return {
          type: 'postgres',
          host: config.get<string>('DB_HOST', 'localhost'),
          port: config.get<number>('DB_PORT', 5432),
          username: config.get<string>('DB_USERNAME'),
          password: config.get<string>('DB_PASSWORD'),
          database: dbName,
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: false, // Migrations only
          logging: process.env.NODE_ENV === 'development',
          extra: {
            max: process.env.NODE_ENV === 'test' ? 20 : 10,
          }
        };
      },
      inject: [ConfigService],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    AuthModule,
    UsersModule,
    AuctionsModule,
    BidsModule,
    GatewayModule,
    SchedulerModule,
    AuditModule,
  ],
})
export class AppModule {}
