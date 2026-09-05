const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/function/calendar.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/function/calendar-gantt.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public/function/calendar-gantt.js'), 'utf8');
const gantt = require('../public/function/calendar-gantt.js');

test('calendar page is a week/month gantt shell with embedded mode hooks', () => {
  assert.match(html, /id="calendarViewWeek"/);
  assert.match(html, /id="calendarViewMonth"/);
  assert.doesNotMatch(html, /data-view="daily"/);
  assert.match(html, /id="calendarWeekPicker"[^>]+type="week"/);
  assert.match(html, /id="calendarMonthPicker"[^>]+type="month"/);
  assert.match(html, /id="calendarGanttRoot"/);
  assert.match(html, /calendar-gantt\.css/);
  assert.match(html, /calendar-gantt\.js/);
  assert.match(html, /calendar\.html\?embed=1|embed/);
  assert.match(html, /id="wjdrAdworkSlot"/);
  assert.match(html, /class="adwork-net adwork-auto"/);
  assert.match(html, /data-id="1129"/);
  assert.match(html, /<body[^>]*>[\s\S]*id="wjdrAdworkSlot"[\s\S]*<main/);
  assert.match(css, /html\.is-embedded \.wjdr-adwork-slot/);
});

test('browser UTC and ISO week helpers match navigation boundaries', () => {
  assert.deepEqual(gantt.getIsoWeek('2027-01-01'), { weekYear: 2026, week: 53 });
  assert.equal(gantt.startOfIsoWeek('2027-01-01'), '2026-12-28');
    assert.deepEqual(gantt.getNavigationBounds('2026-08-25'), {
    earliestMonth: '2025-08', latestMonth: '2027-08', earliestDate: '2025-08-25', latestDate: '2027-08-25'
  });
});

