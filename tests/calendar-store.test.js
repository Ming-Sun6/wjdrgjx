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
    assert.match(sql, /sort_order/i);
    assert.match(sql, /font_bold/i);
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

test('schedule reordering validates every id before applying all updates in one transaction', async () => {
  const updates = [];
  let transactions = 0;
  const definitions = [
    { id: 1, category_id: 1, category_code: 'regular', category_name: '常规', category_color: '#fff', category_sort_order: 10, category_enabled: 1, name: '活动 A', schedule_type: 'single', start_date: '2026-08-24', end_date: '2026-08-24', sort_order: 10, font_bold: 1, enabled: 1 },
    { id: 2, category_id: 1, category_code: 'regular', category_name: '常规', category_color: '#fff', category_sort_order: 10, category_enabled: 1, name: '活动 B', schedule_type: 'single', start_date: '2026-08-25', end_date: '2026-08-25', sort_order: 20, enabled: 1 }
  ];
  const adapter = {
    pgDatabase: false,
    queryRows: async (sql) => /FROM calendar_schedule_definitions/i.test(sql) ? definitions : [],
    execute: async (sql, params) => { updates.push({ sql: compact(sql), params }); return { affectedRows: 1 }; },
    runInTransaction: async (work) => { transactions += 1; return work(adapter); }
  };
  const store = storeModule.createCalendarStore(adapter);

  assert.deepEqual(await store.reorderDefinitions([{ id: 1, sortOrder: 20 }, { id: 999, sortOrder: 10 }]), { error: 'BAD_SCHEDULE_ORDER' });
  assert.equal(transactions, 0);
  assert.deepEqual(updates, []);

  const reordered = await store.reorderDefinitions([{ id: 1, sortOrder: 20 }, { id: 2, sortOrder: 10 }]);
  assert.equal(transactions, 1);
  assert.deepEqual(updates.map((entry) => entry.params), [[20, 1], [10, 2]]);
  assert.equal(reordered[0].sortOrder, 10);
  assert.equal(reordered[0].fontBold, true);
});

test('public definitions hide disabled categories while admin definitions retain them', async () => {
  const definitionQueries = [];
  const adapter = {
    pgDatabase: false,
    queryRows: async (sql) => {
      if (/FROM calendar_schedule_definitions/i.test(sql)) definitionQueries.push(compact(sql));
      return [];
    }
  };
  const store = storeModule.createCalendarStore(adapter);

  await store.listDefinitions(false);
  await store.listDefinitions(true);

  assert.match(definitionQueries[0], /WHERE d\.enabled = 1 AND c\.enabled = 1/);
  assert.doesNotMatch(definitionQueries[1], /WHERE d\.enabled/);
  assert.doesNotMatch(definitionQueries[1], /c\.enabled = 1/);
});

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
