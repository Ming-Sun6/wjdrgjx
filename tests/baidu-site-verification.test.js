const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('homepage exposes the current Baidu site verification token', () => {
  const homepage = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const tags = [...homepage.matchAll(/<meta\s+name=["']baidu-site-verification["']\s+content=["']([^"']+)["']\s*\/?>/gi)];

  assert.equal(tags.length, 1);
  assert.equal(tags[0][1], 'codeva-F2OnOZUh8c');
  assert.doesNotMatch(homepage, /codeva-BN4sg0Yffy/);
});
