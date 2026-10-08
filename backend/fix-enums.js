const fs = require('fs');

function replaceEnum(filePath, enumName) {
  let content = fs.readFileSync(filePath, 'utf-8');
  // Match export enum ENUM_NAME { ... }
  const regex = new RegExp('export\\s+enum\\s+' + enumName + '\\s*\\{([\\s\\S]*?)\\}', 'g');
  
  content = content.replace(regex, (match, body) => {
    const lines = body.split(',').map(l => l.trim()).filter(l => l.length > 0);
    let obj = 'export const ' + enumName + ' = {\\n';
    let type = 'export type ' + enumName + ' = ';
    let typeValues = [];
    
    for (let line of lines) {
      // e.g. DRAFT = 'DRAFT'
      const parts = line.split('=');
      const key = parts[0].trim();
      let value = parts.length > 1 ? parts[1].trim() : ' + key + ';
      obj += '  ' + key + ': ' + value + ' as const,\\n';
      typeValues.push('(typeof ' + enumName + ')[' + ' + key + ' + ']');
    }
    obj += '};\\n';
    type += typeValues.join(' | ') + ';\\n';
    return obj + type;
  });
  
  fs.writeFileSync(filePath, content);
}

replaceEnum('src/auctions/entities/auction.entity.ts', 'AuctionStatus');
replaceEnum('src/bids/entities/bid.entity.ts', 'BidType');
replaceEnum('src/users/entities/user.entity.ts', 'UserRole');

