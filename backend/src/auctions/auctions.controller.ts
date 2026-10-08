import { Delete } from '@nestjs/common';
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuctionsService } from './auctions.service';
import { CreateAuctionDto, UpdateAuctionDto } from './dto/create-auction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuctionStatus } from './entities/auction.entity';

@Controller('auctions')
export class AuctionsController {
  constructor(private readonly auctionsService: AuctionsService) {}

  @Get()
  findAll(@Query('status') status?: AuctionStatus) {
    return this.auctionsService.findAll(status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.auctionsService.findOne(id);
  }

  @Get(':id/minimum-bid')
  getMinimumNextBid(@Param('id') id: string) {
    return this.auctionsService.getMinimumNextBid(id);
  }

  @Get(':id/audit')
  @UseGuards(JwtAuthGuard)
  getAuditLog(@Param('id') id: string) {
    return this.auctionsService.getAuctionAuditLog(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  create(@Request() req, @Body() dto: CreateAuctionDto) {
    return this.auctionsService.create(req.user, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: UpdateAuctionDto,
  ) {
    return this.auctionsService.update(id, req.user, dto);
  }

  @Post(':id/schedule')
  @UseGuards(JwtAuthGuard)
  schedule(@Param('id') id: string, @Request() req) {
    return this.auctionsService.scheduleAuction(id, req.user);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  cancel(@Param('id') id: string, @Request() req) {
    return this.auctionsService.cancelAuction(id, req.user);
  }
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  delete(@Param('id') id: string, @Request() req) {
    return this.auctionsService.deleteAuction(id, req.user);
  }
}


