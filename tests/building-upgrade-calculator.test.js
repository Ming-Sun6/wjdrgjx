const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function extractBuildingData(html) {
  const match = html.match(/const BUILDING_DATA = (\{[\s\S]*?\n    \});/);
  assert.ok(match, 'page should expose inline BUILDING_DATA');
  return vm.runInNewContext('(' + match[1] + ')');
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

test('building query keeps its URL but presents itself as a lookup tool', () => {
  const html = read('public/function/building-upgrade-1-30.html');

  assert.match(html, /<title>1-30建筑升级数据查询-冬日工具箱<\/title>/);
  assert.match(html, /<h1>1-30建筑升级数据查询<\/h1>/);
  assert.match(html, /id="buildingSelect"/);
  assert.match(html, /id="levelFilter"/);
  assert.doesNotMatch(html, /id="currentLevel"|id="targetLevel"|id="summary"/);
  assert.doesNotMatch(html, /function calculateBuildingTotals/);
});

test('calculator embeds the same complete building data for static deployment', () => {
  const queryData = normalize(extractBuildingData(read('public/function/building-upgrade-1-30.html')));
  const calculatorHtml = read('public/function/building-upgrade-calculator.html');
  const calculatorData = normalize(extractBuildingData(calculatorHtml));

  assert.deepEqual(calculatorData, queryData);
  assert.equal(Object.keys(calculatorData).length, 7);
  Object.values(calculatorData).forEach((rows) => assert.equal(rows.length, 30));
});

test('calculator exposes level controls, totals, and interval detail', () => {
  const html = read('public/function/building-upgrade-calculator.html');

  assert.match(html, /<title>1-30建筑升级计算器-冬日工具箱<\/title>/);
  assert.match(html, /id="buildingSelect"/);
  assert.match(html, /id="currentLevel"/);
  assert.match(html, /id="targetLevel"/);
  assert.match(html, /function calculateBuildingTotals/);
  assert.match(html, /id="summary"/);
  assert.match(html, /id="detailBody"/);
  assert.match(html, /生肉/);
  assert.match(html, /木材/);
  assert.match(html, /煤矿/);
  assert.match(html, /铁矿/);
  assert.match(html, /总时间/);
  assert.match(html, /实力提升/);
});

test('calculator totals include current level plus one through target level', () => {
  const html = read('public/function/building-upgrade-calculator.html');
  const dataMatch = html.match(/const BUILDING_DATA = (\{[\s\S]*?\n    \});/);
  const functions = ['parseAmount', 'parseTimeSeconds', 'calculateBuildingTotals'].map((name) => {
    const match = html.match(new RegExp('function ' + name + '\\([^]*?\\n    \\}'));
    assert.ok(match, 'missing ' + name);
    return match[0];
  }).join('\n');
  const context = {};

  vm.runInNewContext(
    'const BUILDING_DATA = ' + dataMatch[1] + ';\n' +
    'const fields = ["food", "wood", "coal", "iron"];\n' +
    functions + '\nresult = calculateBuildingTotals("熔炉", 1, 3);',
    context
  );

  assert.deepEqual(normalize(context.result), {
    levels: 2,
    food: 0,
    wood: 985,
    coal: 0,
    iron: 0,
    time: 66,
    power: 4500
  });
});

test('building and pet tools define substantial day and night component themes', () => {
  const pages = [
    read('public/function/building-upgrade-1-30.html'),
    read('public/function/building-upgrade-calculator.html'),
    read('public/function/pet-data-query.html')
  ];

  pages.forEach((html) => {
    assert.match(html, /html\[data-theme="night"\] body/);
    assert.match(html, /html\[data-theme="day"\] body/);
    assert.match(html, /html\[data-theme="day"\][^}]*\.panel/);
    assert.match(html, /html\[data-theme="day"\][^}]*:is\(select, input\)/);
    assert.match(html, /html\[data-theme="day"\][^}]*th/);
  });
});
