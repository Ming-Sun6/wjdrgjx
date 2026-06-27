const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('home page links building and pet data tools under data query', () => {
  const html = read('index.html');

  assert.match(html, /data-category="dataQuery"[\s\S]*function\/building-upgrade-1-30\.html/);
  assert.match(html, /data-category="dataQuery"[\s\S]*function\/pet-data-query\.html/);
  assert.match(html, /1-30级建筑升级/);
  assert.match(html, /宠物数据查询/);
});

test('building upgrade tool exposes calculator and source data', () => {
  const html = read('public/function/building-upgrade-1-30.html');

  assert.match(html, /1-30级建筑升级-冬日工具箱/);
  assert.match(html, /const BUILDING_DATA/);
  assert.match(html, /function calculateBuildingTotals/);
  assert.match(html, /熔炉/);
  assert.match(html, /大使馆29，射手营29/);
  assert.match(html, /40天04:27:00/);
  assert.match(html, /此数据为原始数据/);
});

test('pet data query tool exposes material power and breakthrough data', () => {
  const html = read('public/function/pet-data-query.html');

  assert.match(html, /宠物数据查询-冬日工具箱/);
  assert.match(html, /const PET_GROUPS/);
  assert.match(html, /const PET_POWER_DATA/);
  assert.match(html, /const PET_BREAKTHROUGH_SCORES/);
  assert.match(html, /霜鳞避役/);
  assert.match(html, /6,596,640/);
  assert.match(html, /洞斑鬣狗/);
  assert.match(html, /制作：甜甜/);
});

test('new data tools define day theme overrides so theme toggle has visible effect', () => {
  const buildingHtml = read('public/function/building-upgrade-1-30.html');
  const petHtml = read('public/function/pet-data-query.html');

  assert.match(buildingHtml, /html\[data-theme="day"\]|body\.theme-day/);
  assert.match(petHtml, /html\[data-theme="day"\]|body\.theme-day/);
});
