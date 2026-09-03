'use strict';

const HOME_NAVIGATION_SETTING_KEY = 'home_navigation';
const HOME_NAVIGATION_CATALOG = Object.freeze([
  { id: 'all', name: '全部' },
  { id: 'tools', name: '工具' },
  { id: 'forum', name: '交流论坛' },
  { id: 'calendar', name: '活动日历' },
  { id: 'my', name: '我的信息' }
]);

function defaults() {
  return HOME_NAVIGATION_CATALOG.map((item) => ({ id: item.id, visible: true, adminOnly: false }));
}

function normalizeHomeNavigation(input, options) {
  const strict = !options || options.strict !== false;
  const items = Array.isArray(input) ? input : input && Array.isArray(input.items) ? input.items : null;
  if (!items) return strict ? { error: 'BAD_HOME_NAVIGATION' } : { items: defaults() };
  const byId = new Map();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || typeof item.visible !== 'boolean' || byId.has(item.id)) return { error: 'BAD_HOME_NAVIGATION' };
    if (item.adminOnly != null && typeof item.adminOnly !== 'boolean') return { error: 'BAD_HOME_NAVIGATION' };
    byId.set(item.id, { visible: item.visible, adminOnly: item.adminOnly === true });
  }
  if (strict && (byId.size !== HOME_NAVIGATION_CATALOG.length || HOME_NAVIGATION_CATALOG.some((item) => !byId.has(item.id)))) return { error: 'BAD_HOME_NAVIGATION' };
  if ([...byId.keys()].some((id) => !HOME_NAVIGATION_CATALOG.some((item) => item.id === id))) return { error: 'BAD_HOME_NAVIGATION' };
  const normalized = HOME_NAVIGATION_CATALOG.map((item) => {
    const stored = byId.get(item.id);
    return stored ? { id: item.id, visible: stored.visible, adminOnly: stored.adminOnly } : { id: item.id, visible: true, adminOnly: false };
  });
  if (!normalized.some((item) => item.visible && !item.adminOnly)) return { error: 'HOME_NAVIGATION_EMPTY' };
  return { items: normalized };
}

function publicProjection(items) {
  return items.map((item) => ({ id: item.id, visible: item.visible !== false, adminOnly: item.adminOnly === true }));
}

function adminProjection(items) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return HOME_NAVIGATION_CATALOG.map((catalog) => {
    const stored = byId.get(catalog.id) || {};
    return { id: catalog.id, name: catalog.name, visible: stored.visible !== false, adminOnly: stored.adminOnly === true };
  });
}

function createHomeNavigationHandlers(dependencies) {
  const deps = dependencies || {};
  const getSetting = deps.getSetting || (async () => null);
  const setSetting = deps.setSetting || (async () => {});
  const requireAdmin = deps.requireAdmin || (async () => null);
  const auditAdminAction = deps.auditAdminAction || (async () => {});
  const now = deps.now || (() => new Date().toISOString());
  const logError = deps.logError || (() => {});

  async function read() {
    try {
      const stored = await getSetting(HOME_NAVIGATION_SETTING_KEY, null);
      const normalized = normalizeHomeNavigation(stored, { strict: false });
      return {
        items: normalized.error ? defaults() : normalized.items,
        updatedAt: stored && stored.updatedAt || null,
        updatedBy: stored && stored.updatedBy || null
      };
    } catch (error) {
      logError('home navigation read failed', error);
      return { items: defaults(), updatedAt: null, updatedBy: null };
    }
  }

  async function getPublic(_req, res) {
    const value = await read();
    return res.json({ items: publicProjection(value.items) });
  }

  async function getAdmin(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const value = await read();
    return res.json({ items: adminProjection(value.items), updatedAt: value.updatedAt, updatedBy: value.updatedBy });
  }

  async function saveAdmin(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const normalized = normalizeHomeNavigation(req.body || {}, { strict: true });
    if (normalized.error) return res.status(400).json({ error: normalized.error });
    const value = {
      items: normalized.items,
      updatedAt: typeof now === 'function' ? now() : now,
      updatedBy: admin.username || admin.login_id || String(admin.id)
    };
    await setSetting(HOME_NAVIGATION_SETTING_KEY, value);
    await auditAdminAction(req, {
      actor: admin,
      action: 'home_navigation.update',
      targetType: 'site_setting',
      targetId: HOME_NAVIGATION_SETTING_KEY,
      summary: '更新首页菜单显示配置',
      metadata: { items: normalized.items }
    });
    return res.json({ items: adminProjection(value.items), updatedAt: value.updatedAt, updatedBy: value.updatedBy });
  }

  return { getPublic, getAdmin, saveAdmin };
}

function mountHomeNavigationRoutes(app, dependencies) {
  const handlers = createHomeNavigationHandlers(dependencies);
  app.get('/api/home-navigation', handlers.getPublic);
  app.get('/api/admin/home-navigation', handlers.getAdmin);
  app.put('/api/admin/home-navigation', handlers.saveAdmin);
  app.post('/api/admin/home-navigation', handlers.saveAdmin);
  return handlers;
}

module.exports = {
  HOME_NAVIGATION_SETTING_KEY,
  HOME_NAVIGATION_CATALOG,
  normalizeHomeNavigation,
  publicProjection,
  adminProjection,
  createHomeNavigationHandlers,
  mountHomeNavigationRoutes
};
