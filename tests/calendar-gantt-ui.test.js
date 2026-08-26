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
  assert.match(js, /calendar-continuous-timeline/);
  assert.match(css, /calendar-continuous-timeline/);
  assert.match(css, /repeat\(var\(--timeline-days\),var\(--timeline-day-width\)\)/);
  assert.match(css, /--timeline-day-width:88px/);
  assert.doesNotMatch(js, /calendar-timeline-track/);
  assert.match(js, /pointerdown/);
  assert.match(js, /scrollLeft\s*=\s*timelinePan\.scrollLeft\s*-\s*delta/);
  assert.match(css, /touch-action:pan-y/);
});

test('timeline preserves the daily checklist title before its daily cards', () => {
  assert.match(js, /timelineDailyTitle:\s*true/);
  assert.match(js, /return[ \t]*\[title\]\.concat\(cards\)/);
  assert.match(js, /calendar-timeline-daily-title/);
});

test('calendar renders the persisted bold schedule style', () => {
  assert.match(js, /item\.fontBold\s*\?\s*["']900["']/);
  assert.match(js, /card\.fontBold\s*\?\s*["']900["']/);
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

test('embedded calendar is labelled as a preview and can escape to the complete page', () => {
  assert.match(html, /id="calendarPreviewBanner"/);
  assert.match(html, /当前为活动日历预览/);
  assert.match(html, /id="calendarOpenFull"/);
  assert.match(js, /window\.top\.location\.href/);
  assert.match(js, /window\.location\.href/);
});

test('calendar uses a simple device rotation hint without view-mode buttons', () => {
  assert.doesNotMatch(html, /id="calendarViewPortrait"/);
  assert.doesNotMatch(html, /id="calendarViewLandscape"/);
  assert.match(html, /关闭手机竖屏锁定，可横屏观看日历（非微信环境）/);
  assert.doesNotMatch(js, /wjdr\.calendar\.viewMode/);
  assert.doesNotMatch(js, /requestFullscreen/);
});

test('calendar removes the late-injected floating theme button', () => {
  assert.match(js, /MutationObserver/);
  assert.match(js, /themeToggleBtn/);
  assert.match(js, /\.remove\(\)/);
});

test('calendar stylesheet has no viewport-specific mobile rules', () => {
  assert.doesNotMatch(css, /@media[^{]*\(\s*max-width\s*:\s*760px\s*\)/);
});
