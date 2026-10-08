import {
  calculateMinimumIncrement,
  calculateMinimumNextBid,
} from '../src/bids/bid-increment.util';
import { describe, it, expect } from 'vitest';

describe('BidIncrement Utility', () => {
  describe('calculateMinimumIncrement', () => {
    it('returns Rs. 100 for price <= 10,000', () => {
      expect(calculateMinimumIncrement(0)).toBe(100);
      expect(calculateMinimumIncrement(5000)).toBe(100);
      expect(calculateMinimumIncrement(10000)).toBe(100);
    });

    it('returns Rs. 500 for price 10,001 - 50,000', () => {
      expect(calculateMinimumIncrement(10001)).toBe(500);
      expect(calculateMinimumIncrement(25000)).toBe(500);
      expect(calculateMinimumIncrement(50000)).toBe(500);
    });

    it('returns Rs. 1,000 for price 50,001 - 100,000', () => {
      expect(calculateMinimumIncrement(50001)).toBe(1000);
      expect(calculateMinimumIncrement(75000)).toBe(1000);
      expect(calculateMinimumIncrement(100000)).toBe(1000);
    });

    it('returns Rs. 2,500 for price above 100,000', () => {
      expect(calculateMinimumIncrement(100001)).toBe(2500);
      expect(calculateMinimumIncrement(500000)).toBe(2500);
    });
  });

  describe('calculateMinimumNextBid', () => {
    it('returns current price + increment', () => {
      expect(calculateMinimumNextBid(5000)).toBe(5100);
      expect(calculateMinimumNextBid(25000)).toBe(25500);
      expect(calculateMinimumNextBid(75000)).toBe(76000);
      expect(calculateMinimumNextBid(150000)).toBe(152500);
    });
  });
});
