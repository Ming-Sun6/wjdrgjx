'use strict';

const crypto = require('crypto');
const {
  MAX_RENDER_UNITS,
  addDays,
  compareDates,
  formatDate,
  inclusiveDays,
  normalizeSchedulePayload,
  expandDefinitions
} = require('./calendar-domain');
const { mapLegacyGroup } = require('./calendar-store');
const { createCalendarPresetService } = require('./calendar-presets');

function sendError(res, status, error) {
  return res.status(status).json({ error });
}

function normalizeCategoryInput(body) {
  const name = String(body && body.name || '').trim();
  const color = String(body && body.color || '').trim().toLowerCase();
  if (!name || name.length > 80) return { error: 'BAD_NAME' };
  if (!/^#[0-9a-f]{6}$/.test(color)) return { error: 'BAD_COLOR' };
  return { value: { name, color, sortOrder: Number(body && body.sortOrder || 0) } };
}

function legacyDefinitionFromBody(body, categoryId, legacyOriginalId) {
  const name = String(body && body.name || '').trim();
  const dates = Array.from(new Set((Array.isArray(body && body.dates) ? body.dates : []).map(String))).sort();
  if (!name) return { error: 'BAD_NAME' };
  if (!dates.length) return { error: 'BAD_DATES' };
  try { dates.forEach((date) => inclusiveDays(date, date)); } catch (_error) { return { error: 'BAD_DATE' }; }
  const mapped = mapLegacyGroup(dates.map((date) => ({
    original_id: legacyOriginalId,
    name,
    date,
    start_time: body.startTime || '',
    end_time: body.endTime || '',
    color: body.color || null,
    description: body.description || ''
  })));
  return { value: {
    legacyOriginalId,
    categoryId,
    name,
    scheduleType: mapped.scheduleType,
    compositeLayout: null,
    startDate: mapped.startDate,
    endDate: mapped.endDate,
    legacyDates: mapped.legacyDates,
    startTime: String(body.startTime || ''),
    endTime: String(body.endTime || ''),
    color: body.color || null,
    description: String(body.description || ''),
    enabled: true,
    items: []
  } };
}

function createCalendarHandlers(dependencies) {
  const deps = dependencies || {};
  const store = deps.store;
  const requireAdmin = deps.requireAdmin || (async () => null);
  const auditAdminAction = deps.auditAdminAction || (async () => {});
  const now = deps.now || (() => new Date());
  const maxRenderUnits = Number(deps.maxRenderUnits || MAX_RENDER_UNITS);
  const logError = deps.logError || (() => {});
  const presetService = deps.presetService || (deps.getSetting && deps.setSetting
    ? createCalendarPresetService({ getSetting: deps.getSetting, setSetting: deps.setSetting, now })
    : null);

  async function getPublic(req, res) {
    try {
      const query = req.query || {};
      const hasFrom = !!query.from;
      const hasTo = !!query.to;
      if (hasFrom !== hasTo) return sendError(res, 400, 'BAD_RANGE');
      let from;
      let to;
      let rangeDefaulted = false;
      if (!hasFrom) {
        const today = formatDate(now());
        from = addDays(today, -31);
        to = addDays(today, 334);
        rangeDefaulted = true;
      } else {
        from = String(query.from);
        to = String(query.to);
      }
      let days;
      try { days = inclusiveDays(from, to); } catch (_error) { return sendError(res, 400, 'BAD_RANGE'); }
      if (days > 366) return sendError(res, 400, 'RANGE_TOO_LARGE');
      const definitions = await store.listDefinitions(false);
      let expanded;
      try { expanded = expandDefinitions(definitions, { from, to, maxUnits: maxRenderUnits }); }
      catch (error) {
        if (error && error.code === 'EXPANSION_LIMIT') return sendError(res, 422, 'EXPANSION_LIMIT');
        throw error;
      }
      if (!rangeDefaulted) return res.json(expanded);
      const schedules = [];
      for (const occurrence of expanded.schedules) {
        for (let date = compareDates(occurrence.startDate, from) < 0 ? from : occurrence.startDate;
          compareDates(date, occurrence.endDate) <= 0 && compareDates(date, to) <= 0;
          date = addDays(date, 1)) {
          schedules.push({
            id: occurrence.scheduleId,
            originalId: occurrence.originalId || String(occurrence.scheduleId),
            name: occurrence.name,
            date,
            startTime: occurrence.startTime || '',
            endTime: occurrence.endTime || '',
            color: occurrence.color,
            description: occurrence.description || ''
          });
        }
      }
      return res.json({ from, to, schedules, rangeDefaulted: true });
    } catch (error) {
      logError('calendar public get failed', error);
      return sendError(res, 500, 'INTERNAL_ERROR');
    }
  }

  async function getAdminSchedules(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    try { return res.json({ schedules: await store.listDefinitions(true) }); }
    catch (error) { logError('calendar admin list failed', error); return sendError(res, 500, 'INTERNAL_ERROR'); }
  }

  async function getAdminPreview(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const from = String(req.query && req.query.from || '');
    const to = String(req.query && req.query.to || '');
    try {
      if (inclusiveDays(from, to) > 366) return sendError(res, 400, 'RANGE_TOO_LARGE');
      const definitions = await store.listDefinitions(true);
      return res.json(expandDefinitions(definitions, { from, to, maxUnits: Math.max(maxRenderUnits, 50000), includeDisabled: true }));
    } catch (error) {
      if (/BAD_DATE|BAD_DATE_RANGE/.test(String(error && error.message || error))) return sendError(res, 400, 'BAD_RANGE');
      logError('calendar admin preview failed', error);
      return sendError(res, 500, 'INTERNAL_ERROR');
    }
  }

  async function getCategories(req, res, adminOnly) {
    if (adminOnly) {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
    }
    try { return res.json({ categories: await store.listCategories() }); }
    catch (error) { logError('calendar categories failed', error); return sendError(res, 500, 'INTERNAL_ERROR'); }
  }

  async function createCategory(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const valid = normalizeCategoryInput(req.body || {});
    if (valid.error) return sendError(res, 400, valid.error);
    try {
      const result = await store.createCategory(valid.value);
      if (result && result.error === 'CATEGORY_NAME_EXISTS') return sendError(res, 409, result.error);
      if (result && result.error) return sendError(res, 500, result.error);
      await auditAdminAction(req, { actor: admin, action: 'calendar.category.create', targetType: 'calendar_category', targetId: String(result.id), summary: `创建日历分类：${result.name}` });
      return res.status(201).json({ category: result });
    } catch (error) { logError('calendar category create failed', error); return sendError(res, 500, 'INTERNAL_ERROR'); }
  }

  async function updateCategory(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const valid = normalizeCategoryInput(req.body || {});
    if (valid.error) return sendError(res, 400, valid.error);
    const result = await store.updateCategory(Number(req.params.id), valid.value);
    if (!result) return sendError(res, 404, 'NOT_FOUND');
    if (result.error === 'CATEGORY_NAME_EXISTS') return sendError(res, 409, result.error);
    await auditAdminAction(req, { actor: admin, action: 'calendar.category.update', targetType: 'calendar_category', targetId: String(req.params.id), summary: `更新日历分类：${result.name}` });
    return res.json({ category: result });
  }

  async function reorderCategories(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.map(Number) : [];
    const result = await store.reorderCategories(ids);
    if (result && result.error) return sendError(res, 400, result.error);
    await auditAdminAction(req, { actor: admin, action: 'calendar.category.reorder', targetType: 'calendar_category', summary: '调整日历分类排序' });
    return res.json({ categories: result });
  }

  async function setCategoryStatus(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const result = await store.setCategoryStatus(Number(req.params.id), req.body && req.body.enabled === true);
    if (!result) return sendError(res, 404, 'NOT_FOUND');
    await auditAdminAction(req, { actor: admin, action: 'calendar.category.status', targetType: 'calendar_category', targetId: String(req.params.id), summary: `${result.enabled ? '启用' : '停用'}日历分类：${result.name}` });
    return res.json({ category: result });
  }

  async function saveSchedule(req, res, id) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const valid = normalizeSchedulePayload(req.body || {});
    if (valid.error) return sendError(res, 400, valid.error);
    const current = id ? await store.getDefinition(Number(id)) : null;
    if (id && !current) return sendError(res, 404, 'NOT_FOUND');
    const category = await store.getCategoryById(valid.value.categoryId);
    if (!category) return sendError(res, 400, 'BAD_CATEGORY');
    if (!category.enabled && (!current || current.categoryId !== category.id)) return sendError(res, 409, 'CATEGORY_DISABLED');
    try {
      const result = id
        ? await store.replaceDefinition(Number(id), valid.value, { actorId: Number(admin.id) })
        : await store.createDefinition(valid.value, { actorId: Number(admin.id) });
      if (result && result.error) return sendError(res, 400, result.error);
      await auditAdminAction(req, { actor: admin, action: id ? 'calendar.update' : 'calendar.create', targetType: 'calendar_schedule', targetId: String(result.id), summary: `${id ? '更新' : '创建'}日历：${result.name}` });
      return res.status(id ? 200 : 201).json({ schedule: result });
    } catch (error) { logError('calendar save failed', error); return sendError(res, 500, 'INTERNAL_ERROR'); }
  }

  async function copySchedule(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const result = await store.copyDefinition(Number(req.params.id), { actorId: Number(admin.id) });
    if (!result) return sendError(res, 404, 'NOT_FOUND');
    await auditAdminAction(req, { actor: admin, action: 'calendar.copy', targetType: 'calendar_schedule', targetId: String(result.id), summary: `复制日历：${result.name}` });
    return res.status(201).json({ schedule: result });
  }

  async function setScheduleStatus(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const result = await store.setDefinitionStatus(Number(req.params.id), req.body && req.body.enabled === true);
    if (!result) return sendError(res, 404, 'NOT_FOUND');
    await auditAdminAction(req, { actor: admin, action: 'calendar.status', targetType: 'calendar_schedule', targetId: String(result.id), summary: `${result.enabled ? '启用' : '停用'}日历：${result.name}` });
    return res.json({ schedule: result });
  }

  async function reorderSchedules(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const result = await store.reorderDefinitions(req.body && req.body.items);
    if (result && result.error) return sendError(res, 400, result.error);
    await auditAdminAction(req, { actor: admin, action: 'calendar.reorder', targetType: 'calendar_schedule', summary: '调整日历日程排序' });
    return res.json({ schedules: result });
  }

  async function quickEditOccurrence(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const scheduleId = Number(req.params.id);
    const current = await store.getDefinition(scheduleId);
    if (!current) return sendError(res, 404, 'NOT_FOUND');
    const body = req.body || {};
    const scope = String(body.scope || 'all');
    const occurrenceDate = String(body.occurrenceDate || '');
    const name = String(body.name || '').trim();
    const color = body.color == null || body.color === '' ? null : String(body.color).trim().toLowerCase();
    if (!['all', 'single', 'future'].includes(scope)) return sendError(res, 400, 'BAD_SCOPE');
    if (!name || name.length > 120) return sendError(res, 400, 'BAD_NAME');
    if (color && !/^#[0-9a-f]{6}$/.test(color)) return sendError(res, 400, 'BAD_COLOR');
    if (scope === 'all') {
      const valid = normalizeSchedulePayload({ ...current, name, color, fontBold: body.fontBold === true, enabled: body.enabled !== false });
      if (valid.error) return sendError(res, 400, valid.error);
      const result = await store.replaceDefinition(scheduleId, valid.value, { actorId: Number(admin.id), clearExceptions: true });
      await auditAdminAction(req, { actor: admin, action: 'calendar.quick_edit.all', targetType: 'calendar_schedule', targetId: String(scheduleId), summary: `调整整个循环日程：${name}` });
      return res.json({ schedule: result, scope });
    }
    try { inclusiveDays(occurrenceDate, occurrenceDate); } catch (_error) { return sendError(res, 400, 'BAD_DATE'); }
    const occurrence = expandDefinitions([current], { from: occurrenceDate, to: occurrenceDate, maxUnits: 1000, includeDisabled: true }).schedules.find((item) => item.scheduleId === scheduleId && item.occurrenceDate === occurrenceDate);
    if (!occurrence) return sendError(res, 400, 'BAD_OCCURRENCE');
    const result = await store.upsertOccurrenceException(scheduleId, occurrenceDate, scope, { name, color, fontBold: body.fontBold === true, enabled: body.enabled !== false });
    await auditAdminAction(req, { actor: admin, action: `calendar.quick_edit.${scope}`, targetType: 'calendar_schedule', targetId: String(scheduleId), summary: `${scope === 'single' ? '仅调整本次' : '调整本次及以后'}：${name}`, metadata: { occurrenceDate } });
    return res.json({ schedule: result, scope, occurrenceDate });
  }

  async function deleteSchedule(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const result = await store.deleteDefinition(Number(req.params.id));
    if (!result) return sendError(res, 404, 'NOT_FOUND');
    await auditAdminAction(req, { actor: admin, action: 'calendar.delete', targetType: 'calendar_schedule', targetId: String(req.params.id), summary: `删除日历 ${req.params.id}` });
    return res.json({ ok: true });
  }

  async function getPresets(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    if (!presetService) return sendError(res, 500, 'INTERNAL_ERROR');
    try { return res.json({ presets: await presetService.list() }); }
    catch (error) { logError('calendar preset list failed', error); return sendError(res, 500, 'INTERNAL_ERROR'); }
  }

  async function createPreset(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    if (!presetService) return sendError(res, 500, 'INTERNAL_ERROR');
    const body = req.body || {};
    const valid = normalizeSchedulePayload(body.payload || {});
    if (valid.error) return sendError(res, 400, valid.error);
    const category = await store.getCategoryById(valid.value.categoryId);
    if (!category) return sendError(res, 400, 'BAD_CATEGORY');
    if (!category.enabled) return sendError(res, 409, 'CATEGORY_DISABLED');
    try {
      const preset = await presetService.create(body.name, valid.value);
      await auditAdminAction(req, { actor: admin, action: 'calendar.preset.create', targetType: 'calendar_preset', targetId: preset.id, summary: `保存日程预设：${preset.name}` });
      return res.status(201).json({ preset });
    } catch (error) {
      if (['BAD_NAME', 'PRESET_NAME_EXISTS', 'PRESET_LIMIT'].includes(error && error.code)) return sendError(res, error.code === 'PRESET_NAME_EXISTS' ? 409 : 400, error.code);
      logError('calendar preset create failed', error);
      return sendError(res, 500, 'INTERNAL_ERROR');
    }
  }

  async function deletePreset(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    if (!presetService) return sendError(res, 500, 'INTERNAL_ERROR');
    try {
      await presetService.remove(String(req.params.id || ''));
      await auditAdminAction(req, { actor: admin, action: 'calendar.preset.delete', targetType: 'calendar_preset', targetId: String(req.params.id), summary: '删除日程预设' });
      return res.json({ ok: true });
    } catch (error) {
      if (error && error.code === 'NOT_FOUND') return sendError(res, 404, error.code);
      logError('calendar preset delete failed', error);
      return sendError(res, 500, 'INTERNAL_ERROR');
    }
  }

  async function legacyCreate(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const category = await store.getCategoryByCode('regular');
    if (!category) return sendError(res, 500, 'REGULAR_CATEGORY_MISSING');
    const legacyId = `cal_${Date.now().toString(36)}_${crypto.randomInt(1000, 9999)}`;
    const valid = legacyDefinitionFromBody(req.body || {}, category.id, legacyId);
    if (valid.error) return sendError(res, 400, valid.error);
    const result = await store.createDefinition(valid.value, { actorId: Number(admin.id) });
    await auditAdminAction(req, { actor: admin, action: 'calendar.create', targetType: 'calendar_schedule', targetId: legacyId, summary: `创建日历：${valid.value.name}` });
    return res.status(201).json({ ok: true, originalId: result.legacyOriginalId || legacyId, count: Array.isArray(req.body.dates) ? new Set(req.body.dates).size : 0 });
  }

  async function legacyUpdate(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const current = await store.getDefinitionByLegacyId(String(req.params.originalId || ''));
    if (!current) return sendError(res, 404, 'NOT_FOUND');
    const category = req.body && req.body.categoryId ? await store.getCategoryById(Number(req.body.categoryId)) : await store.getCategoryByCode('regular');
    const valid = legacyDefinitionFromBody(req.body || {}, category.id, current.legacyOriginalId || String(req.params.originalId));
    if (valid.error) return sendError(res, 400, valid.error);
    const result = await store.replaceDefinition(current.id, valid.value, { actorId: Number(admin.id) });
    await auditAdminAction(req, { actor: admin, action: 'calendar.update', targetType: 'calendar_schedule', targetId: String(req.params.originalId), summary: `更新日历：${result.name}` });
    return res.json({ ok: true, originalId: result.legacyOriginalId, count: new Set(req.body.dates || []).size });
  }

  async function legacyDelete(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const current = await store.getDefinitionByLegacyId(String(req.params.originalId || ''));
    if (!current) return sendError(res, 404, 'NOT_FOUND');
    await store.deleteDefinition(current.id);
    await auditAdminAction(req, { actor: admin, action: 'calendar.delete', targetType: 'calendar_schedule', targetId: String(req.params.originalId), summary: `删除日历 ${req.params.originalId}` });
    return res.json({ ok: true });
  }

  return {
    getPublic,
    getAdminSchedules,
    getAdminPreview,
    getCategories,
    createCategory,
    updateCategory,
    reorderCategories,
    setCategoryStatus,
    createSchedule: (req, res) => saveSchedule(req, res, null),
    updateSchedule: (req, res) => saveSchedule(req, res, req.params.id),
    copySchedule,
    setScheduleStatus,
    reorderSchedules,
    quickEditOccurrence,
    deleteSchedule,
    getPresets,
    createPreset,
    deletePreset,
    legacyCreate,
    legacyUpdate,
    legacyDelete
  };
}

function mountCalendarRoutes(app, dependencies) {
  const handlers = createCalendarHandlers(dependencies);
  app.get('/api/calendar/schedules', handlers.getPublic);
  app.post('/api/calendar/schedules', handlers.legacyCreate);
  app.patch('/api/calendar/schedules/:originalId', handlers.legacyUpdate);
  app.post('/api/calendar/schedules/:originalId', handlers.legacyUpdate);
  app.delete('/api/calendar/schedules/:originalId', handlers.legacyDelete);
  app.get('/api/admin/calendar/schedules', handlers.getAdminSchedules);
  app.get('/api/admin/calendar/preview', handlers.getAdminPreview);
  app.post('/api/admin/calendar/schedules', handlers.createSchedule);
  app.post('/api/admin/calendar/schedules/reorder', handlers.reorderSchedules);
  app.post('/api/admin/calendar/schedules/:id/quick-edit', handlers.quickEditOccurrence);
  app.patch('/api/admin/calendar/schedules/:id', handlers.updateSchedule);
  app.post('/api/admin/calendar/schedules/:id', handlers.updateSchedule);
  app.post('/api/admin/calendar/schedules/:id/copy', handlers.copySchedule);
  app.post('/api/admin/calendar/schedules/:id/status', handlers.setScheduleStatus);
  app.delete('/api/admin/calendar/schedules/:id', handlers.deleteSchedule);
  app.get('/api/admin/calendar/presets', handlers.getPresets);
  app.post('/api/admin/calendar/presets', handlers.createPreset);
  app.post('/api/admin/calendar/presets/:id/delete', handlers.deletePreset);
  app.get('/api/admin/calendar/categories', (req, res) => handlers.getCategories(req, res, true));
  app.post('/api/admin/calendar/categories', handlers.createCategory);
  app.patch('/api/admin/calendar/categories/:id', handlers.updateCategory);
  app.post('/api/admin/calendar/categories/:id', handlers.updateCategory);
  app.post('/api/admin/calendar/categories/reorder', handlers.reorderCategories);
  app.post('/api/admin/calendar/categories/:id/status', handlers.setCategoryStatus);
  return handlers;
}

module.exports = { createCalendarHandlers, mountCalendarRoutes, legacyDefinitionFromBody };
