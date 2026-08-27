const test = require('node:test');
const assert = require('node:assert/strict');

const domain = require('../calendar-domain');

test('UTC date helpers and ISO week remain stable across year boundaries', () => {
  assert.equal(domain.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(domain.startOfIsoWeek('2027-01-01'), '2026-12-28');
  assert.deepEqual(domain.getIsoWeek('2027-01-01'), { weekYear: 2026, week: 53 });
  assert.equal(domain.inclusiveDays('2026-08-24', '2026-08-30'), 7);
  assert.throws(() => domain.parseDate('2026-02-30'), /BAD_DATE/);
});

test('calendar navigation covers one year before and after today', () => {
  assert.deepEqual(domain.getNavigationBounds('2026-08-25'), {
    earliestMonth: '2025-08',
    latestMonth: '2027-08',
    earliestDate: '2025-08-25',
    latestDate: '2027-08-25'
  });
});

test('automatic activity colors are stable by name and custom colors still win', () => {
  const first = domain.activityColor('雪原贸易');
  assert.match(first, /^#[0-9a-f]{6}$/);
  assert.equal(domain.activityColor(' 雪原贸易 '), first);
  assert.notEqual(domain.activityColor('联盟总动员'), first);

  const expanded = domain.expandDefinitions([
    { id: 1, category: { color: '#ffffff' }, name: '雪原贸易', fontBold: true, scheduleType: 'single', startDate: '2026-08-24', endDate: '2026-08-24', enabled: true },
    { id: 2, category: { color: '#ffffff' }, name: '雪原贸易', scheduleType: 'single', startDate: '2026-08-25', endDate: '2026-08-25', enabled: true },
    { id: 3, category: { color: '#ffffff' }, name: '联盟总动员', scheduleType: 'single', startDate: '2026-08-26', endDate: '2026-08-26', enabled: true },
    { id: 4, category: { color: '#ffffff' }, name: '手动颜色', color: '#123456', scheduleType: 'single', startDate: '2026-08-27', endDate: '2026-08-27', enabled: true }
  ], { from: '2026-08-24', to: '2026-08-30' });
  assert.equal(expanded.schedules[0].color, expanded.schedules[1].color);
  assert.equal(expanded.schedules[0].fontBold, true);
  assert.notEqual(expanded.schedules[1].color, expanded.schedules[2].color);
  assert.equal(expanded.schedules[3].color, '#123456');
});

test('recurrence exceptions support one occurrence and current-and-future overrides', () => {
  const definition = {
    id: 88, categoryId: 1, name: '循环活动', scheduleType: 'recurring', startDate: '2026-08-24', endDate: '2026-08-24', enabled: true,
    recurrenceUnit: 'week', recurrenceInterval: 1, weekdays: [1], recurrenceEndType: 'never',
    exceptions: [
      { occurrenceDate: '2026-08-31', scope: 'single', name: '仅本次', color: '#123456', fontBold: true, enabled: true },
      { occurrenceDate: '2026-09-07', scope: 'future', name: '以后改名', color: null, fontBold: false, enabled: true }
    ]
  };
  const schedules = domain.expandDefinitions([definition], { from: '2026-08-24', to: '2026-09-14' }).schedules;
  assert.deepEqual(schedules.map((item) => item.name), ['循环活动', '仅本次', '以后改名', '以后改名']);
  assert.equal(schedules[1].color, '#123456');
  assert.equal(schedules[1].fontBold, true);
  assert.equal(schedules[2].color, domain.activityColor('以后改名'));
});

test('never-ending recurrence expands backward and forward around its anchor', () => {
  const result = domain.expandDefinitions([{
    id: 99, categoryId: 1, name: '双向循环', scheduleType: 'recurring',
    startDate: '2026-08-26', endDate: '2026-08-26', enabled: true,
    recurrenceUnit: 'week', recurrenceInterval: 1, weekdays: [3], recurrenceEndType: 'never'
  }], { from: '2026-08-12', to: '2026-09-09' });
  assert.deepEqual(result.schedules.map((item) => item.startDate), ['2026-08-12', '2026-08-19', '2026-08-26', '2026-09-02', '2026-09-09']);
});

test('normalizes recurring and composite schedule payloads', () => {
  const recurring = domain.normalizeSchedulePayload({
    categoryId: 2,
    name: '联盟总动员',
    scheduleType: 'recurring',
    startDate: '2026-08-24',
    endDate: '2026-08-26',
    recurrenceUnit: 'week',
    recurrenceInterval: 2,
    weekdays: [1, 3],
    recurrenceEndType: 'count',
    recurrenceCount: 4
  });
  assert.equal(recurring.error, undefined);
  assert.deepEqual(recurring.value.weekdays, [1, 3]);

  const invalid = domain.normalizeSchedulePayload({
    categoryId: 1,
    name: '组合活动',
    scheduleType: 'composite',
    compositeLayout: 'daily-list',
    childColorMode: 'custom',
    startDate: '2026-08-24',
    endDate: '2026-08-26',
    items: [{ name: '任务', enabled: true, dateMode: 'selected-days', selectedOffsets: [0, 4] }]
  });
  assert.equal(invalid.error, 'BAD_ITEM_OFFSET');
});

test('normalizes multi-day recurrence independently from schedule structure', () => {
  const result = domain.normalizeSchedulePayload({
    categoryId: 1,
    name: '雪原贸易',
    scheduleType: 'continuous',
    startDate: '2026-08-24',
    endDate: '2026-08-26',
    recurrenceUnit: 'week',
    recurrenceInterval: 1,
    weekdays: [1],
    recurrenceEndType: 'count',
    recurrenceCount: 2
  });
  assert.equal(result.error, undefined);
  assert.equal(result.value.recurrence.unit, 'week');
  const expanded = domain.expandDefinitions([{ id: 41, enabled: true, ...result.value }], {
    from: '2026-08-24', to: '2026-09-06'
  });
  assert.deepEqual(expanded.schedules.map(({ startDate, endDate }) => ({ startDate, endDate })), [
    { startDate: '2026-08-24', endDate: '2026-08-26' },
    { startDate: '2026-08-31', endDate: '2026-09-02' }
  ]);
});

test('date-list schedules retain non-contiguous legacy dates', () => {
  const result = domain.normalizeSchedulePayload({
    categoryId: 1,
    name: '分段活动',
    scheduleType: 'date-list',
    startDate: '2026-08-24',
    endDate: '2026-08-29',
    legacyDates: ['2026-08-29', '2026-08-24', '2026-08-25', '2026-08-29']
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.value.legacyDates, ['2026-08-24', '2026-08-25', '2026-08-29']);
  const expanded = domain.expandDefinitions([{ id: 42, enabled: true, ...result.value }], {
    from: '2026-08-24', to: '2026-08-30'
  });
  assert.deepEqual(expanded.schedules.map((item) => [item.startDate, item.endDate]), [
    ['2026-08-24', '2026-08-25'],
    ['2026-08-29', '2026-08-29']
  ]);
});

test('rejects invalid duration, descriptions, time ranges, and recurrence limits', () => {
  const base = { categoryId: 1, name: '活动', scheduleType: 'continuous', startDate: '2026-08-24', endDate: '2026-08-24' };
  assert.equal(domain.normalizeSchedulePayload({ ...base, endDate: '2027-08-25' }).error, 'BAD_DURATION');
  assert.equal(domain.normalizeSchedulePayload({ ...base, description: 'x'.repeat(2001) }).error, 'BAD_DESCRIPTION');
  assert.equal(domain.normalizeSchedulePayload({ ...base, startTime: '22:00', endTime: '08:00' }).error, 'BAD_TIME');
  assert.equal(domain.normalizeSchedulePayload({ ...base, recurrenceUnit: 'day', recurrenceInterval: 366, recurrenceEndType: 'never' }).error, 'BAD_RECURRENCE');
});

test('expands weekly recurrence with stable occurrence ids', () => {
  const result = domain.expandDefinitions([{
    id: 12,
    originalId: 'legacy-12',
    category: { id: 1, code: 'regular', name: '常规', color: '#f3c98b', sortOrder: 1 },
    name: '雪原贸易',
    scheduleType: 'recurring',
    startDate: '2026-08-24',
    endDate: '2026-08-24',
    recurrenceUnit: 'week',
    recurrenceInterval: 1,
    weekdays: [1, 3],
    recurrenceEndType: 'count',
    recurrenceCount: 4,
    enabled: true
  }], { from: '2026-08-24', to: '2026-09-06' });

  assert.deepEqual(result.schedules.map((item) => item.id), [
    '12:2026-08-24',
    '12:2026-08-26',
    '12:2026-08-31',
    '12:2026-09-02'
  ]);
});

test('daily checklist expands multi-day children into separate stable cards', () => {
  const result = domain.expandDefinitions([{
    id: 20,
    category: { id: 5, code: 'limited', name: '限定活动', color: '#e8a6a6', sortOrder: 5 },
    name: '冻土之王',
    scheduleType: 'composite',
    compositeLayout: 'daily-list',
    childColorMode: 'custom',
    startDate: '2026-08-24',
    endDate: '2026-08-30',
    enabled: true,
    items: [{
      id: 201,
      name: '领主宝石',
      enabled: true,
      highlighted: true,
      sortOrder: 1,
      dateMode: 'relative-range',
      startOffsetDays: 0,
      endOffsetDays: 2
    }, {
      id: 202,
      name: '秘银',
      color: '#123456',
      enabled: true,
      sortOrder: 2,
      dateMode: 'relative-range',
      startOffsetDays: 1,
      endOffsetDays: 1
    }]
  }], { from: '2026-08-25', to: '2026-08-26' });

  assert.equal(result.schedules.length, 1);
  assert.equal(result.schedules[0].firstCardDate, '2026-08-24');
  assert.equal(result.schedules[0].lastCardDate, '2026-08-26');
  assert.deepEqual(result.schedules[0].cards.map((card) => card.id), [
    '20:2026-08-24:item:201:2026-08-24:day:2026-08-25',
    '20:2026-08-24:item:202:2026-08-25:day:2026-08-25',
    '20:2026-08-24:item:201:2026-08-24:day:2026-08-26'
  ]);
  assert.equal(result.schedules[0].cards[0].color, domain.activityColor('领主宝石'));
  assert.equal(result.schedules[0].cards[1].color, '#123456');
  assert.notEqual(result.schedules[0].cards[0].color, result.schedules[0].color);
  assert.equal(result.schedules[0].cards[0].highlighted, true);
});

test('composite child color modes support uniform, stable random, and custom colors', () => {
  const definition = {
    id: 21,
    category: { id: 1, color: '#ffffff', sortOrder: 1 },
    name: '主活动',
    color: '#224466',
    scheduleType: 'composite',
    compositeLayout: 'gantt',
    startDate: '2026-08-24',
    endDate: '2026-08-24',
    enabled: true,
    items: [
      { id: 211, name: '阶段甲', color: '#abcdef', enabled: true, sortOrder: 1, dateMode: 'all-span' },
      { id: 212, name: '阶段乙', enabled: true, sortOrder: 2, dateMode: 'all-span' }
    ]
  };
  const colors = (mode) => domain.expandDefinitions([{ ...definition, childColorMode: mode }], { from: '2026-08-24', to: '2026-08-24' }).schedules[0].items.map((item) => item.color);

  assert.deepEqual(colors('uniform'), ['#224466', '#224466']);
  assert.deepEqual(colors('random'), [domain.activityColor('阶段甲'), domain.activityColor('阶段乙')]);
  assert.deepEqual(colors('custom'), ['#abcdef', domain.activityColor('阶段乙')]);
  assert.equal(domain.normalizeSchedulePayload({ ...definition, categoryId: 1, childColorMode: 'invalid' }).error, 'BAD_CHILD_COLOR_MODE');
});

test('render unit limit fails atomically', () => {
  assert.throws(() => domain.expandDefinitions([{
    id: 30,
    category: { id: 1, code: 'regular', name: '常规', color: '#eee', sortOrder: 1 },
    name: '长活动',
    scheduleType: 'composite',
    compositeLayout: 'daily-list',
    startDate: '2026-08-01',
    endDate: '2026-08-10',
    enabled: true,
    items: [{ id: 301, name: '每日任务', enabled: true, sortOrder: 1, dateMode: 'all-span' }]
  }], { from: '2026-08-01', to: '2026-08-10', maxUnits: 5 }), (error) => error && error.code === 'EXPANSION_LIMIT');
});
