const test = require('node:test');
const assert = require('node:assert/strict');

const navigation = require('../home-navigation');

test('home navigation has a fixed ordered five-item catalog', () => {
  assert.deepEqual(navigation.HOME_NAVIGATION_CATALOG.map(({ id, name }) => [id, name]), [
    ['all', '全部'], ['tools', '工具'], ['forum', '交流论坛'], ['calendar', '活动日历'], ['my', '我的信息']
  ]);
});

test('normalization requires the complete catalog and at least one visible item', () => {
  const complete = { items: navigation.HOME_NAVIGATION_CATALOG.map((item) => ({ id: item.id, visible: item.id !== 'forum' })) };
  assert.equal(navigation.normalizeHomeNavigation(complete).error, undefined);
  assert.deepEqual(navigation.normalizeHomeNavigation({ items: [] }), { error: 'BAD_HOME_NAVIGATION' });
  assert.deepEqual(navigation.normalizeHomeNavigation({ items: complete.items.map((item) => ({ ...item, visible: false })) }), { error: 'HOME_NAVIGATION_EMPTY' });
  const withAdminOnly = {
    items: navigation.HOME_NAVIGATION_CATALOG.map((item) => ({ id: item.id, visible: true, adminOnly: item.id === 'forum' }))
  };
  const normalized = navigation.normalizeHomeNavigation(withAdminOnly);
  assert.equal(normalized.error, undefined);
  assert.equal(normalized.items.find((item) => item.id === 'forum').adminOnly, true);
  assert.ok(normalized.items.filter((item) => item.id !== 'forum').every((item) => item.adminOnly === false));
  assert.deepEqual(
    navigation.normalizeHomeNavigation({
      items: navigation.HOME_NAVIGATION_CATALOG.map((item) => ({ id: item.id, visible: true, adminOnly: true }))
    }),
    { error: 'HOME_NAVIGATION_EMPTY' }
  );
});

test('public handler falls back to all visible when settings read fails', async () => {
  const handlers = navigation.createHomeNavigationHandlers({
    getSetting: async () => { throw new Error('offline'); },
    logError: () => {}
  });
  const response = createResponse();
  await handlers.getPublic({}, response);
  assert.ok(response.body.items.every((item) => item.visible && item.adminOnly === false));
  assert.deepEqual(Object.keys(response.body.items[0]), ['id', 'visible', 'adminOnly']);
});

test('admin save persists normalized settings and audit metadata', async () => {
  const writes = [];
  const audits = [];
  const admin = { id: 7, username: '管理员' };
  const handlers = navigation.createHomeNavigationHandlers({
    getSetting: async () => null,
    setSetting: async (key, value) => writes.push({ key, value }),
    requireAdmin: async () => admin,
    auditAdminAction: async (_req, details) => audits.push(details),
    now: () => '2026-08-25T00:00:00.000Z'
  });
  const response = createResponse();
  await handlers.saveAdmin({ body: { items: navigation.HOME_NAVIGATION_CATALOG.map((item) => ({ id: item.id, visible: item.id !== 'my' })) } }, response);
  assert.equal(writes[0].key, 'home_navigation');
  assert.equal(writes[0].value.updatedBy, '管理员');
  assert.equal(audits[0].action, 'home_navigation.update');
  assert.equal(response.body.items.find((item) => item.id === 'my').visible, false);
  assert.ok(response.body.items.every((item) => item.adminOnly === false));
});

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}
