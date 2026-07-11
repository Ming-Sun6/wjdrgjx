const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('every home tool has a unique management id and no static badge', () => {
  const html = read('index.html');
  const toolCards = [...html.matchAll(/<section class="card [^"]*(?:featured-tool-card|tool-tile-card)[^"]*"[^>]*data-tool-id="([^"]+)"/g)];
  const ids = toolCards.map((match) => match[1]);

  assert.equal(ids.length, 29);
  assert.equal(new Set(ids).size, ids.length);
  assert.doesNotMatch(html, /<span class="new-badge">(?:新|热)<\/span>/);
});

test('home page applies public tool visibility and badge settings', () => {
  const html = read('index.html');

  assert.match(html, /fetch\('\/api\/tool-management'/);
  assert.match(html, /querySelectorAll\('\[data-tool-id\]'/);
  assert.match(html, /config\.visible\s*===\s*false/);
  assert.match(html, /tool-status-badge/);
  assert.match(html, /badge\s*===\s*'new'/);
  assert.match(html, /badge\s*===\s*'hot'/);
});

test('building tools use their new 1-30 names everywhere', () => {
  const home = read('index.html');
  const query = read('public/function/building-upgrade-1-30.html');
  const calculator = read('public/function/building-upgrade-calculator.html');

  assert.match(home, /1-30建筑升级(?:<wbr>)?计算器/);
  assert.match(home, /1-30建筑升级(?:<wbr>)?数据查询/);
  assert.match(query, /<title>1-30建筑升级数据查询-冬日工具箱<\/title>/);
  assert.match(query, /<h1>1-30建筑升级数据查询<\/h1>/);
  assert.match(calculator, /<title>1-30建筑升级计算器-冬日工具箱<\/title>/);
  assert.match(calculator, /<h1>1-30建筑升级计算器<\/h1>/);
});

test('home changelog omits the announcement and activity banner entry', () => {
  const html = read('index.html');

  assert.doesNotMatch(html, /<li><strong>公告与活动横幅<\/strong>/);
});
