import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Auction } from '../../auctions/entities/auction.entity';
import { User } from '../../users/entities/user.entity';

@Entity('auto_bids')
@Unique(['auctionId', 'bidderId'])
export class AutoBid {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ })
  maxAmount: number; // Private - never expose to other users

  @Column({ default: true })
  isActive: boolean;

  @Column()
  auctionId: string;

  @Column()
  bidderId: string;

  @ManyToOne(() => Auction, (auction) => auction.autoBids, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'auctionId' })
  auction: Auction;

  @ManyToOne(() => User, (user) => user.autoBids, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bidderId' })
  bidder: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
