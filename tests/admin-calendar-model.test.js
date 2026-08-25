const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../public/function/admin-calendar-model.js');
const domain = require('../calendar-domain.js');

function withoutName(value) {
  const copy = JSON.parse(JSON.stringify(value));
  delete copy.name;
  return copy;
}

test('recurring schedule survives editor round-trip when only its name changes', () => {
  const schedule = {
    id: 17,
    categoryId: 3,
    name: '联盟总动员',
    scheduleType: 'recurring',
    startDate: '2026-08-24',
    endDate: '2026-08-26',
    startTime: '08:00',
    endTime: '23:00',
    color: '#d89974',
    description: '三天循环活动',
    enabled: true,
    recurrenceUnit: 'week',
    recurrenceInterval: 2,
    weekdays: [1, 3, 5],
    monthDay: null,
    recurrenceEndType: 'until',
    recurrenceUntil: '2027-01-31',
    recurrenceCount: null
  };

  const editor = model.scheduleToEditor(schedule);
  editor.name = '联盟总动员（新）';
  const payload = model.editorToPayload(editor);

  assert.equal(payload.name, '联盟总动员（新）');
  assert.deepEqual(withoutName(payload), withoutName({ ...schedule, id: undefined }));
});

test('date lists accept mixed separators, remove duplicates, and retain gaps', () => {
  assert.deepEqual(
    model.parseDateList('2026-08-27，2026-08-25\n2026-08-27, 2026-08-30'),
    ['2026-08-25', '2026-08-27', '2026-08-30']
  );

  const editor = model.scheduleToEditor({
    categoryId: 2,
    name: '分散小榜',
    scheduleType: 'date-list',
    startDate: '2026-08-25',
    endDate: '2026-08-30',
    legacyDates: ['2026-08-25', '2026-08-27', '2026-08-30'],
    startTime: '',
    endTime: '',
    color: null,
    description: '',
    enabled: false
  });

  assert.deepEqual(model.editorToPayload(editor).legacyDates, ['2026-08-25', '2026-08-27', '2026-08-30']);
});

test('date lists reject impossible calendar dates', () => {
  assert.deepEqual(
    model.parseDateList('2026-02-29,2026-02-28,2024-02-29,2026-13-01,2026-04-31'),
    ['2024-02-29', '2026-02-28']
  );
});

test('recurrence payload only includes fields valid for its unit and end type', () => {
  const base = { categoryId: 1, name: '循环', structure: 'normal', dateMode: 'range', startDate: '2026-08-26', durationDays: 1, enabled: true, repeat: true, recurrenceInterval: 1 };
  const daily = model.editorToPayload({ ...base, recurrenceUnit: 'day', weekdays: [1], monthDay: 26, recurrenceEndType: 'never', recurrenceUntil: '2027-01-01', recurrenceCount: 9 });
  assert.deepEqual({ weekdays: daily.weekdays, monthDay: daily.monthDay, until: daily.recurrenceUntil, count: daily.recurrenceCount }, { weekdays: [], monthDay: null, until: null, count: null });
  const weekly = model.editorToPayload({ ...base, recurrenceUnit: 'week', weekdays: [1, 3], monthDay: 26, recurrenceEndType: 'until', recurrenceUntil: '2027-01-01', recurrenceCount: 9 });
  assert.deepEqual({ weekdays: weekly.weekdays, monthDay: weekly.monthDay, until: weekly.recurrenceUntil, count: weekly.recurrenceCount }, { weekdays: [1, 3], monthDay: null, until: '2027-01-01', count: null });
  const monthly = model.editorToPayload({ ...base, recurrenceUnit: 'month', weekdays: [1], monthDay: 26, recurrenceEndType: 'count', recurrenceUntil: '2027-01-01', recurrenceCount: 9 });
  assert.deepEqual({ weekdays: monthly.weekdays, monthDay: monthly.monthDay, until: monthly.recurrenceUntil, count: monthly.recurrenceCount }, { weekdays: [], monthDay: 26, until: null, count: 9 });
});

test('normalized editor recurrence payloads are accepted by the server domain', () => {
  const payload = model.editorToPayload({
    categoryId: 1,
    name: '跨服活动',
    structure: 'composite',
    startDate: '2026-09-01',
    durationDays: 14,
    enabled: true,
    repeat: true,
    recurrenceUnit: 'week',
    recurrenceInterval: 4,
    weekdays: [2],
    monthDay: 24,
    recurrenceEndType: 'until',
    recurrenceUntil: '2026-12-31',
    recurrenceCount: 12,
    compositeLayout: 'gantt',
    items: [{
      name: '阶段任务',
      enabled: true,
      dateMode: 'recurring',
      durationDays: 2,
      recurrenceUnit: 'day',
      recurrenceInterval: 2,
      weekdays: [1, 4],
      monthDay: 24,
      recurrenceEndType: 'until',
      recurrenceUntilOffset: 6,
      recurrenceCount: 3
    }]
  });

  const normalized = domain.normalizeSchedulePayload(payload);
  assert.equal(normalized.error, undefined);
  assert.equal(payload.items[0].recurrenceUntil, '2026-09-07');
  assert.equal(normalized.value.items[0].recurrence.untilOffset, 6);
  assert.deepEqual(normalized.value.items[0].recurrence.weekdays, []);
  assert.equal(normalized.value.items[0].recurrence.count, null);
});

