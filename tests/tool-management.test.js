const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.DOTENV_CONFIG_QUIET = 'true';

const root = path.join(__dirname, '..');
const serverPath = path.join(root, 'server.js');
const serverSource = fs.readFileSync(serverPath, 'utf8');
const webConfigSource = fs.readFileSync(path.join(root, 'web.config'), 'utf8');
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
  ['farthest-migration-range', '最远移民区间', 'extended', true],
  ['building-upgrade-query', '1-30建筑升级数据查询', 'extended', true],
  ['pet-data-query', '宠物数据查询', 'extended', true],
  ['bear-body-recommendation', '打熊车身推荐', 'core', true],
  ['ice-workshop-placement', '创冰工坊·最优摆放助手', 'core', true],
  ['wjti-personality-test', '无尽冬日人格测试', 'extended', true],
  ['regular-gift-data', '常规礼包', 'extended', true],
  ['special-gift-data', '特惠礼包', 'extended', true],
  ['reference-hub', '礼包参考总览', 'extended', true],
  ['gift-rotation-schedule', '礼包轮换表', 'extended', true],
  ['aeroplane-chess', '极简飞行棋', 'miniGames', true],
  ['map-editor', '全能地图编辑器', 'core', true]
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
      { id: 'training-calculator', visible: false, badge: 'hot', adminOnly: true },
      { id: 'bear-pit', badge: 'new' },
      { id: 'unknown-tool', visible: false, badge: 'hot' }
    ]
  });

  assert.equal(result.error, undefined);
  assert.equal(result.tools.length, expectedCatalog.length);
  assert.deepEqual(result.tools[0], { id: 'training-calculator', visible: false, enabled: true, adminOnly: true, allowedLoginIds: [], badge: 'hot', displayGroup: 'featured', toolCategory: 'calcTools', sortOrder: 0, disabledMessage: '' });
  assert.deepEqual(result.tools[4], { id: 'bear-pit', visible: true, enabled: true, adminOnly: false, allowedLoginIds: [], badge: 'new', displayGroup: 'core', toolCategory: 'calcTools', sortOrder: 40, disabledMessage: '' });
  assert.deepEqual(result.tools[15], { id: 'giftcode-center', visible: false, enabled: true, adminOnly: false, allowedLoginIds: [], badge: 'none', displayGroup: 'extended', toolCategory: 'calcTools', sortOrder: 150, disabledMessage: '' });
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

  assert.deepEqual(Object.keys(publicTools[0]), ['id', 'visible', 'enabled', 'adminOnly', 'viewerAllowed', 'badge', 'displayGroup', 'toolCategory', 'sortOrder']);
  assert.deepEqual(Object.keys(adminTools[0]), ['id', 'name', 'group', 'defaultVisible', 'visible', 'enabled', 'adminOnly', 'allowedLoginIds', 'badge', 'displayGroup', 'toolCategory', 'sortOrder', 'disabledMessage']);
  assert.equal(publicTools[0].viewerAllowed, true);
  assert.ok(!Object.prototype.hasOwnProperty.call(publicTools[0], 'allowedLoginIds'));
  assert.equal(adminTools[15].defaultVisible, false);
});

