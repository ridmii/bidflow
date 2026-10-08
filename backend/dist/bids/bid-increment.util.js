"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateMinimumIncrement = calculateMinimumIncrement;
exports.calculateMinimumNextBid = calculateMinimumNextBid;
function calculateMinimumIncrement(currentPrice) {
    if (currentPrice <= 10000)
        return 100;
    if (currentPrice <= 50000)
        return 500;
    if (currentPrice <= 100000)
        return 1000;
    return 2500;
}
function calculateMinimumNextBid(currentPrice) {
    return currentPrice + calculateMinimumIncrement(currentPrice);
}
//# sourceMappingURL=bid-increment.util.js.map