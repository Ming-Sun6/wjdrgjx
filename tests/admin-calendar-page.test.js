const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('calendar admin exposes a clearer structure, optional recurrence, presets, and improved pickers', () => {
  const html = read('public/function/_ops/console-7a9/internal/admin.html');
  const page = html.match(/<section[^>]+id="page-calendar"[\s\S]*?<\/section>/)?.[0] || '';

  assert.match(page, /id="calendarCategoryList"/);
  assert.match(page, /id="calendarCategoryAddBtn"/);
  assert.match(page, /id="calendarScheduleList"/);
  assert.match(page, /id="calendarScheduleForm"/);
  for (const type of ['normal', 'composite']) {
    assert.match(page, new RegExp(`<option value="${type}"`));
  }
  assert.match(page, /id="calendarDateMode"/);
  assert.match(page, /id="calendarDurationDays"/);
  assert.match(page, /id="calendarRepeatEnabled"/);
  assert.match(page, /id="calendarDateQuickActions"/);
  assert.match(page, /data-date-offset="0"/);
  assert.match(page, /data-date-offset="1"/);
  assert.match(page, /id="calendarDatePreview"/);
  assert.match(page, /id="calendarColorPalette"/);
  assert.match(page, /id="calendarScheduleColorHex"/);
  assert.match(page, /id="calendarPresetList"/);
  assert.match(page, /id="calendarPresetSaveBtn"/);
  assert.match(page, /id="calendarCompositeLayout"/);
  assert.match(page, /value="gantt"/);
  assert.match(page, /value="daily-list"/);
  assert.match(page, /id="calendarCompositeItems"/);
});

test('calendar admin script supports recurrence, composite children, and CRUD actions', () => {
  const html = read('public/function/_ops/console-7a9/internal/admin.html');
  const js = read('public/function/admin-calendar-page.js');

  assert.match(html, /admin-calendar-page\.js\?v=20260825-4/);
  assert.match(js, /\/api\/admin\/calendar\/categories/);
  assert.match(js, /\/api\/admin\/calendar\/schedules/);
  assert.match(js, /recurrenceUnit/);
  assert.match(js, /recurrenceEndType/);
  assert.match(js, /calendarRepeatEnabled/);
  assert.match(js, /selectedOffsets/);
  assert.match(js, /highlighted/);
  assert.match(js, /\/copy/);
  assert.match(js, /\/status/);
  assert.match(js, /method:'DELETE'/);
  assert.match(js, /window\.loadAdminCalendar/);
});

test('calendar admin picker logic synchronizes duration, quick dates, category colors, palette, and hex input', () => {
  const js = read('public/function/admin-calendar-page.js');
  assert.match(js, /calendarDateQuickActions/);
  assert.match(js, /calendarDurationDays/);
  assert.match(js, /calendarDatePreview/);
  assert.match(js, /calendarColorPalette/);
  assert.match(js, /calendarScheduleColorHex/);
  assert.match(js, /syncScheduleColor/);
  assert.match(js, /\/api\/admin\/calendar\/presets/);
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

test('hidden composite child names do not block normal schedule submission', () => {
  const js = read('public/function/admin-calendar-page.js');

  assert.doesNotMatch(js, /data-field="name"[^>]*\srequired/);
  assert.match(js, /payload\.scheduleType==='composite'[\s\S]*?item\.name[\s\S]*?请填写所有子任务名称/);
});
