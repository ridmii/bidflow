import sys

with open('src/bids/bids.service.ts', 'r', encoding='utf-8') as f:
    content = f.read()

import re

# Remove the broken args lines completely
content = re.sub(r'^\s*\\[0\]\.Value -replace .*?\n', '', content, flags=re.MULTILINE)

# The place where the function bodies were stripped is right before if (!auction) throw new NotFoundException('Auction not found');
# Wait, no. The first one was in setAutoBid!
# The second was in getBidHistory!

# Let's just output the file with line numbers to see where to inject the missing code.
with open('src/bids/bids.service.ts', 'w', encoding='utf-8') as f:
    f.write(content)