test('server mounts public and authenticated admin tool management routes', () => {
  assert.match(serverSource, /app\.get\('\/api\/tool-management'/);
  assert.match(serverSource, /app\.get\('\/api\/admin\/tool-management'/);
  assert.match(serverSource, /app\.put\('\/api\/admin\/tool-management'/);
  assert.match(serverSource, /app\.post\('\/api\/admin\/tool-management'/);
  assert.match(serverSource, /app\.post\('\/api\/tool-access-requests'/);
  assert.match(serverSource, /app\.get\('\/api\/admin\/tool-access-requests'/);
  assert.match(serverSource, /requireAdmin\(req, res\)/);
  assert.match(serverSource, /setSetting\(TOOL_MANAGEMENT_SETTING_KEY/);
  assert.match(serverSource, /action:\s*'tool_management\.update'/);
});

test('managed tool paths resolve for direct-link availability checks', () => {
  assert.equal(server.findManagedToolByPath('/function/BeaPit').id, 'bear-pit');
  assert.equal(server.findManagedToolByPath('/public/function/reference-hub/pages/weekly-cards.html').id, 'reference-hub');
  assert.equal(server.findManagedToolByPath('/giftcode/').id, 'giftcode-center');
  assert.equal(server.findManagedToolByPath('/map-tool/').id, 'map-editor');
  assert.equal(server.findManagedToolByPath('/map-tool').id, 'map-editor');
  assert.equal(server.findManagedToolByPath('/map-tool/assets/index-DQHLjCHj.js'), null);
  assert.equal(server.findManagedToolByPath('/function/forum.html'), null);
  assert.match(serverSource, /sendToolDisabledPage/);
  assert.match(serverSource, /sendToolAdminOnlyPage/);
  assert.match(serverSource, /sendToolRestrictedPage/);
  const gatePage = server.renderToolGatePageHtml({ title: '全能地图编辑器当前已关闭', message: '该工具当前已关闭，请稍后再试。', tool: { id: 'map-editor' } });
  assert.match(gatePage, /申请权限/);
  assert.match(gatePage, /data-tool-id="map-editor"/);
  assert.match(gatePage, /\/api\/tool-access-requests/);
  assert.match(gatePage, /功能申请协议/);
  assert.match(gatePage, /查看完整协议/);
  assert.match(gatePage, /\/legal\/tool-access-agreement/);
  assert.match(gatePage, /id="agreeCheckbox"/);
  assert.doesNotMatch(gatePage, /部分功能需申请并经管理员审核后方可使用/);
  const agreementPage = fs.readFileSync(path.join(root, 'legal', 'tool-access-agreement.html'), 'utf8');
  assert.match(agreementPage, /功能申请协议/);
  assert.match(agreementPage, /提交申请<strong>不构成<\/strong>本站已经同意开放/);
  assert.match(agreementPage, /全部法律责任、赔偿、处罚、纠纷、损失及其他后果，均由你自行承担/);
  assert.match(agreementPage, /仅出现在需要申请的功能页/);
  assert.match(agreementPage, /也不会向未登录访客弹窗/);
  assert.match(serverSource, /app\.get\('\/api\/tool-access-agreement-notice'/);
  const noticeScript = fs.readFileSync(path.join(root, 'public', 'function', 'tool-access-agreement-notice.js'), 'utf8');
  assert.match(noticeScript, /\/api\/tool-access-agreement-notice/);
  assert.match(noticeScript, /shouldSkip/);
  assert.doesNotMatch(noticeScript, /legal-notice/);
  const adminHtml = fs.readFileSync(path.join(root, 'public', 'function', '_ops', 'console-7a9', 'internal', 'admin.html'), 'utf8');
  assert.match(adminHtml, /权限申请/);
  assert.match(adminHtml, /data-request-action="approve"/);
  assert.match(adminHtml, /toolAccessPublishBtn/);
  assert.match(adminHtml, /\/api\/admin\/tool-access-agreement/);
  assert.match(serverSource, /isToolAllowedForUser/);
  assert.ok(serverSource.indexOf("tool availability check skipped") < serverSource.indexOf('mountGiftcodeProxy(app)'));
  assert.match(webConfigSource, /ReverseProxyFunctionDirectoryIndexToNode3000/);
  assert.match(webConfigSource, /\^\(\?:public\/\)\?giftcode/);
  assert.match(webConfigSource, /StaticMapToolToPublicMapTool/);
  assert.match(webConfigSource, /ReverseProxyMapToolIndexToNode3000/);
  const builtMapToolIndex = fs.readFileSync(path.join(root, 'public', 'map-tool', 'index.html'), 'utf8');
  assert.match(builtMapToolIndex, /src="\/map-tool\/assets\//);
  assert.doesNotMatch(builtMapToolIndex, /src="\/src\/main\.js"/);
  const sourceMapToolConfig = fs.readFileSync(path.join(root, 'map-tool', 'web.config'), 'utf8');
  assert.match(sourceMapToolConfig, /\/public\/map-tool\//);
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
  assert.deepEqual(writes[0].value.tools[3], { id: 'hero-data', visible: false, enabled: true, adminOnly: false, allowedLoginIds: [], badge: 'new', displayGroup: 'featured', toolCategory: 'dataQuery', sortOrder: 30, disabledMessage: '' });
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

test('allowlists grant specified users without automatically granting admins', () => {
  const result = server.normalizeToolManagement({
    tools: [{ id: 'map-editor', allowedLoginIds: ['player_01', '42', 'player_01', 'bad id'] }]
  });
  assert.deepEqual(result.tools.find((tool) => tool.id === 'map-editor').allowedLoginIds, ['player_01', '42']);
  assert.equal(server.isToolAllowedForUser(result.tools.find((tool) => tool.id === 'map-editor'), null), false);
  assert.equal(server.isToolAllowedForUser(result.tools.find((tool) => tool.id === 'map-editor'), { login_id: 'player_01' }), true);
  assert.equal(server.isToolAllowedForUser(result.tools.find((tool) => tool.id === 'map-editor'), { id: 42 }), true);
  assert.equal(server.isToolAllowedForUser(result.tools.find((tool) => tool.id === 'map-editor'), { login_id: 'admin_test01', is_admin: 1 }), false);

  const both = server.normalizeToolManagement({
    tools: [{ id: 'map-editor', adminOnly: true, allowedLoginIds: ['player_01'] }]
  }).tools.find((tool) => tool.id === 'map-editor');
  assert.equal(server.isToolAllowedForUser(both, { is_admin: 1 }), true);
  assert.equal(server.isToolAllowedForUser(both, { loginId: 'player_01' }), true);
  assert.equal(server.toPublicToolManagement([both], { login_id: 'other_user' })[0].viewerAllowed, false);
  assert.ok(!Object.prototype.hasOwnProperty.call(server.toPublicToolManagement([both])[0], 'allowedLoginIds'));
});

test('users can request tool access and admins can approve it onto the allowlist', async () => {
  const settings = {
    tool_management: {
      tools: server.TOOL_CATALOG.map((tool) => ({
        id: tool.id,
        visible: tool.defaultVisible,
        enabled: true,
        adminOnly: tool.id === 'map-editor',
        allowedLoginIds: tool.id === 'map-editor' ? ['owner_01'] : []
      }))
    },
    tool_access_requests: { requests: [] }
  };
  const writes = [];
  const audits = [];
  const user = { id: 42, login_id: 'player_01', username: '申请者' };
  const admin = { id: 7, login_id: 'admin01', username: '管理员' };
  const handlers = server.createToolAccessRequestHandlers({
    getSetting: async (key, fallback) => (Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : fallback),
    setSetting: async (key, value) => {
      settings[key] = value;
      writes.push({ key, value });
    },
    requireAuth: async () => user,
    requireAdmin: async () => admin,
    currentUserFromRequest: async () => user,
    auditAdminAction: async (_req, details) => audits.push(details),
    now: () => '2026-09-03T04:00:00.000Z',
    newId: () => 'tar_test_1'
  });

  const refused = createResponse();
  await handlers.create({ body: { toolId: 'map-editor' } }, refused);
  assert.equal(refused.statusCode, 400);
  assert.deepEqual(refused.body, { error: 'AGREEMENT_REQUIRED' });

  const created = createResponse();
  await handlers.create({ body: { toolId: 'map-editor', acceptedAgreement: true } }, created);
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.request.status, 'pending');

  const duplicate = createResponse();
  await handlers.create({ body: { toolId: 'map-editor', acceptedAgreement: true } }, duplicate);
  assert.equal(duplicate.statusCode, 409);
  assert.deepEqual(duplicate.body, { error: 'ALREADY_PENDING', request: created.body.request });

  const mine = createResponse();
  await handlers.getMine({ query: { toolId: 'map-editor' } }, mine);
  assert.equal(mine.body.request.id, 'tar_test_1');

  const approved = createResponse();
  await handlers.resolveAdmin({ params: { id: 'tar_test_1' } }, approved, 'approve');
  assert.equal(approved.statusCode, 200);
  assert.equal(approved.body.request.status, 'approved');
  const savedTools = writes.find((item) => item.key === 'tool_management').value.tools;
  assert.deepEqual(savedTools.find((tool) => tool.id === 'map-editor').allowedLoginIds, ['owner_01', 'player_01', '42']);
  assert.equal(audits[0].action, 'tool_access_request.approve');
});

test('tool access agreement update notice is limited to logged-in users on request-only tools', async () => {
  const settings = {
    tool_management: {
      tools: server.TOOL_CATALOG.map((tool) => ({
        id: tool.id,
        visible: tool.defaultVisible,
        enabled: true,
        adminOnly: tool.id === 'map-editor',
        allowedLoginIds: tool.id === 'map-editor' ? ['player_01'] : []
      }))
    },
    tool_access_agreement_acks: { acks: {} }
  };
  const user = { id: 42, login_id: 'player_01', username: '申请者' };
  const handlers = server.createToolAccessRequestHandlers({
    getSetting: async (key, fallback) => (Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : fallback),
    setSetting: async (key, value) => { settings[key] = value; },
    requireAuth: async () => user,
    currentUserFromRequest: async () => user
  });

  const guest = server.createToolAccessRequestHandlers({
    getSetting: async (key, fallback) => (Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : fallback),
    currentUserFromRequest: async () => null
  });
  const guestRes = createResponse();
  await guest.getNotice({ query: { path: '/map-tool/' } }, guestRes);
  assert.deepEqual(guestRes.body, { show: false });

  const homeRes = createResponse();
  await handlers.getNotice({ query: { path: '/' } }, homeRes);
  assert.deepEqual(homeRes.body, { show: false });

  const publicTool = createResponse();
  await handlers.getNotice({ query: { path: '/function/BeaPit.html' } }, publicTool);
  assert.deepEqual(publicTool.body, { show: false });

  const shown = createResponse();
  await handlers.getNotice({ query: { path: '/map-tool/' } }, shown);
  assert.equal(shown.body.show, true);
  assert.equal(shown.body.notice.version, server.TOOL_ACCESS_AGREEMENT_VERSION);
  assert.match(shown.body.notice.summary, /全部后果由你自行承担/);

  const acked = createResponse();
  await handlers.ackNotice({ body: { version: server.TOOL_ACCESS_AGREEMENT_VERSION } }, acked);
  assert.equal(acked.body.ok, true);
  const afterAck = createResponse();
  await handlers.getNotice({ query: { path: '/map-tool/' } }, afterAck);
  assert.deepEqual(afterAck.body, { show: false });

  const firstApplicant = server.createToolAccessRequestHandlers({
    getSetting: async (key, fallback) => (Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : fallback),
    currentUserFromRequest: async () => ({ id: 99, login_id: 'newbie_01' })
  });
  const firstVisit = createResponse();
  await firstApplicant.getNotice({ query: { path: '/map-tool/' } }, firstVisit);
  assert.deepEqual(firstVisit.body, { show: false });
});

test('published tool access agreement version drives the request-page notice', async () => {
  const settings = {
    tool_management: {
      tools: server.TOOL_CATALOG.map((tool) => ({
        id: tool.id,
        visible: tool.defaultVisible,
        enabled: true,
        adminOnly: tool.id === 'map-editor',
        allowedLoginIds: tool.id === 'map-editor' ? ['player_01'] : []
      }))
    },
    tool_access_agreement_acks: { acks: { 42: server.TOOL_ACCESS_AGREEMENT_VERSION } },
    tool_access_agreement: {
      version: '2099010101',
      noticeTitle: '申请协议改了',
      noticeSummary: '新的说明：全部后果由你自行承担。'
    }
  };
  const user = { id: 42, login_id: 'player_01', username: '申请者' };
  const handlers = server.createToolAccessRequestHandlers({
    getSetting: async (key, fallback) => (Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : fallback),
    setSetting: async (key, value) => { settings[key] = value; },
    requireAuth: async () => user,
    currentUserFromRequest: async () => user
  });

  const shown = createResponse();
  await handlers.getNotice({ query: { path: '/map-tool/' } }, shown);
  assert.equal(shown.body.show, true);
  assert.equal(shown.body.notice.version, '2099010101');
  assert.equal(shown.body.notice.title, '申请协议改了');
  assert.match(shown.body.notice.summary, /全部后果由你自行承担/);

  const stale = createResponse();
  await handlers.ackNotice({ body: { version: server.TOOL_ACCESS_AGREEMENT_VERSION } }, stale);
  assert.equal(stale.statusCode, 400);

  const acked = createResponse();
  await handlers.ackNotice({ body: { version: '2099010101' } }, acked);
  assert.equal(acked.body.ok, true);
  const afterAck = createResponse();
  await handlers.getNotice({ query: { path: '/map-tool/' } }, afterAck);
  assert.deepEqual(afterAck.body, { show: false });
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
