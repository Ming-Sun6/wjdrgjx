const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.DOTENV_CONFIG_QUIET = 'true';

const root = path.join(__dirname, '..');
const serverPath = path.join(root, 'server.js');
const serverSource = fs.readFileSync(serverPath, 'utf8');
const isImportable = /if\s*\(require\.main\s*===\s*module\)/.test(serverSource);
const server = isImportable ? require(serverPath) : {};

const expectedCatalog = [
  ['training-calculator', '练兵计算站', 'featured', true],
  ['fire-crystal-building', '火晶建筑计算器', 'featured', true],
  ['lord-equipment-gem', '领主装备与宝石计算器', 'featured', true],
  ['hero-data', '英雄数据', 'featured', true],
  ['bear-pit', '熊坑排布', 'core', true],
  ['bear-pit-simple', '熊坑排布简约版', 'core', true],
  ['tiantian-strategy', '甜甜的攻略站', 'core', true],
  ['refine-crystal-calculator', '精炼提炼计算器', 'core', true],
  ['refine-crystal-simulator', '精炼提炼模拟器', 'core', true],
  ['engineering-station-time', '工程站时间', 'core', true],
  ['gift-value-calculator', '礼包性价比', 'core', true],
  ['hero-equipment-calculator', '英雄装备计算器', 'core', true],
  ['expert-calculator', '专家计算器', 'core', true],
  ['t11-calculator', 'T11 升级', 'core', true],
  ['t12-calculator', 'T12科技计算器', 'core', true],
  ['giftcode-center', '无尽冬日兑换中心', 'extended', false],
  ['immigration-coupon-calculator', '移民券计算器', 'extended', true],
  ['building-upgrade-calculator', '1-30建筑升级计算器', 'extended', true],
  ['t12-data-overview', 'T12数据总览', 'extended', true],
  ['neighbor-progress', '邻邦进度', 'extended', true],
  ['history-immigration-group', '历史移民分组', 'extended', true],
  ['migration-prediction', '移民预测', 'extended', true],
  ['building-upgrade-query', '1-30建筑升级数据查询', 'extended', true],
  ['pet-data-query', '宠物数据查询', 'extended', true],
  ['bear-body-recommendation', '打熊车身推荐', 'core', true],
  ['ice-workshop-placement', '创冰工坊·最优摆放助手', 'core', true],
  ['wjti-personality-test', '无尽冬日人格测试', 'extended', true],
  ['regular-gift-data', '常规礼包', 'extended', true],
  ['special-gift-data', '特惠礼包', 'extended', true],
  ['reference-hub', '礼包参考总览', 'extended', true],
  ['gift-rotation-schedule', '礼包轮换表', 'extended', true],
  ['aeroplane-chess', '极简飞行棋', 'miniGames', true]
];

test('server exports the complete tool catalog without starting its listener', () => {
  assert.equal(isImportable, true, 'server.js must be safe to import in API tests');
  assert.deepEqual(
    server.TOOL_CATALOG.map(({ id, name, group, defaultVisible }) => [id, name, group, defaultVisible]),
    expectedCatalog
  );
  assert.ok(server.TOOL_CATALOG.every((tool) => tool.badge === 'none'));
});

test('normalization fills missing tools and fields from defaults and discards unknown ids', () => {
  assert.equal(typeof server.normalizeToolManagement, 'function');
  const result = server.normalizeToolManagement({
    tools: [
      { id: 'training-calculator', visible: false, badge: 'hot' },
      { id: 'bear-pit', badge: 'new' },
      { id: 'unknown-tool', visible: false, badge: 'hot' }
    ]
  });

  assert.equal(result.error, undefined);
  assert.equal(result.tools.length, expectedCatalog.length);
  assert.deepEqual(result.tools[0], { id: 'training-calculator', visible: false, badge: 'hot' });
  assert.deepEqual(result.tools[4], { id: 'bear-pit', visible: true, badge: 'new' });
  assert.deepEqual(result.tools[15], { id: 'giftcode-center', visible: false, badge: 'none' });
  assert.equal(result.tools.some((tool) => tool.id === 'unknown-tool'), false);
});

test('normalization rejects invalid badges for known tools', () => {
  assert.deepEqual(
    server.normalizeToolManagement({ tools: [{ id: 'hero-data', badge: 'featured' }] }),
    { error: 'BAD_BADGE' }
  );
  assert.equal(
    server.normalizeToolManagement({ tools: [{ id: 'unknown-tool', badge: 'featured' }] }).error,
    undefined
  );
});

