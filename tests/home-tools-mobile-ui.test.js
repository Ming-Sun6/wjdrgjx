const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function sectionById(html, id) {
  const start = html.indexOf(`id="${id}"`);
  assert.notEqual(start, -1, `missing #${id}`);
  const nextWarehouse = html.indexOf('class="card wide tool-warehouse-shell"', start + id.length);
  return html.slice(start, nextWarehouse === -1 ? html.length : nextWarehouse);
}

test('mobile tool tiles wrap long names and use a readable narrow-screen grid', () => {
  const html = read('index.html');

  assert.match(html, /\.tool-tile-name\s*\{[^}]*white-space\s*:\s*normal[^}]*overflow-wrap\s*:\s*anywhere/s);
  assert.match(html, /\.tool-tile-name-inner\s*\{[^}]*width\s*:\s*100%[^}]*white-space\s*:\s*normal/s);
  assert.match(html, /@media\s*\(max-width:\s*600px\)[\s\S]*?\.tool-warehouse-grid\s*\{[^}]*repeat\(3,/);
  assert.match(html, /@media\s*\(max-width:\s*600px\)[\s\S]*?\.tool-tile-card\s*\{[^}]*aspect-ratio\s*:\s*auto/);
});

test('immigration ticket calculator is listed under more tools', () => {
  const html = read('index.html');
  const coreTools = sectionById(html, 'coreToolWarehouse');
  const moreTools = sectionById(html, 'extendedToolWarehouse');

  assert.doesNotMatch(coreTools, /function\/jisuan\.html/);
  assert.match(moreTools, /data-category="calcTools"\s+data-tool-priority="extended"[\s\S]*?function\/jisuan\.html/);
});

test('immigration calculator displays an explicit outdated-data warning', () => {
  const html = read('public/function/jisuan.html');

  assert.match(html, /role="(?:status|note)"/);
  assert.match(html, /移民券随游戏更新已经进行了调整/);
  assert.match(html, /该工具已经不准确了，仅供娱乐使用/);
});

test('home page exposes separate building query and calculator entries', () => {
  const html = read('index.html');
  const moreTools = sectionById(html, 'extendedToolWarehouse');

  assert.match(moreTools, /data-category="dataQuery"[\s\S]*?function\/building-upgrade-1-30\.html[\s\S]*?建筑升级(?:<wbr>)?数据查询/);
  assert.match(moreTools, /data-category="calcTools"[\s\S]*?function\/building-upgrade-calculator\.html[\s\S]*?建筑升级(?:<wbr>)?计算器/);
});

test('home and admin changelogs describe the current toolbox release', () => {
  const home = read('index.html');
  const admin = read('public/function/_ops/console-7a9/internal/admin.html');

  for (const html of [home, admin]) {
    assert.match(html, /V0\.9\.26/);
    assert.match(html, /2026-07-12/);
    assert.match(html, /建筑升级计算器/);
    assert.match(html, /移民券/);
    assert.match(html, /活动横幅/);
  }
});
