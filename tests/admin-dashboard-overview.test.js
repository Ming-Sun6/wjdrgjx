const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const adminHtml = read('public/function/_ops/console-7a9/internal/admin.html');
const dashboardJs = read('public/function/admin-dashboard.js');
const layoutJs = read('public/function/admin-dashboard-layout.js');

test('operations dashboard page is a Chinese data overview', () => {
  const start = adminHtml.indexOf('id="page-operations-dashboard"');
  const end = adminHtml.indexOf('id="page-admins"');
  const chunk = adminHtml.slice(start, end);
  assert.match(chunk, />后台大屏</);
  assert.match(chunk, /时间范围/);
  assert.match(chunk, /id="dashboardTimeGroup"/);
  assert.match(chunk, /id="dashboardHeroGrid"/);
  assert.match(chunk, /id="dashboardTrafficTrend"/);
  assert.match(chunk, /热门页面/);
  assert.match(chunk, /快速动作/);
  assert.doesNotMatch(chunk, /Operations Dashboard|Live Signals|command-kicker/);
  assert.doesNotMatch(chunk, />Traffic<|>Signals<|>Users<|>Content<|>Pages<|>Functions<|>API<|>Ops<|>Actions</);
});

test('dashboard renderer flattens KPI cards and keeps time APIs', () => {
  assert.match(dashboardJs, /split\.hero \|\| \[\]\)\.concat\(split\.support/);
  assert.match(dashboardJs, /\/api\/admin\/dashboard\/summary/);
  assert.match(dashboardJs, /\/api\/admin\/dashboard\/trends/);
  assert.match(dashboardJs, /\/api\/admin\/dashboard\/rankings/);
  assert.doesNotMatch(dashboardJs, /buildSupportGroups|指挥甲板|toUpperCase/);
  assert.match(dashboardJs, /signalLevelLabel/);
});

test('dashboard layout copy stays Chinese', () => {
  assert.match(layoutJs, /后台大屏|\\u540e\\u53f0\\u5927\\u5c4f/);
  assert.match(layoutJs, /流量趋势|\\u6d41\\u91cf\\u8d8b\\u52bf/);
  assert.doesNotMatch(layoutJs, /Signal Deck/);
});
