"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddIncrementTiers1791600000000 = void 0;
class AddIncrementTiers1791600000000 {
    name = 'AddIncrementTiers1791600000000';
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "auctions"
        ADD COLUMN IF NOT EXISTS "tier1Increment" integer NOT NULL DEFAULT 100,
        ADD COLUMN IF NOT EXISTS "tier2Increment" integer NOT NULL DEFAULT 500,
        ADD COLUMN IF NOT EXISTS "tier3Increment" integer NOT NULL DEFAULT 1000,
        ADD COLUMN IF NOT EXISTS "tier4Increment" integer NOT NULL DEFAULT 2500
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "auctions"
        DROP COLUMN IF EXISTS "tier1Increment",
        DROP COLUMN IF EXISTS "tier2Increment",
        DROP COLUMN IF EXISTS "tier3Increment",
        DROP COLUMN IF EXISTS "tier4Increment"
    `);
    }
}
exports.AddIncrementTiers1791600000000 = AddIncrementTiers1791600000000;
//# sourceMappingURL=1791600000000-AddIncrementTiers.js.map