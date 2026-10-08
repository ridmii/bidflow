const fs = require('fs');
let content = fs.readFileSync('src/bids/bids.service.ts', 'utf-8');
content = content.replace(/[^\x00-\x7F]/g, '-');
fs.writeFileSync('src/bids/bids.service.ts', content, 'utf8');
