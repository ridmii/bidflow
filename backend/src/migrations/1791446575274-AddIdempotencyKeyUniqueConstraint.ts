import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIdempotencyKeyUniqueConstraint1791446575274 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_unique_idempotency_key" 
            ON "bids" ("auctionId", "bidderId", "idempotencyKey") 
            WHERE "idempotencyKey" IS NOT NULL;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "IDX_unique_idempotency_key";
        `);
    }

}
