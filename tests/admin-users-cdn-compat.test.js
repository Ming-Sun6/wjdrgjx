const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), 'utf8');
}

test('admin user editor submits updates with POST for CDN compatibility', () => {
  const source = read(path.join('public', 'function', 'admin-users-page.js'));
  assert.match(
    source,
    /apiFetch\('\/api\/admin\/users\/'\+encodeURIComponent\(userId\),\{method:'POST',body:JSON\.stringify\(payload\)\}\)/
  );
});

test('admin user update API accepts POST alongside PATCH', () => {
  const source = read('server.js');
  assert.match(source, /app\.patch\('\/api\/admin\/users\/:id',\s*handleAdminUserUpdate\s*\);/);
  assert.match(source, /app\.post\('\/api\/admin\/users\/:id',\s*handleAdminUserUpdate\s*\);/);
});
