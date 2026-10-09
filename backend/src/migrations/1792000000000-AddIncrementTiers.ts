import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIncrementTiers1792000000000 implements MigrationInterface {
    name = 'AddIncrementTiers1792000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "auctions" ADD "incrementTiers" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "auctions" DROP COLUMN "incrementTiers"`);
    }
}
