const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const express = require('express');

const {
  EQUIPMENT,
  GEMS,
  calculateEquipment,
  calculateGems,
  findEquipment,
  mountLordEquipmentGemRoutes
} = require('../lord-equipment-gem');

const pagePath = path.join(__dirname, '..', 'public', 'function', 'lord-equipment-gem-calculator.html');
const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function startApp() {
  const app = express();
  app.use(express.json());
  mountLordEquipmentGemRoutes(app);
  return new Promise((resolve) => {
    const server = http.createServer(app).listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function requestJson(server, urlPath, options) {
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${urlPath}`, options);
  const json = await res.json().catch(() => null);
  return { status: res.status, json, headers: res.headers };
}

test('lord equipment data includes the complete mythic T4-T6 progression', () => {
  assert.equal(EQUIPMENT.length, 102);
  assert.deepEqual(EQUIPMENT.at(-1), {
    seq: 102,
    name: '神话T6-3星',
    alloy: 68000,
    polish: 630,
    plan: 105,
    amber: 16,
    power: 6120000,
    attr: 2.55,
    march: 1780,
    score: 0
  });
  assert.deepEqual(EQUIPMENT.find((row) => row.name === '神话T5'), {
    seq: 67,
    name: '神话T5',
    alloy: 40000,
    polish: 420,
    plan: 70,
    amber: 12,
    power: 4692000,
    attr: 1.955,
    march: 1340,
    score: 0
  });
});

test('lord gem data includes levels 16-1 through 18', () => {
  assert.equal(GEMS.length, 34);
  assert.deepEqual(GEMS.find((row) => row.lv === 16), {
    lv: 16,
    label: 'Lv.16',
    manual: 650,
    blueprint: 550,
    codex: 100,
    attr: 1,
    score: 21000
  });
  assert.deepEqual(GEMS.find((row) => row.label === '16级（1段）'), {
    lv: 17,
    label: '16级（1段）',
    manual: 85,
    blueprint: 70,
    codex: 15,
    attr: 1.01,
    score: 23500
  });
  assert.deepEqual(GEMS.find((row) => row.label === '17级（1段）'), {
    lv: 26,
    label: '17级（1段）',
    manual: 100,
    blueprint: 90,
    codex: 20,
    attr: 1.1,
    score: 46200
  });
  assert.deepEqual(GEMS.at(-1), {
    lv: 34,
    label: '18级',
    manual: 150,
    blueprint: 130,
    codex: 20,
    attr: 1.18,
    score: 67800
  });
});

test('equipment name lookup accepts the mythic 2-star variant spelling', () => {
  assert.equal(findEquipment('神话2星')?.seq, 29);
  assert.equal(findEquipment('神話2星')?.seq, 29);
});

test('equipment calc sums exclusive current through inclusive target and scales pieces', () => {
  const one = calculateEquipment({ from: 1, to: 2, pieces: 1 });
  assert.equal(one.error, undefined);
  assert.equal(one.cost.alloy, 3800);
  assert.equal(one.cost.polish, 40);
  const six = calculateEquipment({ fromName: '良好', toName: '良好1星', pieces: 6 });
  assert.equal(six.cost.alloy, 3800 * 6);
  assert.equal(six.delta.attr.toFixed(4), (0.1275 - 0.0935).toFixed(4));
});

test('gem calc uses handbook/blueprint/codex costs', () => {
  const result = calculateGems({ from: 1, to: 2, pieces: 18 });
  assert.equal(result.error, undefined);
  assert.equal(result.cost.manual, 40 * 18);
  assert.equal(result.cost.blueprint, 15 * 18);
  assert.equal(result.cost.codex, 0);
});

test('calculator page loads shared catalog API instead of embedded CSV', () => {
  const html = fs.readFileSync(pagePath, 'utf8');
  assert.match(html, /\/api\/lord-equipment-gem/);
  assert.match(html, /bindCatalog/);
  assert.doesNotMatch(html, /const EQUIP_CSV/);
  assert.doesNotMatch(html, /const GEM_CSV/);
  assert.match(serverSource, /mountLordEquipmentGemRoutes\(app\)/);
});

test('public catalog and calc routes return CORS-enabled JSON', async () => {
  const server = await startApp();
  try {
    const catalog = await requestJson(server, '/api/lord-equipment-gem');
    assert.equal(catalog.status, 200);
    assert.equal(catalog.json.equipment.length, 102);
    assert.equal(catalog.json.gems.length, 34);
    assert.equal(catalog.json.materials.gems[0].name, '宝石手册');
    assert.equal(catalog.headers.get('access-control-allow-origin'), '*');

    const equipment = await requestJson(server, '/api/lord-equipment');
    assert.equal(equipment.json.equipment.at(-1).name, '神话T6-3星');

    const gems = await requestJson(server, '/api/lord-gems');
    assert.equal(gems.json.gems.at(-1).label, '18级');

    const calcGet = await requestJson(server, '/api/lord-equipment/calc?from=1&to=2&pieces=6');
    assert.equal(calcGet.status, 200);
    assert.equal(calcGet.json.cost.alloy, 22800);

    const gemPost = await requestJson(server, '/api/lord-gems/calc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Lv.16', to: '18级', pieces: 1 })
    });
    assert.equal(gemPost.status, 200);
    assert.ok(gemPost.json.cost.manual > 0);

    const bad = await requestJson(server, '/api/lord-equipment/calc?from=missing&to=2');
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error, 'BAD_FROM');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
