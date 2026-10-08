const fs = require('fs');

function clean(file) {
  let content = fs.readFileSync(file, 'utf-8');
  content = content.replace(/[^\x00-\x7F]/g, '-');
  fs.writeFileSync(file, content, 'utf8');
}

clean('src/auctions/entities/auction.entity.ts');
clean('src/bids/entities/bid.entity.ts');
clean('src/users/entities/user.entity.ts');
