import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Bid } from '../../bids/entities/bid.entity';
import { AutoBid } from '../../bids/entities/auto-bid.entity';

export const UserRole = {
  ADMIN: 'ADMIN' as const,
  BIDDER: 'BIDDER' as const,
};
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  name: string;

  @Column({ select: false })
  password: string;

  @Column({ type: 'varchar', default: UserRole.BIDDER })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => Bid, (bid) => bid.bidder)
  bids: Bid[];

  @OneToMany(() => AutoBid, (ab) => ab.bidder)
  autoBids: AutoBid[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
