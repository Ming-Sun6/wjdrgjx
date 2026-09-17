const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizeCollectName,
  parseHeroPower,
  generateHostToken,
  KEY_RE,
  TOKEN_RE,
  MAX_NAME_LEN
} = require('../bearpit-collect');

test('normalizeCollectName trims and caps length', () => {
  assert.equal(normalizeCollectName('  张 三  '), '张 三');
  assert.equal(normalizeCollectName(''), null);
  assert.equal(normalizeCollectName('甲'.repeat(20)).length, MAX_NAME_LEN);
});

test('parseHeroPower accepts raw numbers and 万/亿', () => {
  assert.equal(parseHeroPower('12500000'), 12500000);
  assert.equal(parseHeroPower('1,250万'), 12500000);
  assert.equal(parseHeroPower('1.2亿'), 120000000);
  assert.equal(parseHeroPower('0'), null);
  assert.equal(parseHeroPower('abc'), null);
});

test('host tokens and collect keys use short alphanumeric codes', () => {
  const token = generateHostToken();
  assert.match(token, TOKEN_RE);
  assert.notEqual(token, generateHostToken());
  assert.match('Abcdefghijkmn234', KEY_RE);
});

test('server mounts bearpit collect routes', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', 'bearpit-collect.js'), 'utf8');
  const schemaSource = fs.readFileSync(path.join(__dirname, '..', 'postgres-schema.js'), 'utf8');
  assert.match(serverSource, /mountBearpitCollectRoutes\(/);
  assert.match(moduleSource, /\/api\/bearpit\/collect/);
  assert.match(moduleSource, /\/api\/bearpit\/collect\/:key\/entries/);
  assert.match(schemaSource, /bearpit_collect_forms/);
  assert.match(schemaSource, /bearpit_collect_entries/);
});


const fill = require('../public/function/bearpit-collect-fill');

test('website collect helper matches server power parsing', () => {
  assert.equal(fill.parseHeroPower('1,250万'), parseHeroPower('1,250万'));
  assert.equal(fill.parseHeroPower('1.2亿'), parseHeroPower('1.2亿'));
  assert.equal(fill.formatHeroPower(12500000), '1250万');
});

test('quick assign walks roster from highest power', () => {
  const roster = [
    { name: '乙', power: 200 },
    { name: '甲', power: 900 },
    { name: '丙', power: 400 }
  ];
  assert.equal(fill.nextQuickAssign(roster, 0).entry.name, '甲');
  assert.equal(fill.nextQuickAssign(roster, 1).entry.name, '丙');
  assert.equal(fill.nextQuickAssign(roster, 2).entry.name, '乙');
  assert.equal(fill.nextQuickAssign(roster, 3), null);
  assert.equal(fill.nextQuickAssign([], 0), null);
});

test('first ring around a 3x3 bear has 8 furnace slots', () => {
  const bear = { r: 10, c: 10, s: 3 };
  assert.equal(fill.ringSlotCount(1), 8);
  assert.equal(fill.ringSlotCount(2), 16);
  assert.equal(fill.ringTilePositions(bear, 1).length, 8);
  const occ = new Set();
  for (let r = 10; r < 13; r++) {
    for (let c = 10; c < 13; c++) occ.add(r + '-' + c);
  }
  const slots = fill.furnaceSlotsAroundBear(bear, 40, occ, 8);
  assert.equal(slots.length, 8);
});

test('website BeaPit page and public fill form expose collect flow', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'function', 'BeaPit.html'), 'utf8');
  const fillPage = fs.readFileSync(path.join(__dirname, '..', 'public', 'function', 'bearpit-collect.html'), 'utf8');
  assert.match(page, /btnCollectShare/);
  assert.match(page, /btnCollectList/);
  assert.match(page, /btnCollectLayout/);
  assert.match(page, /btnCollectQuick/);
  assert.match(page, /btnBeaPitHelp/);
  assert.match(page, /使用教程/);
  assert.match(page, /快速排布/);
  assert.match(page, /收集信息/);
  assert.match(page, /nextQuickAssign/);
  assert.match(page, /beapit-quick-assign/);
  assert.match(page, /bearpit-collect-fill\.js/);
  assert.match(fillPage, /填写打熊信息/);
  assert.match(fillPage, /英雄总实力/);
  assert.match(fillPage, /submitCollectEntry/);
  assert.match(fillPage, /og:title" content="hi～快来填写你的游戏信息！"/);
});
