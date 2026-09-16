const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { normalizeTemplateTitle, isBeaPitTemplateData, MAX_TITLE_LEN } = require('../bearpit-templates');

test('normalizeTemplateTitle trims and caps length', () => {
  assert.equal(normalizeTemplateTitle('  内圈炉  '), '内圈炉');
  assert.equal(normalizeTemplateTitle(''), null);
  assert.equal(normalizeTemplateTitle('甲'.repeat(20)).length, MAX_TITLE_LEN);
});

test('template payload requires a BeaPit layout with items', () => {
  assert.equal(isBeaPitTemplateData({ v: 1, items: [{ r: 1, c: 2, s: 2 }] }), true);
  assert.equal(isBeaPitTemplateData({ v: 2, i: [[1, 2, 2]] }), true);
  assert.equal(isBeaPitTemplateData({ v: 1, items: [] }), false);
  assert.equal(isBeaPitTemplateData({ grid: { rows: 21 }, placements: [] }), false);
  assert.equal(isBeaPitTemplateData(null), false);
});

test('server mounts bearpit template market routes', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', 'bearpit-templates.js'), 'utf8');
  const schemaSource = fs.readFileSync(path.join(__dirname, '..', 'postgres-schema.js'), 'utf8');
  assert.match(serverSource, /mountBearpitTemplateRoutes\(/);
  assert.match(moduleSource, /\/api\/bearpit\/mp\/templates/);
  assert.match(moduleSource, /\/api\/bearpit\/mp\/templates\/:key/);
  assert.match(moduleSource, /\/api\/bearpit\/mp\/templates\/:key\/unpublish/);
  assert.match(schemaSource, /bearpit_templates/);
});
