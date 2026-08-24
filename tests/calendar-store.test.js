const test = require('node:test');
const assert = require('node:assert/strict');

const storeModule = require('../calendar-store');

test('calendar schema exposes canonical tables for both database dialects', () => {
  for (const sql of [storeModule.CALENDAR_DDL_MYSQL.join('\n'), storeModule.CALENDAR_DDL_PG.join('\n')]) {
    assert.match(sql, /calendar_categories/i);
    assert.match(sql, /calendar_schedule_definitions/i);
    assert.match(sql, /calendar_schedule_items/i);
    assert.match(sql, /legacy_original_id/i);
    assert.match(sql, /category_id/i);
    assert.match(sql, /schedule_id/i);
  }
  assert.deepEqual(storeModule.PRESET_CATEGORIES.map((item) => item.code), [
    'regular', 'kingdom', 'leaderboard', 'cross-server', 'limited'
  ]);
});

test('custom category codes are immutable lowercase ULID identifiers', () => {
  const code = storeModule.createCustomCategoryCode(() => 0);
  assert.match(code, /^custom-[0-9a-z]{26}$/);
  assert.equal(code.length, 33);
});

test('schema initialization creates tables, seeds categories, then migrates legacy rows', async () => {
  const calls = [];
  const adapter = {
    pgDatabase: false,
    execute: async (sql, params) => { calls.push({ type: 'execute', sql: compact(sql), params }); return { insertId: calls.length, affectedRows: 1 }; },
    queryRows: async (sql) => {
      calls.push({ type: 'queryRows', sql: compact(sql) });
      if (/FROM calendar_schedules/i.test(sql)) return [
        { original_id: 'old-1', name: '旧活动', date: '2026-08-24', color: '#ffffff' },
        { original_id: 'old-1', name: '旧活动', date: '2026-08-25', color: '#ffffff' }
      ];
      return [];
    },
    queryOne: async (sql, params) => {
      calls.push({ type: 'queryOne', sql: compact(sql), params });
      if (/FROM calendar_categories/i.test(sql) && params && params[0] === 'regular') return { id: 1, code: 'regular' };
      if (/legacy_original_id/i.test(sql)) return null;
      return null;
    },
    runInTransaction: async (work) => work(adapter)
  };

  await storeModule.ensureCalendarSchema(adapter);

  const firstCanonical = calls.findIndex((call) => /calendar_categories/.test(call.sql));
  const firstSeed = calls.findIndex((call) => /INSERT(?: IGNORE)? INTO calendar_categories/.test(call.sql));
  const firstMigration = calls.findIndex((call) => /INSERT INTO calendar_schedule_definitions/.test(call.sql) && call.params && call.params.includes('old-1'));
  assert.ok(firstCanonical >= 0);
  assert.ok(firstSeed > firstCanonical);
  assert.ok(firstMigration > firstSeed);
});

test('legacy date groups map to single, continuous, and date-list definitions', () => {
  assert.equal(storeModule.mapLegacyGroup([{ date: '2026-08-24' }]).scheduleType, 'single');
  assert.equal(storeModule.mapLegacyGroup([{ date: '2026-08-24' }, { date: '2026-08-25' }]).scheduleType, 'continuous');
  const gaps = storeModule.mapLegacyGroup([{ date: '2026-08-24' }, { date: '2026-08-26' }]);
  assert.equal(gaps.scheduleType, 'date-list');
  assert.deepEqual(gaps.legacyDates, ['2026-08-24', '2026-08-26']);
});

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
