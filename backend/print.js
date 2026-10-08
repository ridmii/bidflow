const fs = require('fs');
let lines = fs.readFileSync('src/bids/bids.service.ts', 'utf-8').split('\n');
for (let i = lines.length - 60; i < lines.length; i++) {
  console.log(i + ': ' + lines[i]);
}
