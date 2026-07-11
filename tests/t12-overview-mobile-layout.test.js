const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'function', 'T12DataOverview.html'),
  'utf8'
);

function mediaBlock(maxWidth) {
  const marker = new RegExp(`@media\\s*\\(max-width:\\s*${maxWidth}px\\)\\s*\\{`, 'g');
  const match = marker.exec(html);
  assert.ok(match, `missing max-width: ${maxWidth}px media query`);

  let depth = 1;
  let cursor = marker.lastIndex;
  while (cursor < html.length && depth > 0) {
    if (html[cursor] === '{') depth += 1;
    if (html[cursor] === '}') depth -= 1;
    cursor += 1;
  }

  assert.equal(depth, 0, `unclosed max-width: ${maxWidth}px media query`);
  return html.slice(marker.lastIndex, cursor - 1);
}

test('T12 overview keeps filters and statistics in two mobile columns', () => {
  const mobile = mediaBlock(768);

  assert.match(mobile, /\.controls-grid,\s*\.stats\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(mobile, /\.control-card,\s*\.stat\s*\{[^}]*min-width:\s*0/s);
});

test('T12 overview uses four compact metric columns and three on very narrow screens', () => {
  const mobile = mediaBlock(768);
  const narrow = mediaBlock(360);

  assert.match(mobile, /\.mobile-detail-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)[^}]*gap:\s*4px/s);
  assert.match(narrow, /\.mobile-detail-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(mobile, /\.mobile-detail-item\s*\{[^}]*padding:\s*6px\s+4px/s);
});

test('T12 overview compresses expanded levels without allowing horizontal overflow', () => {
  const mobile = mediaBlock(768);

  assert.match(mobile, /html,\s*body\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*hidden/s);
  assert.match(mobile, /\.mobile-overview-list\s*\{[^}]*gap:\s*8px/s);
  assert.match(mobile, /\.mobile-detail-list\s*\{[^}]*gap:\s*6px/s);
  assert.match(mobile, /\.mobile-card-title strong\s*\{[^}]*font-size:\s*13px/s);
  assert.match(mobile, /\.mobile-kpi strong,\s*\.mobile-detail-item strong\s*\{[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere[^}]*word-break:\s*break-word/s);
});
