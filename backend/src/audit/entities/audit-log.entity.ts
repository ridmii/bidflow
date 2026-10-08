import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Auction } from '../../auctions/entities/auction.entity';

export const AuditEventType = {
  AUCTION_CREATED: 'AUCTION_CREATED' as const,
  AUCTION_STARTED: 'AUCTION_STARTED' as const,
  AUCTION_SCHEDULED: 'AUCTION_SCHEDULED' as const,
  AUCTION_CANCELLED: 'AUCTION_CANCELLED' as const,
  AUCTION_EXTENDED: 'AUCTION_EXTENDED' as const,
  AUCTION_ENDED: 'AUCTION_ENDED' as const,
  WINNER_SELECTED: 'WINNER_SELECTED' as const,
  RESERVE_NOT_MET: 'RESERVE_NOT_MET' as const,
  BID_PLACED: 'BID_PLACED' as const,
  BID_REJECTED: 'BID_REJECTED' as const,
  AUTO_BID_PLACED: 'AUTO_BID_PLACED' as const,
  AUTO_BID_CONFIGURED: 'AUTO_BID_CONFIGURED' as const,
  LEADER_CHANGED: 'LEADER_CHANGED' as const,
};
export type AuditEventType = (typeof AuditEventType)[keyof typeof AuditEventType];

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  eventType: AuditEventType;

  @Column({ nullable: true })
  auctionId: string;

  @Column({ nullable: true })
  actorId: string;

  @Column({ nullable: true })
  actorName: string;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @ManyToOne(() => Auction, (auction) => auction.auditLogs, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'auctionId' })
  auction: Auction;

  @CreateDateColumn()
  createdAt: Date;
}
