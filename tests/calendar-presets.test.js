const test = require('node:test');
const assert = require('node:assert/strict');

const { createCalendarPresetService } = require('../calendar-presets');

function createSettings(initial = []) {
  let value = initial;
  return {
    getSetting: async () => value,
    setSetting: async (_key, next) => { await new Promise((resolve) => setTimeout(resolve, 5)); value = next; },
    read: () => value
  };
}

test('preset service strips identities and lists newest first', async () => {
  const settings = createSettings();
  const service = createCalendarPresetService(settings);
  const first = await service.create('雪原模板', { id: 9, createdBy: 7, name: '雪原', scheduleType: 'continuous', startDate: '2026-08-24', endDate: '2026-08-26', items: [{ id: 91, name: '阶段' }] });
  const second = await service.create('乔伊模板', { name: '乔伊', scheduleType: 'single', startDate: '2026-08-25', endDate: '2026-08-25' });
  assert.match(first.id, /^preset_[0-9a-f]{32}$/);
  assert.equal(first.payload.id, undefined);
  assert.equal(first.payload.items[0].id, undefined);
  assert.deepEqual((await service.list()).map((item) => item.id), [second.id, first.id]);
});

test('preset writes are serialized and reject duplicate names', async () => {
  const settings = createSettings();
  const service = createCalendarPresetService(settings);
  await Promise.all([
    service.create('模板甲', { name: '甲', scheduleType: 'single', startDate: '2026-08-24', endDate: '2026-08-24' }),
    service.create('模板乙', { name: '乙', scheduleType: 'single', startDate: '2026-08-25', endDate: '2026-08-25' })
  ]);
  assert.equal(settings.read().length, 2);
  await assert.rejects(() => service.create('模板甲', {}), (error) => error.code === 'PRESET_NAME_EXISTS');
});

test('applying a preset shifts its dates to today while preserving shape', () => {
  const service = createCalendarPresetService(createSettings());
  const continuous = service.apply({ payload: { scheduleType: 'continuous', startDate: '2026-01-10', endDate: '2026-01-12' } }, '2026-08-25');
  assert.equal(continuous.startDate, '2026-08-25');
  assert.equal(continuous.endDate, '2026-08-27');
  const list = service.apply({ payload: { scheduleType: 'date-list', legacyDates: ['2026-01-10', '2026-01-12'] } }, '2026-08-25');
  assert.deepEqual(list.legacyDates, ['2026-08-25', '2026-08-27']);
});
