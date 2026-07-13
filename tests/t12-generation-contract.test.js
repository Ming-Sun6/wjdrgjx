const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const generator = read('scripts/generate-t12-pages.py');
const regenerator = read('scripts/regenerate-t12-html.js');
const calculator = read('public/function/T12Calculator.html');
const overview = read('public/function/T12DataOverview.html');

test('T12 generation preserves the established calculator presets', () => {
  for (const source of [generator, calculator]) {
    for (const id of ['presetUnlockSingle', 'presetFullSingle', 'presetUnlockThree', 'presetFullThree']) {
      assert.match(source, new RegExp(`id="${id}"|getElementById\\("${id}"\\)`));
    }
    assert.match(source, /function selectedSingleTroop\(\)/);
    assert.match(source, /function unlockTargetGroupsForTroops\(troops\)/);
  }
});

test('T12 overview generation preserves complete resource totals', () => {
  const ids = [
    'visibleMeat',
    'visibleWood',
    'visibleCoal',
    'visibleIron',
    'visibleSteel',
    'visibleRefinedCrystal',
    'visibleMicro',
    'visibleTime',
  ];
  for (const source of [generator, overview]) {
    for (const id of ids) assert.match(source, new RegExp(`id="${id}"|getElementById\\("${id}"\\)`));
    assert.match(source, /function sumRows\(rows, key\)/);
  }
});

test('both T12 generation paths retain shared theme hooks and site titles', () => {
  assert.match(generator, /<link rel="stylesheet" href="\/function\/theme\.css" \/>/);
  assert.match(generator, /<script src="\/function\/theme\.js" defer><\/script>/);
  assert.match(generator, /<script src="\/function\/analytics-tracker\.js" defer><\/script>/);
  assert.match(generator, /return shell\("T12 煌耀系列科技计算器-冬日工具箱"/);
  assert.match(generator, /return shell\("T12 煌耀系列数据总览-冬日工具箱"/);
  assert.match(regenerator, /mergeShellHtml\(calcPath, "T12 煌耀系列科技计算器-冬日工具箱"/);
  assert.match(regenerator, /mergeShellHtml\(ovPath, "T12 煌耀系列数据总览-冬日工具箱"/);
  assert.match(calculator, /<title>T12 煌耀系列科技计算器-冬日工具箱<\/title>/);
  assert.match(overview, /<title>T12 煌耀系列数据总览-冬日工具箱<\/title>/);
});

test('four-column overview labels stay readable on phones', () => {
  for (const source of [generator, overview]) {
    assert.match(source, /\.mobile-detail-item span\s*\{[^}]*font-size:\s*(?:10|11|12)px[^}]*line-height:\s*1\.2/s);
  }
});
