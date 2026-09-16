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
