import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsDateString,
  IsOptional,
  IsEnum,
  IsInt,
  Matches,
  Min,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AuctionStatus } from '../entities/auction.entity';

export class IncrementTierDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  maxPrice: number | null;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  increment: number;
}

export class CreateAuctionDto {
  @IsOptional()
  @IsEnum(AuctionStatus)
  status?: AuctionStatus;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  title: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  description: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  startingPrice: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  reservePrice?: number;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  minimumBidIncrement?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  antiSnipingDuration?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  extensionDuration?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxExtensions?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IncrementTierDto)
  incrementTiers?: IncrementTierDto[];
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

  @IsOptional()
  @IsNumber()
  @IsPositive()
  startingPrice?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  reservePrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  minimumBidIncrement?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IncrementTierDto)
  incrementTiers?: IncrementTierDto[];

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
