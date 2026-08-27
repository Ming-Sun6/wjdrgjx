const test = require('node:test');
const assert = require('node:assert/strict');

const { createCalendarHandlers, mountCalendarRoutes } = require('../calendar-routes');

test('public calendar range returns canonical occurrences and dynamic colors', async () => {
  const handlers = createCalendarHandlers({
    store: {
      listDefinitions: async () => [{
        id: 1,
        category: { id: 1, code: 'regular', name: '常规', color: '#f1c995', sortOrder: 1 },
        name: '雪原贸易', scheduleType: 'continuous', startDate: '2026-08-24', endDate: '2026-08-26', enabled: true
      }]
    },
    now: () => new Date(Date.UTC(2026, 7, 25))
  });
  const response = createResponse();
  await handlers.getPublic({ query: { from: '2026-08-24', to: '2026-08-30' } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.schedules[0].id, '1:2026-08-24');
  assert.equal(response.body.schedules[0].color, require('../calendar-domain').activityColor('雪原贸易'));
});

test('legacy no-range response uses exact 366-day compatibility window', async () => {
  const handlers = createCalendarHandlers({
    store: { listDefinitions: async () => [] },
    now: () => new Date(Date.UTC(2026, 7, 25))
  });
  const response = createResponse();
  await handlers.getPublic({ query: {} }, response);
  assert.equal(response.body.from, '2026-07-25');
  assert.equal(response.body.to, '2027-07-25');
  assert.equal(response.body.rangeDefaulted, true);
  assert.deepEqual(response.body.schedules, []);
});

test('public calendar rejects incomplete or oversized ranges', async () => {
  const handlers = createCalendarHandlers({ store: { listDefinitions: async () => [] } });
  const incomplete = createResponse();
  await handlers.getPublic({ query: { from: '2026-08-24' } }, incomplete);
  assert.deepEqual(incomplete.body, { error: 'BAD_RANGE' });
  const oversized = createResponse();
  await handlers.getPublic({ query: { from: '2025-01-01', to: '2026-12-31' } }, oversized);
  assert.deepEqual(oversized.body, { error: 'RANGE_TOO_LARGE' });
});

test('legacy writes require admin and default category to regular', async () => {
  const calls = [];
  const admin = { id: 7, username: '管理员' };
  const handlers = createCalendarHandlers({
    store: {
      getCategoryByCode: async (code) => ({ id: 1, code }),
      createDefinition: async (value) => { calls.push(value); return { id: 8, legacyOriginalId: 'cal-test' }; }
    },
    requireAdmin: async () => admin,
    auditAdminAction: async (_req, details) => calls.push(details)
  });
  const response = createResponse();
  await handlers.legacyCreate({ body: { name: '旧调用', dates: ['2026-08-25', '2026-08-24'] } }, response);
  assert.equal(response.statusCode, 201);
  assert.equal(calls[0].categoryId, 1);
  assert.equal(calls[0].scheduleType, 'continuous');
  assert.equal(calls[1].action, 'calendar.create');
});

test('expansion limit returns 422 without a partial payload', async () => {
  const handlers = createCalendarHandlers({
    store: { listDefinitions: async () => [{
      id: 9,
      category: { id: 1, code: 'regular', name: '常规', color: '#fff', sortOrder: 1 },
      name: '清单', scheduleType: 'composite', compositeLayout: 'daily-list', startDate: '2026-08-01', endDate: '2026-08-10', enabled: true,
      items: [{ id: 91, name: '任务', enabled: true, dateMode: 'all-span' }]
    }] },
    maxRenderUnits: 2
  });
  const response = createResponse();
  await handlers.getPublic({ query: { from: '2026-08-01', to: '2026-08-10' } }, response);
  assert.equal(response.statusCode, 422);
  assert.deepEqual(response.body, { error: 'EXPANSION_LIMIT' });
});

test('calendar preset handlers require admin and expose create/list/delete', async () => {
  const calls = [];
  const handlers = createCalendarHandlers({
    store: { getCategoryById: async () => ({ id: 1, enabled: true }) },
    requireAdmin: async () => ({ id: 7 }),
    presetService: {
      list: async () => [{ id: 'preset_a' }],
      create: async (name, payload) => { calls.push([name, payload]); return { id: 'preset_b', name, payload }; },
      remove: async (id) => calls.push(id)
    }
  });
  const listed = createResponse();
  await handlers.getPresets({}, listed);
  assert.equal(listed.body.presets[0].id, 'preset_a');
  const created = createResponse();
  await handlers.createPreset({ body: { name: '模板', payload: { categoryId: 1, name: '活动', scheduleType: 'single', startDate: '2026-08-25' } } }, created);
  assert.equal(created.statusCode, 201);
  const removed = createResponse();
  await handlers.deletePreset({ params: { id: 'preset_b' } }, removed);
  assert.deepEqual(removed.body, { ok: true });
  assert.equal(calls[1], 'preset_b');
});

test('schedule reorder endpoint requires admin, saves the complete order, and audits it', async () => {
  const calls = [];
  const items = [{ id: 3, sortOrder: 10 }, { id: 2, sortOrder: 20 }];
  const handlers = createCalendarHandlers({
    store: { reorderDefinitions: async (value) => { calls.push(value); return [{ id: 3 }, { id: 2 }]; } },
    requireAdmin: async () => ({ id: 7 }),
    auditAdminAction: async (_req, details) => calls.push(details)
  });
  const response = createResponse();
  await handlers.reorderSchedules({ body: { items } }, response);
  assert.deepEqual(calls[0], items);
  assert.equal(calls[1].action, 'calendar.reorder');
  assert.deepEqual(response.body.schedules.map((item) => item.id), [3, 2]);
});

test('admin preview expands recurring instances and quick edit saves the selected scope', async () => {
  const calls = [];
  const definition = { id: 5, categoryId: 1, name: '循环活动', scheduleType: 'recurring', startDate: '2026-08-24', endDate: '2026-08-24', enabled: true, recurrenceUnit: 'week', recurrenceInterval: 1, weekdays: [1], recurrenceEndType: 'never', items: [] };
  const handlers = createCalendarHandlers({
    store: {
      listDefinitions: async () => [definition],
      getDefinition: async () => definition,
      upsertOccurrenceException: async (...args) => { calls.push(args); return definition; }
    },
    requireAdmin: async () => ({ id: 7 }),
    auditAdminAction: async () => {}
  });
  const preview = createResponse();
  await handlers.getAdminPreview({ query: { from: '2026-08-24', to: '2026-09-07' } }, preview);
  assert.deepEqual(preview.body.schedules.map((item) => item.occurrenceDate), ['2026-08-24', '2026-08-31', '2026-09-07']);

  const edited = createResponse();
  await handlers.quickEditOccurrence({ params: { id: '5' }, body: { scope: 'single', occurrenceDate: '2026-08-31', name: '仅本次', color: '#123456', fontBold: true, enabled: true } }, edited);
  assert.deepEqual(calls[0], [5, '2026-08-31', 'single', { name: '仅本次', color: '#123456', fontBold: true, enabled: true }]);
  assert.equal(edited.body.scope, 'single');
});

test('editing the entire recurrence clears saved occurrence exceptions atomically', async () => {
  const calls = [];
  const definition = { id: 6, categoryId: 1, name: '循环活动', scheduleType: 'recurring', startDate: '2026-08-24', endDate: '2026-08-24', enabled: true, recurrenceUnit: 'week', recurrenceInterval: 1, weekdays: [1], recurrenceEndType: 'never', items: [], exceptions: [{ scope: 'single', occurrenceDate: '2026-08-31' }] };
  const handlers = createCalendarHandlers({
    store: {
      getDefinition: async () => definition,
      replaceDefinition: async (_id, value, meta) => { calls.push({ value, meta }); return { ...definition, ...value }; }
    },
    requireAdmin: async () => ({ id: 7 }),
    auditAdminAction: async () => {}
  });
  const response = createResponse();
  await handlers.quickEditOccurrence({ params: { id: '6' }, body: { scope: 'all', occurrenceDate: '2026-08-31', name: '全部改名', color: null, fontBold: true, enabled: true } }, response);
  assert.equal(calls[0].meta.clearExceptions, true);
  assert.equal(calls[0].value.name, '全部改名');
});

test('category fixed POST routes are registered before the dynamic update route', () => {
  const routes = [];
  const app = {
    get(path) { routes.push(['GET', path]); },
    post(path) { routes.push(['POST', path]); },
    patch(path) { routes.push(['PATCH', path]); },
    delete(path) { routes.push(['DELETE', path]); }
  };
  mountCalendarRoutes(app, { store: {} });
  const dynamicIndex = routes.findIndex(([method, path]) => method === 'POST' && path === '/api/admin/calendar/categories/:id');
  const reorderIndex = routes.findIndex(([method, path]) => method === 'POST' && path === '/api/admin/calendar/categories/reorder');
  const statusIndex = routes.findIndex(([method, path]) => method === 'POST' && path === '/api/admin/calendar/categories/:id/status');
  assert.ok(reorderIndex >= 0 && reorderIndex < dynamicIndex);
  assert.ok(statusIndex >= 0 && statusIndex < dynamicIndex);
});

test('category status validates ids and persists the requested disabled state', async () => {
  const calls = [];
  const handlers = createCalendarHandlers({
    store: { setCategoryStatus: async (...args) => { calls.push(args); return { id: args[0], name: '常规', enabled: args[1] }; } },
    requireAdmin: async () => ({ id: 7 }),
    auditAdminAction: async () => {}
  });
  const invalid = createResponse();
  await handlers.setCategoryStatus({ params: { id: 'reorder' }, body: { enabled: false } }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.deepEqual(invalid.body, { error: 'BAD_CATEGORY' });
  assert.deepEqual(calls, []);

  const disabled = createResponse();
  await handlers.setCategoryStatus({ params: { id: '3' }, body: { enabled: false } }, disabled);
  assert.deepEqual(calls, [[3, false]]);
  assert.equal(disabled.body.category.enabled, false);
});

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}
