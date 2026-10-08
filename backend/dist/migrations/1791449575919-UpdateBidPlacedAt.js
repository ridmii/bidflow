"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateBidPlacedAt1791449575919 = void 0;
class UpdateBidPlacedAt1791449575919 {
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "bids" ALTER COLUMN "placedAt" SET DEFAULT clock_timestamp()`);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "bids" ALTER COLUMN "placedAt" SET DEFAULT now()`);
    }
}
exports.UpdateBidPlacedAt1791449575919 = UpdateBidPlacedAt1791449575919;
//# sourceMappingURL=1791449575919-UpdateBidPlacedAt.js.map