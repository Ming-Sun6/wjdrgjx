const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('admin exposes a homepage navigation settings page with five fixed switches', () => {
  const html = read('public/function/_ops/console-7a9/internal/admin.html');
  const page = html.match(/<section[^>]+id="page-home-navigation"[\s\S]*?<\/section>/)?.[0] || '';

  assert.match(html, /data-page="home-navigation"[^>]*>首页菜单/);
  assert.match(page, /id="homeNavigationItems"/);
  assert.match(page, /id="homeNavigationReloadBtn"/);
  assert.match(page, /id="homeNavigationSaveBtn"[^>]*disabled/);
  assert.match(html, /admin-home-navigation-page\.js/);
});

test('homepage navigation admin loads, validates, and saves the complete list', () => {
  const js = read('public/function/admin-home-navigation-page.js');

  assert.match(js, /\/api\/admin\/home-navigation/);
  assert.match(js, /\['all','tools','forum','calendar','my'\]/);
  assert.match(js, /HOME_NAVIGATION_EMPTY/);
  assert.match(js, /method:'PUT'/);
  assert.match(js, /method:'POST'/);
  assert.match(js, /window\.loadAdminHomeNavigation/);
});

