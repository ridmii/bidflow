import { Repository } from 'typeorm';
import { AuditLog, AuditEventType } from './entities/audit-log.entity';
interface LogParams {
    eventType: AuditEventType;
    auctionId?: string;
    actorId?: string;
    actorName?: string;
    metadata?: Record<string, any>;
}
export declare class AuditService {
    private auditRepo;
    constructor(auditRepo: Repository<AuditLog>);
    log(params: LogParams, manager?: import('typeorm').EntityManager): Promise<void>;
    getAuctionLogs(auctionId: string): Promise<AuditLog[]>;
}
export {};
