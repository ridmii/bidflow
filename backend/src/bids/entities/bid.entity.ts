import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Auction } from '../../auctions/entities/auction.entity';
import { User } from '../../users/entities/user.entity';

export const BidType = {
  MANUAL: 'MANUAL' as const,
  AUTO: 'AUTO' as const,
};
export type BidType = (typeof BidType)[keyof typeof BidType];

@Entity('bids')
export class Bid {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal' })
  amount: number;

  @Column({ type: 'varchar', default: BidType.MANUAL })
  type: BidType;

  @Column()
  auctionId: string;

  @Column()
  bidderId: string;

  @Column()
  bidderName: string;

  @Column({ nullable: true })
  idempotencyKey: string;

  @ManyToOne(() => Auction, (auction) => auction.bids, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'auctionId' })
  auction: Auction;

  @ManyToOne(() => User, (user) => user.bids, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bidderId' })
  bidder: User;

  @CreateDateColumn({ type: 'timestamp', default: () => 'clock_timestamp()' })
  placedAt: Date;
}
