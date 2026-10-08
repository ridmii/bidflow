/**
 * Bid Increment Rules based on current price.
 * The backend determines the applicable increment - never trust client.
 */
export function calculateMinimumIncrement(currentPrice: number): number {
  if (currentPrice <= 10000) return 100;
  if (currentPrice <= 50000) return 500;
  if (currentPrice <= 100000) return 1000;
  return 2500;
}

export function calculateMinimumNextBid(currentPrice: number): number {
  return currentPrice + calculateMinimumIncrement(currentPrice);
}
