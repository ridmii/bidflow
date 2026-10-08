import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  VersionColumn,
} from 'typeorm';
import { Bid } from '../../bids/entities/bid.entity';
import { AutoBid } from '../../bids/entities/auto-bid.entity';
import { AuditLog } from '../../audit/entities/audit-log.entity';

export const AuctionStatus = {
  DRAFT: 'DRAFT' as const,
  SCHEDULED: 'SCHEDULED' as const,
  LIVE: 'LIVE' as const,
  COMPLETED: 'COMPLETED' as const,
  CANCELLED: 'CANCELLED' as const,
  RESERVE_NOT_MET: 'RESERVE_NOT_MET' as const,
};
export type AuctionStatus = (typeof AuctionStatus)[keyof typeof AuctionStatus];

@Entity('auctions')
export class Auction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'decimal' })
  startingPrice: number;

  @Column({ type: 'decimal', nullable: true })
  reservePrice: number;

  @Column({ type: 'decimal' })
  currentPrice: number;

  @Column()
  startTime: Date;

  @Column()
  endTime: Date;

  @Column({ default: 500 })
  minimumBidIncrement: number;

  @Column({ default: 120 })
  antiSnipingDuration: number;

  @Column({ default: 120 })
  extensionDuration: number;

  @Column({ default: 3 })
  maxExtensions: number;

  @Column({ default: 0 })
  extensionCount: number;

  @Column({ type: 'varchar', default: AuctionStatus.DRAFT })
  status: AuctionStatus;

  @Column({ nullable: true })
  winnerId: string;

  @Column({ nullable: true })
  winnerName: string;

  @Column({ type: 'decimal', nullable: true })
  winningBidAmount: number;

  @Column({ nullable: true })
  createdById: string;

  @Column({ nullable: true })
  leadingBidderId: string;

  @Column({ nullable: true })
  leadingBidderName: string;

  @Column({ default: false })
  isClosing: boolean;

  @VersionColumn()
  version: number;

  @OneToMany(() => Bid, (bid) => bid.auction, { cascade: true })
  bids: Bid[];

  @OneToMany(() => AutoBid, (ab) => ab.auction, { cascade: true })
  autoBids: AutoBid[];

  @OneToMany(() => AuditLog, (log) => log.auction, { cascade: true })
  auditLogs: AuditLog[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
