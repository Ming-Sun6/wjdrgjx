const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'function', 'T12Calculator.html'),
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

test('T12 mobile shell and cards stay inside the viewport', () => {
  const mobile = mediaBlock(768);

  assert.match(mobile, /\.app-shell\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%/s);
  assert.match(mobile, /\.shell-card\s*\{[^}]*min-width:\s*0[^}]*overflow:\s*hidden/s);
  assert.match(mobile, /\.hero-shell\s*\{[^}]*grid-template-columns:\s*1fr/s);
});

test('T12 mobile tech cards stay in two columns until truly narrow screens', () => {
  const mobile = mediaBlock(768);
  const narrow = mediaBlock(340);

  assert.match(mobile, /\.tech-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.doesNotMatch(mobile, /\.tech-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(narrow, /\.tech-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
});

test('T12 mobile controls provide touch-sized targets without forced widths', () => {
  const mobile = mediaBlock(768);

  assert.match(mobile, /input,\s*select,\s*\.btn,\s*\.nav-link,\s*\.home-btn\s*\{[^}]*min-width:\s*0[^}]*min-height:\s*44px/s);
  assert.match(mobile, /\.btn-row\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(mobile, /html:root\s*\{[^}]*--wjdr-fab-size:\s*44px/s);
});

test('T12 mobile summaries and results remain scannable', () => {
  const mobile = mediaBlock(768);

  assert.match(mobile, /\.stats\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(mobile, /\.results-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(mobile, /\.result-kpis,\s*\.resource-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(mobile, /\.stat \.value,\s*\.result-card[^}]*\{[^}]*overflow-wrap:\s*anywhere/s);
});

test('T12 mobile table fallback wraps instead of overflowing horizontally', () => {
  const mobile = mediaBlock(768);

  assert.match(mobile, /body \.table-wrap\s*\{[^}]*overflow-x:\s*hidden/s);
  assert.match(mobile, /body \.table-wrap > table\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*table-layout:\s*fixed/s);
  assert.match(mobile, /th,\s*td\s*\{[^}]*overflow-wrap:\s*anywhere[^}]*word-break:\s*break-word/s);
});
