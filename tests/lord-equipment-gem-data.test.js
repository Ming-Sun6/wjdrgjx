const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pagePath = path.join(__dirname, '..', 'public', 'function', 'lord-equipment-gem-calculator.html');

function readEquipmentRows() {
  const source = fs.readFileSync(pagePath, 'utf8');
  const baseMatch = source.match(/const EQUIP_CSV = `([\s\S]*?)`\.trim\(\);/);
  const appendMatch = source.match(/const EQUIP_APPEND_CSV = `([\s\S]*?)`\.trim\(\);/);
  assert.ok(baseMatch, 'base equipment CSV should be embedded in the calculator');
  assert.ok(appendMatch, 'new equipment CSV should be embedded in the calculator');
  return `${baseMatch[1].trim()}|${appendMatch[1].trim()}`.split('|').map((row) => {
    const [seq, name, alloy, polish, plan, amber, power, attr, march, score] = row.split(',');
    return { seq: Number(seq), name, alloy: Number(alloy), polish: Number(polish), plan: Number(plan), amber: Number(amber), power: Number(power), attr: Number(attr), march: Number(march), score: Number(score) };
  });
}

function readGemRows() {
  const source = fs.readFileSync(pagePath, 'utf8');
  const match = source.match(/const GEM_CSV = `([\s\S]*?)`;/);
  assert.ok(match, 'gem CSV should be embedded in the calculator');
  return match[1].trim().split('|').map((row) => {
    const [seq, a, b, c, attr, score, label] = row.split(',');
    return {
      lv: Number(seq),
      label: (label || '').trim() || `Lv.${seq}`,
      a: Number(a),
      b: Number(b),
      c: Number(c),
      attr: Number(attr),
      score: Number(score),
    };
  });
}

test('lord equipment data includes the complete mythic T4-T6 progression', () => {
  const rows = readEquipmentRows();
  assert.equal(rows.length, 102);
  assert.deepEqual(rows.at(-1), {
    seq: 102,
    name: '神话T6-3星',
    alloy: 68000,
    polish: 630,
    plan: 105,
    amber: 16,
    power: 6120000,
    attr: 2.55,
    march: 1780,
    score: 0,
  });
  assert.deepEqual(rows.find((row) => row.name === '神话T5'), {
    seq: 67,
    name: '神话T5',
    alloy: 40000,
    polish: 420,
    plan: 70,
    amber: 12,
    power: 4692000,
    attr: 1.955,
    march: 1340,
    score: 0,
  });
});

test('lord gem data includes levels 16-1 through 18', () => {
  const rows = readGemRows();
  assert.equal(rows.length, 34);
  assert.deepEqual(rows.find((row) => row.lv === 16), {
    lv: 16,
    label: 'Lv.16',
    a: 650,
    b: 550,
    c: 100,
    attr: 1,
    score: 21000,
  });
  assert.deepEqual(rows.find((row) => row.label === '16级（1段）'), {
    lv: 17,
    label: '16级（1段）',
    a: 85,
    b: 70,
    c: 15,
    attr: 1.01,
    score: 23500,
  });
  assert.deepEqual(rows.find((row) => row.label === '17级（1段）'), {
    lv: 26,
    label: '17级（1段）',
    a: 100,
    b: 90,
    c: 20,
    attr: 1.1,
    score: 46200,
  });
  assert.deepEqual(rows.at(-1), {
    lv: 34,
    label: '18级',
    a: 150,
    b: 130,
    c: 20,
    attr: 1.18,
    score: 67800,
  });
});
