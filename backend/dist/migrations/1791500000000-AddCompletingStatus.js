"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddCompletingStatus1791500000000 = void 0;
class AddCompletingStatus1791500000000 {
    name = 'AddCompletingStatus1791500000000';
    async up(queryRunner) {
        const cols = await queryRunner.query(`SELECT column_name FROM information_schema.columns
       WHERE table_name = 'auctions' AND column_name = 'isClosing'`);
        if (cols.length > 0) {
            await queryRunner.query(`ALTER TABLE "auctions" DROP COLUMN "isClosing"`);
        }
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "auctions" ADD COLUMN "isClosing" boolean NOT NULL DEFAULT false`);
    }
}
exports.AddCompletingStatus1791500000000 = AddCompletingStatus1791500000000;
//# sourceMappingURL=1791500000000-AddCompletingStatus.js.map