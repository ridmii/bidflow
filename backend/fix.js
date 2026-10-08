const fs = require('fs');
let lines = fs.readFileSync('src/bids/bids.service.ts', 'utf-8').split('\n');

const signature1 = [
  "  async setAutoBid(",
  "    auctionId: string,",
  "    bidder: User,",
  "    dto: SetAutoBidDto,",
  "  ): Promise<{ message: string }> {",
  "    const auction = await this.auctionsRepo.findOne({",
  "      where: { id: auctionId },",
  "    });"
];

const signature2 = [
  "  async getBidHistory(auctionId: string): Promise<any[]> {",
  "    const auction = await this.auctionsRepo.findOne({",
  "      where: { id: auctionId },",
  "    });"
];

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('[0].Value -replace')) {
    if (i > 300 && i < 400) {
      lines.splice(i, 1, ...signature1);
    } else {
      lines.splice(i, 1, ...signature2);
    }
  }
}

fs.writeFileSync('src/bids/bids.service.ts', lines.join('\n'));
