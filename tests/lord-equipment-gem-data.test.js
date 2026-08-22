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
