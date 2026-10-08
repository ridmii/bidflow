import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BidsService } from '../src/bids/bids.service';

// Unit tests for bid validation logic, using mocks
describe('BidsService - Bid Validation Logic', () => {
  let bidsService: BidsService;
  let mockBidsRepo: any;
  let mockAutoBidsRepo: any;
  let mockAuctionsRepo: any;
  let mockDataSource: any;
  let mockAuditService: any;
  let mockGateway: any;

  const makeMockAuction = (overrides = {}) => ({
    id: 'auction-1',
    status: 'LIVE',
    currentPrice: 25000,
    endTime: new Date(Date.now() + 3600000), // 1 hour from now
    startTime: new Date(Date.now() - 3600000),
    antiSnipingDuration: 120,
    extensionDuration: 120,
    maxExtensions: 3,
    extensionCount: 0,
    leadingBidderId: null,
    leadingBidderName: null,
    ...overrides,
  });

  const makeMockUser = (id = 'user-1') => ({
    id,
    name: 'Test User',
    email: 'test@test.com',
    role: 'bidder',
  });

  beforeEach(() => {
    mockBidsRepo = {
      findOne: vi.fn(),
      create: vi.fn((data) => data),
      save: vi.fn((data) => data),
    };
    mockAutoBidsRepo = { find: vi.fn(() => []) };
    mockAuctionsRepo = { findOne: vi.fn() };
    mockAuditService = { log: vi.fn() };
    mockGateway = {
      emitBidPlaced: vi.fn(),
      emitAuctionExtended: vi.fn(),
    };

    // Mock dataSource transaction
    mockDataSource = {
      transaction: vi.fn((cb) => {
        const manager = {
          findOne: vi.fn(),
          create: vi.fn((Entity, data) => data),
          save: vi.fn((data) => ({ ...data, placedAt: new Date() })),
          find: vi.fn(() => []),
          createQueryBuilder: vi.fn(() => ({
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            addOrderBy: vi.fn().mockReturnThis(),
            getOne: vi.fn(() => null),
          })),
        };
        return cb(manager);
      }),
    };

    bidsService = new BidsService(
      mockBidsRepo,
      mockAutoBidsRepo,
      mockAuctionsRepo,
      mockDataSource,
      mockAuditService,
      mockGateway,
    );
  });

  describe('Minimum increment validation', () => {
    it('rejects a bid below minimum increment', async () => {
      const auction = makeMockAuction({ currentPrice: 25000 });
      // Minimum next bid should be 25000 + 500 = 25500
      mockDataSource.transaction = vi.fn(async (cb) => {
        const manager = {
          findOne: vi.fn().mockResolvedValue(auction), query: vi.fn(),
          create: vi.fn((Entity, data) => data),
          save: vi.fn((data) => data),
        };
        return cb(manager);
      });

      await expect(
        bidsService.placeBid('auction-1', makeMockUser() as any, {
          amount: 25100, // Below minimum
        }),
      ).rejects.toThrow(/least/i);
    });

    it('accepts a bid at exact minimum increment', async () => {
      const auction = makeMockAuction({ currentPrice: 25000 });
      mockDataSource.transaction = vi.fn(async (cb) => {
        const manager = {
          findOne: vi.fn().mockResolvedValue(auction), query: vi.fn(),
          create: vi.fn((Entity, data) => ({ ...data, id: 'bid-1' })),
          save: vi.fn((data) => ({ ...data, placedAt: new Date() })),
          find: vi.fn(() => []),
        };
        return cb(manager);
      });

      const result = await bidsService.placeBid(
        'auction-1',
        makeMockUser() as any,
        { amount: 25500 }, // Exact minimum
      );
      expect(result.amount).toBe(25500);
    });
  });

  describe('Auction status validation', () => {
    it('rejects bid on non-live auction', async () => {
      const auction = makeMockAuction({ status: 'DRAFT' });
      mockDataSource.transaction = vi.fn(async (cb) => {
        const manager = {
          findOne: vi.fn().mockResolvedValue(auction), query: vi.fn(),
        };
        return cb(manager);
      });

      await expect(
        bidsService.placeBid('auction-1', makeMockUser() as any, {
          amount: 25500,
        }),
      ).rejects.toThrow(/not live/i);
    });

    it('rejects bid on ended auction', async () => {
      const auction = makeMockAuction({
        endTime: new Date(Date.now() - 1000), // Past
      });
      mockDataSource.transaction = vi.fn(async (cb) => {
        const manager = {
          findOne: vi.fn().mockResolvedValue(auction), query: vi.fn(),
        };
        return cb(manager);
      });

      await expect(
        bidsService.placeBid('auction-1', makeMockUser() as any, {
          amount: 25500,
        }),
      ).rejects.toThrow(/ended/i);
    });
  });

  describe('Idempotency', () => {
    it('returns existing bid for duplicate request with same idempotencyKey', async () => {
      const auction = makeMockAuction({ currentPrice: 25000 });
      mockDataSource.transaction = vi.fn(async (cb) => {
        const manager = {
          findOne: vi.fn((entity) => {
            if (entity.name === 'Auction') return auction;
            return { id: 'existing-bid', idempotencyKey: 'key-123' };
          }), query: vi.fn(),
          create: vi.fn((Entity, data) => data),
          save: vi.fn((data) => data),
        };
        return cb(manager);
      });

      const res = await bidsService.placeBid('auction-1', makeMockUser() as any, {
        amount: 25500,
        idempotencyKey: 'key-123',
      });
      expect(res.id).toBe('existing-bid');
    });
  });

  describe('Transaction Rollback', () => {
    it('does not emit any events if the transaction throws', async () => {
      const auction = makeMockAuction({ currentPrice: 25000 });
      mockDataSource.transaction = vi.fn(async (cb) => {
        const manager = {
          findOne: vi.fn().mockResolvedValue(auction), query: vi.fn(),
          create: vi.fn((Entity, data) => data),
          save: vi.fn(() => {
            throw new Error('Database connection lost');
          }),
        };
        return cb(manager);
      });

      await expect(
        bidsService.placeBid('auction-1', makeMockUser() as any, {
          amount: 25500,
        }),
      ).rejects.toThrow('Database connection lost');

      expect(mockGateway.emitBidPlaced).not.toHaveBeenCalled();
      expect(mockGateway.emitAuctionExtended).not.toHaveBeenCalled();
    });

    it('returns 409 ConflictException on lock timeout/deadlock with no events emitted', async () => {
      const auction = makeMockAuction({ currentPrice: 25000 });
      let attempts = 0;
      mockDataSource.transaction = vi.fn(async (cb) => {
        attempts++;
        const err = new Error('Lock timeout');
        (err as any).code = '55P03';
        throw err;
      });

      await expect(
        bidsService.placeBid('auction-1', makeMockUser() as any, {
          amount: 25500,
        }),
      ).rejects.toThrow(/high traffic/i);

      expect(attempts).toBe(3); // Initial + 2 retries
      expect(mockGateway.emitBidPlaced).not.toHaveBeenCalled();
      expect(mockGateway.emitAuctionExtended).not.toHaveBeenCalled();
    });
  });

  describe('Anti-sniping', () => {
    it('extends auction when bid is within anti-sniping window', async () => {
      const auction = makeMockAuction({
        currentPrice: 25000,
        endTime: new Date(Date.now() + 60000), // 60 seconds remaining (< 120s threshold)
        extensionCount: 0,
        maxExtensions: 3,
        extensionDuration: 120,
        antiSnipingDuration: 120,
      });

      let savedAuction: any;
      mockDataSource.transaction = vi.fn(async (cb) => {
        const manager = {
          findOne: vi.fn().mockResolvedValue(auction), query: vi.fn(),
          create: vi.fn((Entity, data) => ({ ...data, id: 'bid-1' })),
          save: vi.fn((data) => {
            savedAuction = data;
            return { ...data, placedAt: new Date() };
          }),
          find: vi.fn(() => []),
        };
        return cb(manager);
      });

      await bidsService.placeBid('auction-1', makeMockUser() as any, {
        amount: 25500,
      });

      expect(savedAuction.extensionCount).toBe(1);
      expect(mockGateway.emitAuctionExtended).toHaveBeenCalled();
    });

    it('does not extend when max extensions reached', async () => {
      const auction = makeMockAuction({
        currentPrice: 25000,
        endTime: new Date(Date.now() + 60000),
        extensionCount: 3, // At max
        maxExtensions: 3,
      });

      let savedAuction: any;
      mockDataSource.transaction = vi.fn(async (cb) => {
        const manager = {
          findOne: vi.fn().mockResolvedValue(auction), query: vi.fn(),
          create: vi.fn((Entity, data) => ({ ...data, id: 'bid-1' })),
          save: vi.fn((data) => {
            savedAuction = data;
            return { ...data, placedAt: new Date() };
          }),
          find: vi.fn(() => []),
        };
        return cb(manager);
      });

      await bidsService.placeBid('auction-1', makeMockUser() as any, {
        amount: 25500,
      });

      expect(savedAuction.extensionCount).toBe(3); // Unchanged
      expect(mockGateway.emitAuctionExtended).not.toHaveBeenCalled();
    });
  });

  describe('Step 5 - Self-outbidding prevention', () => {
    it('rejects a manual bid from the current leader with ALREADY_LEADING code', async () => {
      const leaderId = 'user-1';
      const auction = makeMockAuction({
        currentPrice: 25000,
        leadingBidderId: leaderId, // user-1 is already the leader
      });
      mockDataSource.transaction = vi.fn(async (cb) => {
        const manager = {
          findOne: vi.fn().mockResolvedValue(auction),
          query: vi.fn(),
          create: vi.fn((Entity, data) => data),
          save: vi.fn((data) => data),
        };
        return cb(manager);
      });

      await expect(
        bidsService.placeBid('auction-1', makeMockUser(leaderId) as any, {
          amount: 25500,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ALREADY_LEADING' }),
      });
    });

    it('allows setting auto-bid max even when already leader (no error thrown)', async () => {
      // setAutoBid should allow raising the max without throwing ALREADY_LEADING
      const leaderId = 'user-1';
      const auction = makeMockAuction({
        currentPrice: 25000,
        leadingBidderId: leaderId,
        status: 'LIVE',
      });
      mockDataSource.transaction = vi.fn(async (cb) => {
        const manager = {
          findOne: vi.fn().mockResolvedValue(null), // no existing autoBid
          query: vi.fn(),
          create: vi.fn((Entity, data) => ({ ...data, id: 'ab-1' })),
          save: vi.fn((data) => ({ ...data })),
          find: vi.fn(() => []),
        };
        // First findOne call (auction), second (autoBid) returns null
        manager.findOne = vi.fn()
          .mockResolvedValueOnce(auction)
          .mockResolvedValueOnce(null); // no existing auto-bid
        return cb(manager);
      });

      // Should NOT throw
      const result = await bidsService.setAutoBid(
        'auction-1',
        makeMockUser(leaderId) as any,
        { maxAmount: 30000 },
      );
      expect(result.message).toMatch(/configured/i);
    });
  });
});
