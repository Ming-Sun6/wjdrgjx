const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('server exposes public and admin site footer settings endpoints', () => {
  const source = read('server.js');

  assert.match(source, /DEFAULT_SITE_FOOTER_CREDITS/);
  assert.match(source, /app\.get\('\/api\/site-footer'/);
  assert.match(source, /app\.get\('\/api\/admin\/site-footer'/);
  assert.match(source, /app\.(?:put|post)\('\/api\/admin\/site-footer'/);
  assert.match(source, /setSetting\('site_footer'/);
});

test('shared footer script loads configurable credits and renders safely', () => {
  const source = read('public/function/site-footer.js');

  assert.match(source, /fetch\('\/api\/site-footer'/);
  assert.match(source, /footer\.wjdr-footer/);
  assert.match(source, /textContent/);
  assert.doesNotMatch(source, /innerHTML\s*=\s*data\./);
});

test('analytics tracker installs the shared footer script on static pages', () => {
  const source = read('public/function/analytics-tracker.js');

  assert.match(source, /ensureSiteFooterScript/);
  assert.match(source, /\/function\/site-footer\.js/);
});

test('admin console has a site footer editor page', () => {
  const html = read('public/function/_ops/console-7a9/internal/admin.html');

  assert.match(html, /data-page="site-footer"/);
  assert.match(html, /id="siteFooterContent"/);
  assert.match(html, /\/api\/admin\/site-footer/);
  assert.match(html, /siteFooterSaveBtn/);
});
