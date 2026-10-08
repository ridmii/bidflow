import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The status column is varchar, so no ALTER TYPE is needed.
 * This migration documents that 'COMPLETING' is a valid ephemeral status
 * used atomically during auction closing and confirms it fits the column.
 *
 * It also drops the now-unused isClosing boolean column that was replaced
 * by the COMPLETING status transition.
 */
export class AddCompletingStatus1791500000000 implements MigrationInterface {
  name = 'AddCompletingStatus1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // isClosing was an unlocked flag replaced by the COMPLETING status; remove it.
    const cols = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'auctions' AND column_name = 'isClosing'`
    );
    if (cols.length > 0) {
      await queryRunner.query(`ALTER TABLE "auctions" DROP COLUMN "isClosing"`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "auctions" ADD COLUMN "isClosing" boolean NOT NULL DEFAULT false`
    );
  }
}
