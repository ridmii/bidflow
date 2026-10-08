const fs = require('fs');
let lines = fs.readFileSync('src/bids/bids.service.ts', 'utf-8').split('\n');
for (let i = 330; i < 380; i++) {
  console.log(i + ': ' + lines[i]);
}
