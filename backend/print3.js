const fs = require('fs');
let lines = fs.readFileSync('src/bids/bids.service.ts', 'utf-8').split('\n');
for (let i = 280; i < 330; i++) {
  console.log(i + ': ' + lines[i]);
}
