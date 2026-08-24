const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('calendar admin exposes category management and all schedule modes', () => {
  const html = read('public/function/_ops/console-7a9/internal/admin.html');
  const page = html.match(/<section[^>]+id="page-calendar"[\s\S]*?<\/section>/)?.[0] || '';

  assert.match(page, /id="calendarCategoryList"/);
  assert.match(page, /id="calendarCategoryAddBtn"/);
  assert.match(page, /id="calendarScheduleList"/);
  assert.match(page, /id="calendarScheduleForm"/);
  for (const type of ['single', 'continuous', 'recurring', 'composite']) {
    assert.match(page, new RegExp(`<option value="${type}"`));
  }
  assert.match(page, /id="calendarCompositeLayout"/);
  assert.match(page, /id="calendarCompositeRecurring"/);
  assert.match(page, /value="gantt"/);
  assert.match(page, /value="daily-list"/);
  assert.match(page, /id="calendarCompositeItems"/);
});

test('calendar admin script supports recurrence, composite children, and CRUD actions', () => {
  const html = read('public/function/_ops/console-7a9/internal/admin.html');
  const js = read('public/function/admin-calendar-page.js');

  assert.match(html, /admin-calendar-page\.js/);
  assert.match(js, /\/api\/admin\/calendar\/categories/);
  assert.match(js, /\/api\/admin\/calendar\/schedules/);
  assert.match(js, /recurrenceUnit/);
  assert.match(js, /recurrenceEndType/);
  assert.match(js, /calendarCompositeRecurring/);
  assert.match(js, /selectedOffsets/);
  assert.match(js, /highlighted/);
  assert.match(js, /\/copy/);
  assert.match(js, /\/status/);
  assert.match(js, /method:'DELETE'/);
  assert.match(js, /window\.loadAdminCalendar/);
});

test('calendar admin updates use POST and routes retain PATCH compatibility behind CDN', () => {
  const js = read('public/function/admin-calendar-page.js');
  const legacyAdmin = read('public/function/_ops/console-7a9/internal/admin.html');
  const routes = read('calendar-routes.js');

  assert.match(
    js,
    /request\('\/api\/admin\/calendar\/categories\/'\+category\.id,\{method:'POST',body:JSON\.stringify\(\{name:name,color:String\(color\)\.trim\(\)\}\)\}\)/
  );
  assert.match(js, /request\(url,\{method:'POST',body:JSON\.stringify\(payload\)\}\)/);
  assert.doesNotMatch(js, /method:editingId\?'PATCH':'POST'/);
  assert.match(legacyAdmin, /var method = 'POST';/);

  assert.match(routes, /app\.patch\('\/api\/calendar\/schedules\/:originalId', handlers\.legacyUpdate\);/);
  assert.match(routes, /app\.post\('\/api\/calendar\/schedules\/:originalId', handlers\.legacyUpdate\);/);
  assert.match(routes, /app\.patch\('\/api\/admin\/calendar\/schedules\/:id', handlers\.updateSchedule\);/);
  assert.match(routes, /app\.post\('\/api\/admin\/calendar\/schedules\/:id', handlers\.updateSchedule\);/);
  assert.match(routes, /app\.patch\('\/api\/admin\/calendar\/categories\/:id', handlers\.updateCategory\);/);
  assert.match(routes, /app\.post\('\/api\/admin\/calendar\/categories\/:id', handlers\.updateCategory\);/);
});
