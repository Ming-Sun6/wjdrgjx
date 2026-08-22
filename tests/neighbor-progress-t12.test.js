const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pagePath = path.join(__dirname, '..', 'public', 'function', 'neighbor-progress.html');

test('neighbor progress includes T12 hero opening schedule with 14-day progression', () => {
  const source = fs.readFileSync(pagePath, 'utf8');
  assert.match(source, /key:\s*"Hero12"\s*,\s*offset:\s*714/);
  assert.match(source, /Hero12:\s*"12\\u4ee3"/);
  assert.match(source, /var\s+baseSerial\s*=\s*45537/);
  assert.match(source, /var\s+stepDays\s*=\s*14/);

  const opening = new Date(Date.UTC(1899, 11, 30) + (45537 + 714) * 86400000);
  assert.equal(opening.toISOString().slice(0, 10), '2026-08-17');
  const nextOpening = new Date(Date.UTC(1899, 11, 30) + (45537 + 14 + 714) * 86400000);
  assert.equal(nextOpening.toISOString().slice(0, 10), '2026-08-31');
});
