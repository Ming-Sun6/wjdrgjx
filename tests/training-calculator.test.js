const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../public/function/equipment-training-calculator.html'), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x => x[1]).find(x => x.includes('const TROOP'));
function setup() {
  const elements = {};
  for (const match of html.matchAll(/id="([^"]+)"[^>]*>/g)) {
    elements[match[1]] = { value: match[0].match(/value="([^"]*)"/)?.[1] || '0',
      style: {}, options: [], classList: { toggle() {} }, addEventListener() {} };
  }
  const context = vm.createContext({ document: {
    getElementById: id => elements[id], querySelectorAll: () => []
  }});
  vm.runInContext(script, context);
  return { elements, run: source => vm.runInContext(source, context) };
}
function calc(from, to, groups, speed = 0, expert = 1) {
  const { run } = setup();
  return JSON.parse(JSON.stringify(run(`calculateTotals(TROOP[${from}], TROOP[${to}], ${from === 0}, ${speed}, ${expert}, ${JSON.stringify(groups)})`)));
}
const shield = (count, level11 = 0, level12 = 0) => ({key: 's', count, level11, level12});

test('T10 to T11 with level 4 technology matches workbook acceptance example', () => {
  assert.deepEqual(calc(10, 11, [shield(10000, 4)]).resources, [27880000, 20914000, 4880000, 1004000]);
});
test('T12 direct training matches workbook resources and scores', () => {
  const result = calc(0, 12, [shield(10000)]);
  assert.deepEqual(result.resources, [104550000, 78420000, 18300000, 3800000]);
  assert.equal(result.prep, 940000);
  assert.equal(result.frost, 610000);
  assert.equal(result.minutes, 215 * 10000 / 60);
});
test('T11 to T12 uses 35 seconds and updated score differences', () => {
  const result = calc(11, 12, [shield(10000)]);
  assert.equal(result.minutes, 5834);
  assert.equal(result.prep, 190000);
  assert.equal(result.frost, 120000);
  assert.deepEqual(result.resources, [34850000, 26140000, 6100000, 1270000]);
});
test('T12 technology compounds with T11 technology before subtracting starting tier', () => {
  assert.equal(calc(0, 12, [shield(10000, 4, 4)]).resources[0], 81549000);
  assert.equal(calc(10, 12, [shield(10000, 4, 4)]).resources[0], 53669000);
  assert.equal(calc(11, 12, [shield(10000, 4, 4)]).resources[0], 25789000);
  assert.equal(calc(9, 11, [shield(10000, 4)]).resources[0], 41820000);
});
test('mixed troops round promotion minutes and resources separately', () => {
  const result = calc(11, 12, [shield(1, 1, 1), {key:'p',count:1,level11:0,level12:0}, {key:'b',count:1,level11:0,level12:0}]);
  assert.equal(result.minutes, 3);
  // Workbook per-troop rounded costs: shield + spear + bow.
  assert.deepEqual(result.resources, [3233+3049+2178, 2425+2875+3223, 566+593+540, 118+135+174]);
});
test('lower tiers ignore technology; speed and expert affect only their intended outputs', () => {
  const base = calc(0, 10, [shield(10000)]);
  const boosted = calc(0, 10, [shield(10000, 10, 10)], 100, 1.2);
  assert.deepEqual(boosted.resources, base.resources);
  assert.equal(boosted.minutes, base.minutes / 2);
  assert.equal(boosted.prep, base.prep * 1.2);
  assert.equal(boosted.frost, base.frost);
  assert.deepEqual(calc(0, 12, [shield(0,10,10)]).resources, [0,0,0,0]);
});
test('page initializes technology controls and renders exact results without stale invalid outputs', () => {
  const {elements, run} = setup();
  elements.fromTier.value = 'T10'; elements.toTier.value = 'T11';
  elements.shieldWan.value = '1'; elements.shieldTech11.value = '4';
  run('recalcAll()');
  assert.match(elements.exactResources.textContent, /27,880,000/);
  assert.match(elements.exactMinutes.textContent, /4,667/);
  elements.toTier.value = 'T9'; run('recalcAll()');
  assert.equal(elements.exactResources.textContent, '--');
});
