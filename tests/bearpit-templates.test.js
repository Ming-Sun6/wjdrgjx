const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizeTemplateTitle,
  normalizeTemplateStatus,
  normalizeRejectReason,
  isBeaPitTemplateData,
  extractTemplatePreviewItems,
  MAX_TITLE_LEN,
  MAX_REJECT_REASON,
  STATUS_PENDING,
  STATUS_APPROVED,
  STATUS_REJECTED
} = require('../bearpit-templates');

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

test('template review helpers normalize status and reject reason', () => {
  assert.equal(normalizeTemplateStatus('approved'), STATUS_APPROVED);
  assert.equal(normalizeTemplateStatus('rejected'), STATUS_REJECTED);
  assert.equal(normalizeTemplateStatus(''), STATUS_PENDING);
  assert.equal(normalizeRejectReason('  内容不当  ').length > 0, true);
  assert.equal(normalizeRejectReason('甲'.repeat(120)).length, MAX_REJECT_REASON);
});

test('extractTemplatePreviewItems reads v1 items and v2 compact rows', () => {
  const v1 = extractTemplatePreviewItems({
    gs: 24,
    items: [{ r: 1, c: 2, s: 2, n: 'A', i: 'castle.png' }]
  });
  assert.equal(v1.gs, 24);
  assert.equal(v1.items.length, 1);
  assert.equal(v1.items[0].n, 'A');

  const v2 = extractTemplatePreviewItems({ v: 2, i: [[3, 4, 3, '', 'beartrap.png']] });
  assert.equal(v2.items[0].s, 3);
  assert.equal(v2.items[0].i, 'beartrap.png');
});

test('server mounts bearpit template market and admin review routes', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', 'bearpit-templates.js'), 'utf8');
  const schemaSource = fs.readFileSync(path.join(__dirname, '..', 'postgres-schema.js'), 'utf8');
  assert.match(serverSource, /mountBearpitTemplateRoutes\(/);
  assert.match(serverSource, /requireAdmin/);
  assert.match(moduleSource, /\/api\/bearpit\/mp\/templates/);
  assert.match(moduleSource, /\/api\/bearpit\/mp\/templates\/:key/);
  assert.match(moduleSource, /\/api\/bearpit\/mp\/templates\/:key\/unpublish/);
  assert.match(moduleSource, /\/api\/bearpit\/mp\/templates\/status-batch/);
  assert.match(moduleSource, /\/api\/admin\/bearpit-templates/);
  assert.match(moduleSource, /\/api\/admin\/bearpit-templates\/:key\/approve/);
  assert.match(moduleSource, /\/api\/admin\/bearpit-templates\/:key\/reject/);
  assert.match(moduleSource, /\/api\/admin\/bearpit-templates\/:key\/delete/);
  assert.match(moduleSource, /WHERE status = \?/);
  assert.match(schemaSource, /bearpit_templates/);
  assert.match(schemaSource, /reject_reason/);
});
