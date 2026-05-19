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

test('profile and admin moderation flows submit updates with POST for CDN compatibility', () => {
  const indexSource = read('index.html');
  const adminSource = read(path.join('public', 'function', 'admin.html'));
  const serverSource = read('server.js');

  assert.match(indexSource, /apiFetch\('\/api\/profile',\{method:'POST',body:JSON\.stringify\(\{/);
  assert.match(adminSource, /apiFetch\('\/api\/admin\/forum\/settings',\{method:'POST',body:JSON\.stringify\(\{autoApprove:/);
  assert.match(adminSource, /apiFetch\('\/api\/admin\/forum\/posts\/'\+postId\+'\/review',\{method:'POST',body:JSON\.stringify\(\{action: action\}\)\}\)/);
  assert.match(adminSource, /apiFetch\('\/api\/admin\/user-delete-requests\/'\+requestId,\{method:'POST',body:JSON\.stringify\(\{action: action\}\)\}\)/);

  assert.match(serverSource, /app\.patch\('\/api\/profile',\s*handleProfileUpdate\s*\);/);
  assert.match(serverSource, /app\.post\('\/api\/profile',\s*handleProfileUpdate\s*\);/);
  assert.match(serverSource, /app\.patch\('\/api\/admin\/forum\/settings',\s*handleAdminForumSettingsUpdate\s*\);/);
  assert.match(serverSource, /app\.post\('\/api\/admin\/forum\/settings',\s*handleAdminForumSettingsUpdate\s*\);/);
  assert.match(serverSource, /app\.patch\('\/api\/admin\/forum\/posts\/:id\/review',\s*handleAdminForumPostReview\s*\);/);
  assert.match(serverSource, /app\.post\('\/api\/admin\/forum\/posts\/:id\/review',\s*handleAdminForumPostReview\s*\);/);
  assert.match(serverSource, /app\.patch\('\/api\/admin\/user-delete-requests\/:id',\s*handleAdminUserDeleteRequestReview\s*\);/);
  assert.match(serverSource, /app\.post\('\/api\/admin\/user-delete-requests\/:id',\s*handleAdminUserDeleteRequestReview\s*\);/);
});

test('admin user editor includes visible save result hint near the save action', () => {
  const source = read(path.join('public', 'function', 'admin-users-page.js'));
  assert.match(source, /userDetailSaveHint/);
  assert.match(source, /setSaveHint\(modal,'保存中\.\.\.'/);
  assert.match(source, /var failMsg='保存失败：'/);
  assert.match(source, /var okMsg='保存成功/);
});
