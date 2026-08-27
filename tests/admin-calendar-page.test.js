const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const calendarPageHtml = () => {
  const html = read('public/function/_ops/console-7a9/internal/admin.html');
  return html.match(/<section[^>]+id="page-calendar"[\s\S]*?<\/section>/)?.[0] || '';
};

test('calendar admin production page uses the approved five-step workspace', () => {
  const page = calendarPageHtml();
  const html = read('public/function/_ops/console-7a9/internal/admin.html');

  for (const step of ['basic', 'date', 'tasks', 'style', 'presets']) {
    assert.match(page, new RegExp(`data-calendar-step="${step}"`));
    assert.match(page, new RegExp(`data-calendar-panel="${step}"`));
  }
  assert.match(page, /id="calendarScheduleNewBtn"/);
  assert.match(page, /id="calendarAdminPreview"/);
  assert.match(page, /id="calendarPreviewRange"/);
  assert.match(page, /value="365"/);
  assert.match(page, /value="custom"/);
  assert.match(page, /id="calendarPreviewCustomRange"/);
  assert.match(html, /id="calendarPreviewEditDialog"/);
  assert.match(html, /id="calendarPreviewEditBold"/);
  assert.match(html, /id="calendarPreviewEditScope"/);
  assert.match(html, /value="single"/);
  assert.match(html, /value="future"/);
  assert.match(html, /id="calendarHelpDialog"/);
  assert.match(page, /data-calendar-structure="normal"/);
  assert.match(page, /data-calendar-structure="composite"/);
});

test('calendar admin loads versioned production assets in dependency order', () => {
  const html = read('public/function/_ops/console-7a9/internal/admin.html');
  const modelAt = html.indexOf('/function/admin-calendar-model.js?v=20260827-5');
  const pageAt = html.indexOf('/function/admin-calendar-page.js?v=20260827-9');

  assert.ok(modelAt > 0 && pageAt > modelAt);
  assert.match(html, /admin-calendar-page\.css\?v=20260827-5/);
});

test('calendar admin script exposes the editor API and step controller', () => {
  const js = read('public/function/admin-calendar-page.js');

  assert.match(js, /function setEditorStep\s*\(/);
  assert.match(js, /data-calendar-step/);
  assert.match(js, /data-calendar-panel/);
  assert.match(js, /window\.AdminCalendarPage/);
  assert.match(js, /renderAdminPreview/);
  assert.match(js, /savePreviewEdit/);
  assert.match(js, /previewDays=90/);
  assert.match(js, /calendarPreviewCustomRange/);
  assert.match(js, /clampPreviewDays/);
  assert.match(js, /calendar-help-trigger/);
  assert.match(js, /scheduleToEditor/);
  assert.match(js, /editorToPayload/);
});

test('calendar admin styles provide the approved desktop and mobile workspace', () => {
  const css = read('public/function/admin-calendar-page.css');

  assert.match(css, /\.calendar-workspace\s*\{[^}]*grid-template-columns:\s*220px\s+minmax\(0,1fr\)/s);
  assert.match(css, /\.calendar-step-button[^}]*min-height:\s*40px/s);
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /@media\s*\(max-width:\s*560px\)[\s\S]*?\.calendar-step-nav\s*\{[^}]*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/s);
  assert.match(css, /\.calendar-sticky-actions\s+\.btn[^}]*min-height:\s*40px/s);
  assert.match(css, /\.calendar-help-dialog,\.calendar-preview-edit-dialog\{[^}]*position:fixed[^}]*inset:50% auto auto 50%[^}]*transform:translate\(-50%,-50%\)/s);
  assert.match(css, /\.calendar-preview-drop\.is-drop-target/);
  assert.match(css, /@media\s*\(max-width:\s*560px\)[\s\S]*?\.calendar-sticky-actions\s+#[^}]*grid-column:\s*1\/-1/s);
});

