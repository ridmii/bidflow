/**
 * Bid Increment Rules based on current price.
 * The backend determines the applicable increment - never trust client.
 */
export function calculateMinimumIncrement(currentPrice: number, tiers?: { maxPrice: number, increment: number }[]): number {
  if (!tiers || tiers.length === 0) {
    tiers = [
      { maxPrice: 10000, increment: 100 },
      { maxPrice: 50000, increment: 500 },
      { maxPrice: 100000, increment: 1000 },
      { maxPrice: Infinity, increment: 2500 }
    ];
  } else {
    tiers = [...tiers].sort((a, b) => {
      const aMax = a.maxPrice == null ? Infinity : a.maxPrice;
      const bMax = b.maxPrice == null ? Infinity : b.maxPrice;
      return aMax - bMax;
    });
  }

  for (const tier of tiers) {
    const max = tier.maxPrice == null ? Infinity : tier.maxPrice;
    if (currentPrice <= max) {
      return tier.increment;
    }
  }
  return tiers[tiers.length - 1].increment;
}

export function calculateMinimumNextBid(currentPrice: number, tiers?: { maxPrice: number, increment: number }[]): number {
  return currentPrice + calculateMinimumIncrement(currentPrice, tiers);
}
