import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateBidPlacedAt1791449575919 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bids" ALTER COLUMN "placedAt" SET DEFAULT clock_timestamp()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bids" ALTER COLUMN "placedAt" SET DEFAULT now()`);
    }

}
