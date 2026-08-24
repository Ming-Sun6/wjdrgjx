const test = require('node:test');
const assert = require('node:assert/strict');

const { createCalendarHandlers } = require('../calendar-routes');

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
  assert.equal(response.body.schedules[0].color, '#f1c995');
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

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}
