const fs = require('fs');
let content = fs.readFileSync('test/concurrency.spec.ts', 'utf-8');
content = content.replace(/[^\x00-\x7F]/g, '-');
fs.writeFileSync('test/concurrency.spec.ts', content, 'utf8');
