const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildUserFilter, rowsToCsv, mapAdminRow } = require('../bearpit-admin');

test('buildUserFilter supports numeric id and text search', () => {
  const numeric = buildUserFilter('42', '');
  assert.match(numeric.sql, /u\.id = \?/);
  assert.equal(numeric.params.length, 3);

  const text = buildUserFilter('甜甜', '');
  assert.match(text.sql, /login_id LIKE \?/);
  assert.equal(text.params.length, 2);
});

test('rowsToCsv includes header and utf8 bom', () => {
  const csv = rowsToCsv([
    {
      userId: 1,
      loginId: 'testuser01',
      username: '测试',
      recordType: 'current',
      title: '当前存档',
      itemCount: 3,
      recordAt: '2026-06-04T12:00:00.000Z',
      data: { items: [{}, {}, {}] }
    }
  ]);
  assert.match(csv, /^\ufeff用户ID/);
  assert.match(csv, /testuser01/);
  assert.match(csv, /"items"/);
});

test('mapAdminRow parses backup row', () => {
  const row = mapAdminRow(
    {
      user_id: 9,
      login_id: 'user00001',
      username: '玩家A',
      record_type: 'backup',
      backup_id: 55,
      title: '我的方案',
      data_json: { items: [{ id: 1 }] },
      item_count: 1,
      record_at: '2026-06-04'
    },
    { includeData: true }
  );
  assert.equal(row.userId, 9);
  assert.equal(row.recordType, 'backup');
  assert.equal(row.itemCount, 1);
  assert.deepEqual(row.data.items.length, 1);
});

test('server mounts bearpit admin routes and admin page includes menu', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', 'bearpit-admin.js'), 'utf8');
  const adminHtml = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'function', '_ops', 'console-7a9', 'internal', 'admin.html'),
    'utf8'
  );
  assert.match(serverSource, /mountBearpitAdminRoutes\(/);
  assert.match(moduleSource, /\/api\/admin\/bearpit-layouts-export\.csv/);
  assert.match(adminHtml, /data-page="bearpit-data"/);
  assert.match(adminHtml, /admin-bearpit-page\.js/);
});