test('calendar defaults to a horizontally scrollable timeline', () => {
  assert.match(html, /id="calendarViewTimeline"/);
  assert.match(js, /view:\s*["']timeline["']/);
  assert.match(js, /function renderTimeline/);
  assert.match(js, /if\s*\(state\.view\s*===\s*["']timeline["']\)\s*\{\s*els\.root\.appendChild\(renderTimeline\(range\)\);\s*return;\s*\}/);
  assert.match(js, /calendar-continuous-timeline/);
  assert.match(css, /calendar-continuous-timeline/);
  assert.match(css, /repeat\(var\(--timeline-days\),var\(--timeline-day-width\)\)/);
  assert.match(css, /\.calendar-continuous-timeline\{--timeline-day-width:134px\}/);
  assert.doesNotMatch(js, /calendar-timeline-track/);
  assert.match(js, /pointerdown/);
  assert.match(js, /scrollLeft\s*=\s*timelinePan\.scrollLeft\s*-\s*delta/);
  assert.match(css, /touch-action:pan-y/);
});

test('timeline merges daily checklist children into one row below the parent', () => {
  assert.match(js, /timelineDailyTitle:\s*true/);
  assert.match(js, /return[ \t]*\[title\]\.concat\(cards\)/);
  assert.match(js, /calendar-timeline-daily-title/);
  assert.match(js, /function renderTimelineDailySection/);
  assert.match(js, /calendar-timeline-daily-children/);
  assert.match(js, /function cardRange/);
  assert.match(js, /packLanes\(clippedDailyCards/);
  assert.match(js, /const compositeKey\s*=\s*schedule\.scheduleId/);
  assert.match(js, /group\.composites\.get\(compositeKey\)\.push\(schedule\)/);
  assert.match(js, /schedules\.flatMap\(\(schedule\)\s*=>\s*timelineItems\(schedule, range\),?\s*\)/);
  assert.match(js, /titles\.forEach\(\(title\)\s*=>/);
  assert.match(css, /\.calendar-timeline-daily-children/);
  assert.doesNotMatch(js, /card\.date\s*===\s*date/);
});

test('timeline preserves composite parent labels above their child tasks', () => {
  assert.match(js, /group\.composites\.get\(compositeKey\)\.push\(schedule\)/);
  assert.match(js, /timelineSection\(\s*group\.category\.name,\s*schedules\.flatMap\([\s\S]*?schedule\.name/);
  assert.match(js, /timelineName:\s*item\.name/);
  assert.match(js, /calendar-timeline-parent-name/);
  assert.match(css, /\.calendar-timeline-parent-name/);
});

test('calendar renders the persisted bold schedule style', () => {
  assert.match(js, /item\.fontBold\s*\?\s*["']900["']/);
  assert.match(js, /fontBold:\s*schedule\.fontBold\s*\|\|\s*card\.fontBold/);
});

test('important child tasks render a thumbs-up marker in every calendar view', () => {
  assert.match(html, /calendar-gantt\.js\?v=20260829-2/);
  assert.match(html, /calendar-gantt\.css\?v=20260905-1/);
  assert.match(js, /function appendHighlight/);
  assert.match(js, /mark\.textContent\s*=\s*["']👍["']/);
  assert.ok((js.match(/appendHighlight\(/g) || []).length >= 3);
  assert.match(css, /\.calendar-bar \.highlight/);
});

test('lane packing keeps lower sortOrder above shorter same-start tasks', () => {
  const lanes = gantt.packLanes([
    { id: 'short', startDate: '2026-08-17', endDate: '2026-08-17', sortOrder: 30 },
    { id: 'escort', startDate: '2026-08-17', endDate: '2026-08-22', sortOrder: 10 },
    { id: 'intercept', startDate: '2026-08-17', endDate: '2026-08-22', sortOrder: 20 }
  ]);
  assert.deepEqual(lanes.map((lane) => lane.map((item) => item.id)), [['escort'], ['intercept'], ['short']]);
});

test('first-fit lane packing shares adjacent tasks and separates overlaps', () => {
  const lanes = gantt.packLanes([
    { id: 'a', startDate: '2026-08-24', endDate: '2026-08-26' },
    { id: 'b', startDate: '2026-08-27', endDate: '2026-08-28' },
    { id: 'c', startDate: '2026-08-25', endDate: '2026-08-29' }
  ]);
  assert.deepEqual(lanes.map((lane) => lane.map((item) => item.id)), [['a', 'b'], ['c']]);
});

test('calendar styles provide warm rounded gantt grids and horizontal scrolling', () => {
  assert.match(css, /--calendar-cream/);
  assert.match(css, /border-radius/);
  assert.match(css, /\.calendar-category-cell[^}]*position:\s*sticky/s);
  assert.match(css, /grid-template-columns:\s*minmax\([^;]+repeat\(7/s);
  assert.match(css, /overflow-x:\s*auto/);
});

test('every week and month category column stays fixed while scrolling', () => {
  assert.match(css, /\.calendar-category-cell\{[^}]*position:sticky[^}]*left:0/s);
  assert.match(css, /\.calendar-category-head\{[^}]*position:sticky[^}]*left:0/s);
  assert.match(css, /\.calendar-daily-title-row>\.calendar-category-cell\{[^}]*position:sticky[^}]*left:0/s);
  assert.doesNotMatch(css, /\.calendar-daily-title-row>\.calendar-category-cell\{[^}]*position:relative/s);
});

test('timeline grid uses one integer day width for headers rows and guide lines', () => {
  assert.match(css, /--timeline-day-width:134px/);
  assert.match(css, /grid-template-columns:repeat\(var\(--timeline-days\),var\(--timeline-day-width\)\)/);
  assert.match(css, /background-image:repeating-linear-gradient\([^}]*var\(--timeline-day-width\)/s);
  assert.doesNotMatch(css, /--timeline-day-width:\d+\.\d+px/);
});

test('embedded calendar is labelled as a preview and can escape to the complete page', () => {
  assert.match(html, /id="calendarPreviewBanner"/);
  assert.match(html, /当前为活动日历预览/);
  assert.match(html, /id="calendarOpenFull"/);
  assert.match(js, /window\.top\.location\.href/);
  assert.match(js, /window\.location\.href/);
});

test('calendar explains the desktop-viewport mobile view without view-mode buttons', () => {
  assert.doesNotMatch(html, /id="calendarViewPortrait"/);
  assert.doesNotMatch(html, /id="calendarViewLandscape"/);
  assert.match(html, /手机版使用电脑版完整视口显示，可双指缩放或左右滑动/);
  assert.doesNotMatch(js, /wjdr\.calendar\.viewMode/);
  assert.doesNotMatch(js, /requestFullscreen/);
});

test('calendar removes the late-injected floating theme button', () => {
  assert.match(js, /MutationObserver/);
  assert.match(js, /themeToggleBtn/);
  assert.match(js, /\.remove\(\)/);
});

test('mobile calendar uses a virtual desktop viewport instead of element zoom', () => {
  const mobile =
    css.match(/@media\s*\(max-width:\s*760px\)\s*and\s*\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)\s*\{([\s\S]*)\}\s*$/)?.[1] || '';

  assert.ok(mobile);
  assert.match(mobile, /\.calendar-scroll\{[^}]*overflow:\s*auto/);
  assert.match(html, /is-mobile-desktop-viewport/);
  assert.match(html, /width=1680,viewport-fit=cover/);
  assert.match(html, /matchMedia\('\(hover:none\) and \(pointer:coarse\)'\)/);
  assert.match(css, /html\.is-mobile-desktop-viewport\{--category-width:59px\}/);
  assert.doesNotMatch(css, /#calendarGanttRoot\{[^}]*zoom:/);
  assert.doesNotMatch(mobile, /grid-template-columns:\s*var\(--category-width\)\s+repeat\(7,minmax\(0,1fr\)\)/);
});

test('mobile timeline uses native inertial horizontal scrolling', () => {
  assert.match(js, /event\.pointerType\s*===\s*["']touch["']/);
  assert.match(js, /classList\.contains\(["']is-mobile-desktop-viewport["']\)/);
  assert.match(css, /html\.is-mobile-desktop-viewport \.calendar-scroll:has\(\.calendar-continuous-timeline\)\{[^}]*overflow-x:scroll[^}]*touch-action:pan-x pan-y[^}]*-webkit-overflow-scrolling:touch/s);
  assert.match(css, /overscroll-behavior-x:contain/);
});
