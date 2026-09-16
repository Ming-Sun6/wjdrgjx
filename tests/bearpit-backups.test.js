const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizeBackupTitle,
  defaultBackupTitle,
  countLayoutItems,
  generateShareKey,
  isValidShareData,
  sanitizeShareData
} = require('../bearpit-backups');

test('normalizeBackupTitle trims and caps length', () => {
  assert.equal(normalizeBackupTitle('  我的方案  '), '我的方案');
  assert.equal(normalizeBackupTitle(''), null);
  assert.equal(normalizeBackupTitle('x'.repeat(130)).length, 120);
});

test('defaultBackupTitle includes timestamp prefix', () => {
  const title = defaultBackupTitle(new Date('2026-06-04T14:30:00'));
  assert.match(title, /^存档 2026-06-04 14:30$/);
});

test('countLayoutItems counts placed items only', () => {
  assert.equal(countLayoutItems({ items: [{}, {}] }), 2);
  assert.equal(countLayoutItems({ placements: [{}, {}, {}] }), 3);
  assert.equal(countLayoutItems({ v: 2, i: [[1, 2, 2], [3, 4, 1]] }), 2);
  assert.equal(countLayoutItems({}), 0);
});

test('share payload accepts both BeaPit compact layouts and simple-version layouts', () => {
  assert.equal(isValidShareData({ v: 2, i: [[10, 20, 2, '矿']] }), true);
  assert.equal(isValidShareData({ v: 1, items: [{ r: 1, c: 2, s: 2 }] }), true);
  assert.equal(isValidShareData({ grid: { rows: 21, cols: 21 }, placements: [] }), true);
  assert.equal(isValidShareData({ v: 2, i: 'nope' }), false);
  assert.equal(isValidShareData({ foo: 1 }), false);
  assert.equal(isValidShareData(null), false);
});

test('server mounts bearpit backup routes and BeaPit page has backup UI', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', 'bearpit-backups.js'), 'utf8');
  assert.match(serverSource, /mountBearpitBackupRoutes\(/);
  assert.match(moduleSource, /\/api\/bearpit\/backups/);
  assert.match(moduleSource, /\/api\/bearpit\/shares/);
  assert.match(moduleSource, /\/api\/bearpit\/mp\/shares/);
  assert.match(moduleSource, /isValidShareData\(data\)/);
  assert.match(moduleSource, /requireAuth\(req, res\)/);

  const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'function', 'BeaPit.html'), 'utf8');
  assert.match(page, /woam-save-scheme/);
  assert.match(page, /backupLoadModal/);
  assert.match(page, /\/api\/bearpit\/backups/);
  assert.match(page, /serializeLayoutCompact\(\)/);
  assert.match(page, /\/api\/bearpit\/shares\/' \+ encodeURIComponent\(text\)/);
});

test('sanitizeShareData strips collect session secrets from layout payloads', () => {
  const clean = sanitizeShareData({
    v: 1,
    items: [{ r: 1, c: 2, s: 2 }],
    ck: 'collectKeyShouldGo',
    ct: 'hostTokenShouldGo',
    collectKey: 'alsoGone',
    hostToken: 'alsoGone'
  });
  assert.equal(clean.v, 1);
  assert.equal(clean.items.length, 1);
  assert.equal(clean.ck, undefined);
  assert.equal(clean.ct, undefined);
  assert.equal(clean.collectKey, undefined);
  assert.equal(clean.hostToken, undefined);
});

test('share keys are short random alphanumeric codes', () => {
  const key = generateShareKey();
  assert.match(key, /^[A-Za-z0-9]{16}$/);
  assert.notEqual(key, generateShareKey());
});

test('simple version keeps legacy base64 share import compatibility', () => {
  const toolbar = fs.readFileSync(path.join(__dirname, '..', 'bear-pit-simple-src', 'src', 'components', 'Toolbar.tsx'), 'utf8');
  assert.match(toolbar, /atob\(/);
  assert.match(toolbar, /分享秘钥无效或已损坏/);
});

test('simple version requires login for server-backed saves and shares', () => {
  const toolbar = fs.readFileSync(path.join(__dirname, '..', 'bear-pit-simple-src', 'src', 'components', 'Toolbar.tsx'), 'utf8');
  assert.match(toolbar, /\/api\/auth\/me/);
  assert.match(toolbar, /\/api\/bearpit-simple\/backups/);
  assert.match(toolbar, /登录后才能/);
});

test('simple version archives use an isolated API namespace', () => {
  const toolbar = fs.readFileSync(path.join(__dirname, '..', 'bear-pit-simple-src', 'src', 'components', 'Toolbar.tsx'), 'utf8');
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', 'bearpit-backups.js'), 'utf8');
  assert.match(toolbar, /\/api\/bearpit-simple\/backups/);
  assert.match(moduleSource, /\/api\/bearpit-simple\/backups/);
});