test('server-normalized preset children retain nested recurrence when reapplied', () => {
  const normalized = domain.normalizeSchedulePayload({
    categoryId: 1,
    name: '组合预设',
    scheduleType: 'composite',
    startDate: '2026-09-01',
    endDate: '2026-09-14',
    enabled: true,
    items: [{
      name: '每周阶段',
      enabled: true,
      dateMode: 'recurring',
      durationDays: 2,
      recurrenceUnit: 'week',
      recurrenceInterval: 2,
      weekdays: [2, 4],
      recurrenceEndType: 'count',
      recurrenceCount: 3
    }]
  });
  assert.equal(normalized.error, undefined);

  const payload = model.editorToPayload(model.scheduleToEditor(normalized.value));
  assert.deepEqual({
    unit: payload.items[0].recurrenceUnit,
    interval: payload.items[0].recurrenceInterval,
    weekdays: payload.items[0].weekdays,
    endType: payload.items[0].recurrenceEndType,
    count: payload.items[0].recurrenceCount
  }, { unit: 'week', interval: 2, weekdays: [2, 4], endType: 'count', count: 3 });
});

test('server-normalized until child retains its recurrence deadline offset', () => {
  const normalized = domain.normalizeSchedulePayload({
    categoryId: 1,
    name: '截止预设',
    scheduleType: 'composite',
    startDate: '2026-09-01',
    endDate: '2026-09-14',
    enabled: true,
    items: [{
      name: '限时阶段',
      enabled: true,
      dateMode: 'recurring',
      durationDays: 1,
      recurrenceUnit: 'day',
      recurrenceInterval: 2,
      recurrenceEndType: 'until',
      recurrenceUntil: '2026-09-07',
      recurrenceUntilOffset: 6
    }]
  });
  assert.equal(normalized.error, undefined);

  const payload = model.editorToPayload(model.scheduleToEditor(normalized.value));
  assert.equal(payload.items[0].recurrenceUntilOffset, 6);
  assert.equal(payload.items[0].recurrenceUntil, '2026-09-07');
});

test('next composite sort order follows the greatest preserved order', () => {
  assert.equal(model.nextSortOrder([100, 200]), 210);
  assert.equal(model.nextSortOrder([0, 20, 10]), 30);
  assert.equal(model.nextSortOrder([]), 0);
});

test('composite schedule preserves all four child date modes and recurrence fields', () => {
  const schedule = {
    id: 22,
    categoryId: 5,
    name: '跨服组合活动',
    scheduleType: 'composite',
    startDate: '2026-09-01',
    endDate: '2026-09-07',
    startTime: '',
    endTime: '',
    color: null,
    description: '完整组合',
    enabled: true,
    recurrenceUnit: 'week',
    recurrenceInterval: 4,
    weekdays: [2],
    monthDay: null,
    recurrenceEndType: 'count',
    recurrenceUntil: null,
    recurrenceCount: 6,
    compositeLayout: 'gantt',
    items: [
      { id: 101, name: '全程', description: '', color: null, sortOrder: 0, highlighted: false, enabled: true, dateMode: 'all-span', startTime: '', endTime: '' },
      { id: 102, name: '阶段', description: '连续', color: '#d89974', sortOrder: 10, highlighted: true, enabled: true, dateMode: 'relative-range', startOffsetDays: 1, endOffsetDays: 3, startTime: '09:00', endTime: '18:00' },
      { id: 103, name: '指定日', description: '', color: null, sortOrder: 20, highlighted: false, enabled: false, dateMode: 'selected-days', selectedOffsets: [0, 2, 5], startTime: '', endTime: '' },
      { id: 104, name: '子循环', description: '每两天', color: '#6f9183', sortOrder: 30, highlighted: true, enabled: true, dateMode: 'recurring', durationDays: 2, recurrenceUnit: 'day', recurrenceInterval: 2, weekdays: [], monthDay: null, recurrenceEndType: 'until', recurrenceUntil: '2026-09-07', recurrenceUntilOffset: 6, recurrenceCount: null, startTime: '10:00', endTime: '12:00' }
    ]
  };

  const editor = model.scheduleToEditor(schedule);
  editor.name = '跨服组合活动（新）';
  const payload = model.editorToPayload(editor);

  assert.equal(payload.name, '跨服组合活动（新）');
  assert.deepEqual(payload.items, schedule.items);
  assert.deepEqual(
    withoutName(payload),
    withoutName({ ...schedule, id: undefined })
  );
});

test('preset shifting moves absolute dates but preserves recurrence and nested children', () => {
  const payload = {
    categoryId: 1,
    name: '雪原模板',
    scheduleType: 'composite',
    startDate: '2026-01-10',
    endDate: '2026-01-12',
    recurrenceUnit: 'week',
    recurrenceInterval: 2,
    recurrenceEndType: 'never',
    compositeLayout: 'daily-list',
    items: [{ name: '阶段', dateMode: 'selected-days', selectedOffsets: [0, 2], enabled: true }]
  };

  const shifted = model.shiftPresetToDate(payload, '2026-08-26');

  assert.equal(shifted.startDate, '2026-08-26');
  assert.equal(shifted.endDate, '2026-08-28');
  assert.deepEqual(shifted.items, payload.items);
  assert.equal(shifted.recurrenceInterval, 2);
  assert.deepEqual(payload, { ...payload, startDate: '2026-01-10', endDate: '2026-01-12' });
});

test('preset shifting moves an absolute recurrence deadline by the same delta', () => {
  const shifted = model.shiftPresetToDate({
    scheduleType: 'recurring',
    startDate: '2026-01-10',
    endDate: '2026-01-12',
    recurrenceEndType: 'until',
    recurrenceUntil: '2026-02-10'
  }, '2026-08-26');

  assert.equal(shifted.startDate, '2026-08-26');
  assert.equal(shifted.endDate, '2026-08-28');
  assert.equal(shifted.recurrenceUntil, '2026-09-26');
});
