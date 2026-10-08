import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditEventType } from './entities/audit-log.entity';

interface LogParams {
  eventType: AuditEventType;
  auctionId?: string;
  actorId?: string;
  actorName?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
  ) {}

  async log(params: LogParams, manager?: import('typeorm').EntityManager): Promise<void> {
    try {
      const repo = manager ? manager.getRepository(AuditLog) : this.auditRepo; const entry = repo.create({
        eventType: params.eventType,
        auctionId: params.auctionId,
        actorId: params.actorId,
        actorName: params.actorName,
        metadata: params.metadata || {},
      });
      await repo.save(entry);
    } catch (err) {
      // Never let audit failures break business logic
      console.error('Audit log failed:', err);
    }
  }

  async getAuctionLogs(auctionId: string): Promise<AuditLog[]> {
    return this.auditRepo.find({
      where: { auctionId },
      order: { createdAt: 'ASC' },
    });
  }
}
