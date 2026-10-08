const fs = require('fs');
const content = fs.readFileSync('src/bids/bids.service.ts', 'utf-8');

const replacement = 
  async placeBid(
    auctionId: string,
    bidder: User,
    dto: PlaceBidDto,
  ): Promise<Bid> {
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        return await this.executePlaceBid(auctionId, bidder, dto);
      } catch (err: any) {
        attempt++;
        const isDeadlockOrTimeout =
          err?.code === '40P01' || // Deadlock
          err?.code === '40001' || // Serialization failure
          err?.code === '55P03';   // Lock not available (timeout)
        const isOptimistic = err?.name === 'OptimisticLockVersionMismatchError';
        
        if (isDeadlockOrTimeout || isOptimistic) {
          if (attempt >= maxRetries) {
            throw new ConflictException({
              message: 'High traffic, please try again.',
              code: 'BID_CONFLICT',
            });
          }
          // Backoff
          await new Promise((r) => setTimeout(r, 50 * attempt));
        } else {
          throw err;
        }
      }
    }
    throw new ConflictException({
      message: 'High traffic, please try again.',
      code: 'BID_CONFLICT',
    });
  }

  private async executePlaceBid(;

const modified = content.replace(/  async placeBid\(/, replacement);
fs.writeFileSync('src/bids/bids.service.ts', modified);
