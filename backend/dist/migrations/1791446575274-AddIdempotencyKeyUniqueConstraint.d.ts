import { MigrationInterface, QueryRunner } from "typeorm";
export declare class AddIdempotencyKeyUniqueConstraint1791446575274 implements MigrationInterface {
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
