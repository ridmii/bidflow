import {
  IsString,
  IsNumber,
  IsPositive,
  IsDateString,
  IsOptional,
  IsEnum,
  Min,
} from 'class-validator';
import { AuctionStatus } from '../entities/auction.entity';

export class CreateAuctionDto {
  @IsOptional()
  @IsEnum(AuctionStatus)
  status?: AuctionStatus;

  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsNumber()
  @IsPositive()
  startingPrice: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  reservePrice?: number;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  minimumBidIncrement?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  antiSnipingDuration?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  extensionDuration?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxExtensions?: number;
}

export class UpdateAuctionDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsEnum(AuctionStatus)
  status?: AuctionStatus;
}