test('admin-only changelog records the production calendar workspace release', () => {
  const html = read('public/function/_ops/console-7a9/internal/admin.html');

  assert.match(html, /V0\.9\.40（2026-08-26）/);
  assert.match(html, /活动日历五步工作台/);
  assert.match(html, /旧日程无损编辑/);
});

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
  assert.match(page, /id="calendarChildColorMode"/);
  for (const mode of ['uniform', 'random', 'custom']) assert.match(page, new RegExp(`value="${mode}"`));
  assert.match(page, /value="gantt"/);
  assert.match(page, /value="daily-list"/);
  assert.match(page, /id="calendarCompositeItems"/);
  assert.match(page, /id="calendarDailyChecklistBoard"/);
  assert.match(page, /id="calendarGanttTaskBoard"/);
  assert.match(html, /id="calendarDailyItemColor"/);
  assert.match(html, /id="calendarDailyItemHighlighted"/);
  const js = read('public/function/admin-calendar-page.js');
  assert.match(js, /rawIndex=String\(byId\('calendarDailyItemIndex'\)\.value\|\|''\)\.trim\(\)/);
  assert.match(js, /calendar-gantt-category-heading/);
  assert.match(js, /calendar-gantt-parent-cell/);
  assert.match(js, /calendar-gantt-task-bar/);
});

test('calendar admin script supports recurrence, composite children, and CRUD actions', () => {
  const html = read('public/function/_ops/console-7a9/internal/admin.html');
  const js = read('public/function/admin-calendar-page.js');

  assert.match(html, /admin-calendar-page\.js\?v=20260827-9/);
  assert.match(js, /\/api\/admin\/calendar\/categories/);
  assert.match(js, /\/api\/admin\/calendar\/schedules/);
  assert.match(js, /recurrenceUnit/);
  assert.match(js, /recurrenceEndType/);
  assert.match(js, /calendarRepeatEnabled/);
  assert.match(js, /selectedOffsets/);
  assert.match(js, /highlighted/);
  assert.match(js, /calendarDailyItemHighlighted/);
  assert.match(js, /childColorMode/);
  assert.match(js, /childDisplayColor/);
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
  assert.match(js, /moveScheduleToDate[\s\S]*?method:'POST'/);
  assert.match(legacyAdmin, /var method = 'POST';/);

  assert.match(routes, /app\.patch\('\/api\/calendar\/schedules\/:originalId', handlers\.legacyUpdate\);/);
  assert.match(routes, /app\.post\('\/api\/calendar\/schedules\/:originalId', handlers\.legacyUpdate\);/);
  assert.match(routes, /app\.patch\('\/api\/admin\/calendar\/schedules\/:id', handlers\.updateSchedule\);/);
  assert.match(routes, /app\.post\('\/api\/admin\/calendar\/schedules\/:id', handlers\.updateSchedule\);/);
  assert.match(routes, /app\.patch\('\/api\/admin\/calendar\/categories\/:id', handlers\.updateCategory\);/);
  assert.match(routes, /app\.post\('\/api\/admin\/calendar\/categories\/:id', handlers\.updateCategory\);/);
  assert.match(routes, /app\.post\('\/api\/admin\/calendar\/categories\/reorder', handlers\.reorderCategories\);/);
  assert.ok(routes.indexOf("app.post('/api/admin/calendar/categories/reorder'") < routes.indexOf("app.post('/api/admin/calendar/categories/:id', handlers.updateCategory)"));
  assert.match(js, /disabled=!category\.enabled/);
  assert.match(js, /所属日程已从公开日历隐藏；重新启用后会恢复显示/);
  assert.match(js, /所属日程已恢复公开显示/);
});

test('hidden composite child names do not block normal schedule submission', () => {
  const js = read('public/function/admin-calendar-page.js');

  assert.doesNotMatch(js, /data-field="name"[^>]*\srequired/);
  assert.match(js, /payload\.scheduleType==='composite'[\s\S]*?item\.name[\s\S]*?请填写所有子任务名称/);
});

test('composite editor retains existing child sort orders', () => {
  const js = read('public/function/admin-calendar-page.js');

  assert.match(js, /data-field="sortOrder"/);
  assert.match(js, /sortOrder:Number\(value\('sortOrder'\)\)/);
  assert.match(js, /nextCompositeSortOrder\(\)/);
  assert.match(js, /formModel\(\)\.nextSortOrder\(values\)/);
});
