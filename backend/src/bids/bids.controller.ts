import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { BidsService } from './bids.service';
import { PlaceBidDto } from './dto/place-bid.dto';
import { SetAutoBidDto } from './dto/set-auto-bid.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('auctions/:auctionId/bids')
@UseGuards(JwtAuthGuard)
export class BidsController {
  constructor(private readonly bidsService: BidsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async placeBid(
    @Param('auctionId') auctionId: string,
    @Request() req,
    @Body() dto: PlaceBidDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 1 || idempotencyKey.length > 64) {
      throw new BadRequestException('Idempotency-Key must be a string up to 64 characters');
    }
    dto.idempotencyKey = idempotencyKey;

    const bid = await this.bidsService.placeBid(auctionId, req.user, dto);
    return {
      message: 'Bid placed successfully',
      bid: {
        id: bid.id,
        amount: bid.amount,
        placedAt: bid.placedAt,
        auctionId: bid.auctionId,
      },
    };
  }

  @Get()
  async getBidHistory(@Param('auctionId') auctionId: string, @Request() req) {
    return this.bidsService.getBidHistory(auctionId, req.user);
  }

  @Post('auto')
  async setAutoBid(
    @Param('auctionId') auctionId: string,
    @Request() req,
    @Body() dto: SetAutoBidDto,
  ) {
    return this.bidsService.setAutoBid(auctionId, req.user, dto);
  }

  @Get('auto/me')
  async getMyAutoBid(
    @Param('auctionId') auctionId: string,
    @Request() req,
  ) {
    return this.bidsService.getMyAutoBid(auctionId, req.user.id);
  }
}
