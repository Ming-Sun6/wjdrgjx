const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../history-immigration-config');

test('history immigration config generates dates and normalizes rules', () => {
  assert.deepEqual(config.generateHistoryImmigrationDates('2026-08-17', 3, 28), ['2026-08-17', '2026-09-14', '2026-10-12']);
  const result = config.normalizeHistoryImmigrationConfig({ dates: [{ date: '2026-09-01' }, { date: '2026-08-01' }, { date: '2026-09-01' }], rules: { displayOffsetDays: 2 } });
  assert.deepEqual(result.dates.map((item) => item.date), ['2026-08-01', '2026-09-01']);
  assert.equal(result.rules.displayOffsetDays, 2);
});

test('history immigration config preserves only valid range overrides', () => {
  const result = config.normalizeHistoryImmigrationConfig({ dates: [{ date: '2026-08-17', overrides: { '1~13': 'group-2', bad: 'group-3', '14~73': 'nope' } }] }, ['1~13', '14~73']);
  assert.deepEqual(result.dates[0].overrides, { '1~13': 'group-2' });
});
