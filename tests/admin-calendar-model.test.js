const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../public/function/admin-calendar-model.js');

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
    monthDay: 24,
    recurrenceEndType: 'until',
    recurrenceUntil: '2027-01-31',
    recurrenceCount: 12
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
    monthDay: 1,
    recurrenceEndType: 'count',
    recurrenceUntil: null,
    recurrenceCount: 6,
    compositeLayout: 'gantt',
    items: [
      { id: 101, name: '全程', description: '', color: null, sortOrder: 0, highlighted: false, enabled: true, dateMode: 'all-span', startTime: '', endTime: '' },
      { id: 102, name: '阶段', description: '连续', color: '#d89974', sortOrder: 10, highlighted: true, enabled: true, dateMode: 'relative-range', startOffsetDays: 1, endOffsetDays: 3, startTime: '09:00', endTime: '18:00' },
      { id: 103, name: '指定日', description: '', color: null, sortOrder: 20, highlighted: false, enabled: false, dateMode: 'selected-days', selectedOffsets: [0, 2, 5], startTime: '', endTime: '' },
      { id: 104, name: '子循环', description: '每两天', color: '#6f9183', sortOrder: 30, highlighted: true, enabled: true, dateMode: 'recurring', durationDays: 2, recurrenceUnit: 'day', recurrenceInterval: 2, weekdays: [1, 4], monthDay: 1, recurrenceEndType: 'until', recurrenceUntilOffset: 6, recurrenceCount: 3, startTime: '10:00', endTime: '12:00' }
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
