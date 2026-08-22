const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('history immigration admin and public pages expose configuration hooks', () => {
  const root = path.join(__dirname, '..');
  const admin = fs.readFileSync(path.join(root, 'public/function/_ops/console-7a9/internal/admin.html'), 'utf8');
  const adminJs = fs.readFileSync(path.join(root, 'public/function/admin-history-immigration-page.js'), 'utf8');
  const history = fs.readFileSync(path.join(root, 'public/function/history-immigration-group.html'), 'utf8');
  const prediction = fs.readFileSync(path.join(root, 'public/function/migration-prediction.html'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(admin, /data-page="history-immigration"/);
  assert.match(adminJs, /api\/admin\/history-immigration/);
  assert.match(history, /api\/history-immigration/);
  assert.match(prediction, /api\/history-immigration/);
  assert.match(server, /api\/history-immigration/);
});
