const fs = require('fs');
let lines = fs.readFileSync('src/bids/bids.service.ts', 'utf-8').split('\n');
for (let i = 230; i < 280; i++) {
  console.log(i + ': ' + lines[i]);
}
