"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddIdempotencyKeyUniqueConstraint1791446575274 = void 0;
class AddIdempotencyKeyUniqueConstraint1791446575274 {
    async up(queryRunner) {
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_unique_idempotency_key" 
            ON "bids" ("auctionId", "bidderId", "idempotencyKey") 
            WHERE "idempotencyKey" IS NOT NULL;
        `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
            DROP INDEX "IDX_unique_idempotency_key";
        `);
    }
}
exports.AddIdempotencyKeyUniqueConstraint1791446575274 = AddIdempotencyKeyUniqueConstraint1791446575274;
//# sourceMappingURL=1791446575274-AddIdempotencyKeyUniqueConstraint.js.map