test('public and admin projections expose only their intended fields', () => {
  const normalized = server.normalizeToolManagement([]);
  const publicTools = server.toPublicToolManagement(normalized.tools);
  const adminTools = server.toAdminToolManagement(normalized.tools);

  assert.deepEqual(Object.keys(publicTools[0]), ['id', 'visible', 'badge']);
  assert.deepEqual(Object.keys(adminTools[0]), ['id', 'name', 'group', 'defaultVisible', 'visible', 'badge']);
  assert.equal(adminTools[15].defaultVisible, false);
});

test('server mounts public and authenticated admin tool management routes', () => {
  assert.match(serverSource, /app\.get\('\/api\/tool-management'/);
  assert.match(serverSource, /app\.get\('\/api\/admin\/tool-management'/);
  assert.match(serverSource, /app\.put\('\/api\/admin\/tool-management'/);
  assert.match(serverSource, /app\.post\('\/api\/admin\/tool-management'/);
  assert.match(serverSource, /requireAdmin\(req, res\)/);
  assert.match(serverSource, /setSetting\(TOOL_MANAGEMENT_SETTING_KEY/);
  assert.match(serverSource, /action:\s*'tool_management\.update'/);
});

test('public handler falls back to the default visible catalog when settings reads fail', async () => {
  assert.equal(typeof server.createToolManagementHandlers, 'function');
  const handlers = server.createToolManagementHandlers({
    getSetting: async () => { throw new Error('database unavailable'); },
    setSetting: async () => {},
    requireAdmin: async () => null,
    auditAdminAction: async () => {},
    logError: () => {}
  });
  const response = createResponse();

  await handlers.getPublic({}, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.tools.length, expectedCatalog.length);
  assert.equal(response.body.tools[0].visible, true);
  assert.equal(response.body.tools[15].visible, false);
  assert.ok(response.body.tools.every((tool) => tool.badge === 'none'));
});

test('admin save persists a complete normalized catalog and writes an audit log', async () => {
  const writes = [];
  const audits = [];
  const admin = { id: 7, login_id: 'admin01', username: '管理员' };
  const handlers = server.createToolManagementHandlers({
    getSetting: async () => null,
    setSetting: async (key, value) => writes.push({ key, value }),
    requireAdmin: async () => admin,
    auditAdminAction: async (_req, details) => audits.push(details),
    now: () => '2026-07-12T08:00:00.000Z'
  });
  const response = createResponse();

  await handlers.saveAdmin(
    {
      body: {
        tools: server.TOOL_CATALOG.map((tool) => ({
          id: tool.id,
          visible: tool.id === 'hero-data' ? false : tool.defaultVisible,
          badge: tool.id === 'hero-data' ? 'new' : 'none'
        }))
      }
    },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].key, 'tool_management');
  assert.equal(writes[0].value.tools.length, expectedCatalog.length);
  assert.deepEqual(writes[0].value.tools[3], { id: 'hero-data', visible: false, badge: 'new' });
  assert.equal(writes[0].value.updatedAt, '2026-07-12T08:00:00.000Z');
  assert.equal(writes[0].value.updatedBy, '管理员');
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'tool_management.update');
  assert.equal(audits[0].actor, admin);
  assert.equal(response.body.tools[3].name, '英雄数据');
});

test('admin save rejects an empty or incomplete catalog without overwriting settings', async () => {
  let writes = 0;
  let audits = 0;
  const handlers = server.createToolManagementHandlers({
    getSetting: async () => null,
    setSetting: async () => { writes += 1; },
    requireAdmin: async () => ({ id: 7, is_admin: 1 }),
    auditAdminAction: async () => { audits += 1; }
  });

  for (const tools of [[], [{ id: 'hero-data', visible: false, badge: 'new' }]]) {
    const response = createResponse();
    await handlers.saveAdmin({ body: { tools } }, response);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: 'BAD_TOOL_CATALOG' });
  }

  assert.equal(writes, 0);
  assert.equal(audits, 0);
});

test('admin save rejects invalid known badges without writing settings or audit logs', async () => {
  let writes = 0;
  let audits = 0;
  const handlers = server.createToolManagementHandlers({
    getSetting: async () => null,
    setSetting: async () => { writes += 1; },
    requireAdmin: async () => ({ id: 7, is_admin: 1 }),
    auditAdminAction: async () => { audits += 1; }
  });
  const response = createResponse();

  await handlers.saveAdmin(
    {
      body: {
        tools: server.TOOL_CATALOG.map((tool) => ({
          id: tool.id,
          visible: tool.defaultVisible,
          badge: tool.id === 'hero-data' ? 'invalid' : 'none'
        }))
      }
    },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: 'BAD_BADGE' });
  assert.equal(writes, 0);
  assert.equal(audits, 0);
});

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}
