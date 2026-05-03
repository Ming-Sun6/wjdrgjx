const RISK_ORDER = { info: 0, ok: 1, watch: 2, danger: 3, fail: 4 };
const VALID_RISK_LEVELS = new Set(Object.keys(RISK_ORDER));
const DEFAULT_THRESHOLDS = {
  pendingReviewDanger: 10,
  punishedAccountsDanger: 10,
  userVoicesWatch: 20,
  highRiskAuditDanger: 4
};

function normalizeRiskLevel(value) {
  const level = String(value || '').trim().toLowerCase();
  return VALID_RISK_LEVELS.has(level) ? level : 'info';
}

function toCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function highestRiskLevel(items) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) return 'ok';
  return rows.reduce((current, item) => {
    const next = normalizeRiskLevel(item && item.level);
    return RISK_ORDER[next] > RISK_ORDER[current] ? next : current;
  }, 'info');
}

function summarizeReleaseItems(items) {
  const rows = Array.isArray(items) ? items : [];
  const failed = rows.filter((item) => normalizeRiskLevel(item && item.level) === 'fail').length;
  const danger = rows.filter((item) => normalizeRiskLevel(item && item.level) === 'danger').length;
  const watch = rows.filter((item) => normalizeRiskLevel(item && item.level) === 'watch').length;
  if (failed) return `发布检查失败 ${failed} 项，需先修复关键依赖。`;
  if (danger) return `发布检查发现危险项 ${danger} 项，建议处理后再发布。`;
  if (watch) return `发布检查有提醒项 ${watch} 项，可以发布但需关注。`;
  return '发布检查全部通过。';
}

function makeCheck(key, label, level, summary, targetPage) {
  return { key, label, level: normalizeRiskLevel(level), summary, targetPage: targetPage || '' };
}

function buildReleaseCheckItems(context, thresholds) {
  const t = { ...DEFAULT_THRESHOLDS, ...(thresholds || {}) };
  const ctx = context || {};
  const moderatorCount = toCount(ctx.moderatorCount);
  const pendingReview = toCount(ctx.pendingReview);
  const pendingDeleteRequests = toCount(ctx.pendingDeleteRequests);
  const punishedAccounts = toCount(ctx.punishedAccounts);
  const userVoices = toCount(ctx.userVoices);
  const calendarItems = toCount(ctx.calendarItems);
  const recentHighRiskAuditCount = toCount(ctx.recentHighRiskAuditCount);

  return [
    makeCheck('health', '服务健康', ctx.healthOk ? 'ok' : 'fail', ctx.healthOk ? '健康接口可用' : '健康接口不可用'),
    makeCheck('tables', '数据库关键表', ctx.tableStatus && ctx.tableStatus.ok ? 'ok' : 'fail', ctx.tableStatus && ctx.tableStatus.ok ? '关键表可查询' : '关键表查询失败'),
    makeCheck('adminPermission', '管理员权限', ctx.isAdmin ? 'ok' : 'fail', ctx.isAdmin ? '当前账号具备管理员权限' : '当前账号不是管理员'),
    makeCheck('admins', '管理员列表', ctx.adminReadable ? 'ok' : 'fail', ctx.adminReadable ? '管理员列表可读取' : '管理员列表读取失败', 'admins'),
    makeCheck('moderators', '版主配置', moderatorCount > 0 ? 'ok' : 'watch', moderatorCount > 0 ? '已配置版主' : '当前没有版主', 'moderators'),
    makeCheck('announcement', '公告状态', ctx.announcement ? 'ok' : 'watch', ctx.announcement ? '公告可读取' : '当前没有公告', 'announcement'),
    makeCheck('pendingReview', '待审核压力', pendingReview >= t.pendingReviewDanger ? 'danger' : 'ok', `待审核 ${pendingReview} 条`, 'review'),
    makeCheck('deleteRequests', '删号审核', pendingDeleteRequests > 0 ? 'danger' : 'ok', `待审核删号 ${pendingDeleteRequests} 条`, 'blackroom'),
    makeCheck('punishments', '处罚账号', punishedAccounts >= t.punishedAccountsDanger ? 'danger' : 'ok', `处罚中账号 ${punishedAccounts} 个`, 'blackroom'),
    makeCheck('voices', '用户发声', userVoices >= t.userVoicesWatch ? 'watch' : 'ok', `用户发声 ${userVoices} 条`, 'voices'),
    makeCheck('calendar', '活动日历', calendarItems > 0 ? 'ok' : 'watch', calendarItems > 0 ? '活动日历有数据' : '活动日历为空', 'calendar'),
    makeCheck('dashboard', '运营数据', ctx.dashboardReadable ? 'ok' : 'watch', ctx.dashboardReadable ? '运营数据可读取' : '运营数据暂不可读', 'governance'),
    makeCheck('auditSpike', '高风险操作集中度', recentHighRiskAuditCount >= t.highRiskAuditDanger ? 'danger' : 'ok', `近 24 小时高风险操作 ${recentHighRiskAuditCount} 次`, 'audit-logs')
  ];
}

function makeRiskCard(level, title, summary, actionLabel, targetPage, targetPanel) {
  return {
    level: normalizeRiskLevel(level),
    title,
    summary,
    actionLabel,
    targetPage,
    targetPanel
  };
}

function buildRiskCards(context, thresholds) {
  const t = { ...DEFAULT_THRESHOLDS, ...(thresholds || {}) };
  const ctx = context || {};
  const counts = ctx.counts || {};
  const recentAuditSummary = ctx.recentAuditSummary || {};
  const risks = [];
  const pendingReview = toCount(counts.pendingReview);
  const pendingDeleteRequests = toCount(counts.pendingDeleteRequests);
  const punishedAccounts = toCount(counts.punishedAccounts);
  const highRiskCount24h = toCount(recentAuditSummary.highRiskCount24h);

  if (pendingReview >= t.pendingReviewDanger) {
    risks.push(makeRiskCard('danger', '待审核压力较高', `待审核 ${pendingReview} 条`, '处理审核', 'review', 'content'));
  }

  if (pendingDeleteRequests > 0) {
    risks.push(makeRiskCard('danger', '存在删号审核', `待审核删号 ${pendingDeleteRequests} 条`, '查看删号审核', 'blackroom', 'delete-review'));
  }

  if (punishedAccounts >= t.punishedAccountsDanger) {
    risks.push(makeRiskCard('danger', '处罚账号较多', `处罚中账号 ${punishedAccounts} 个`, '查看处罚账号', 'blackroom', 'punished'));
  }

  if (ctx.latestReleaseCheck && RISK_ORDER[normalizeRiskLevel(ctx.latestReleaseCheck.riskLevel)] >= RISK_ORDER.danger) {
    risks.push(makeRiskCard(
      normalizeRiskLevel(ctx.latestReleaseCheck.riskLevel),
      '发布检查存在风险',
      ctx.latestReleaseCheck.summary || '发布检查发现危险项',
      '查看发布检查',
      'release-checks',
      'latest'
    ));
  }

  if (highRiskCount24h >= t.highRiskAuditDanger) {
    risks.push(makeRiskCard('danger', '高风险操作集中', `近 24 小时高风险操作 ${highRiskCount24h} 次`, '查看审计日志', 'audit-logs', 'recent'));
  }

  return risks;
}

function clampTake(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  const take = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(200, Math.max(1, take));
}

function toOffset(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toNullableId(value) {
  if (value === undefined || value === null || value === '') return null;
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}

function toNullableString(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function parseJsonValue(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_err) {
    return fallback;
  }
}

function normalizeAuditRow(row) {
  const source = row || {};
  return {
    id: toCount(source.id),
    actorId: toNullableId(source.actor_id),
    actorLoginId: source.actor_login_id || null,
    actorUsername: source.actor_username || null,
    action: source.action || '',
    targetType: source.target_type || '',
    targetId: toNullableString(source.target_id),
    riskLevel: normalizeRiskLevel(source.risk_level),
    summary: source.summary || '',
    metadata: parseJsonValue(source.metadata_json, {}),
    ipHash: source.ip_hash || null,
    userAgentHash: source.user_agent_hash || null,
    createdAt: source.created_at || null
  };
}

function normalizeReleaseCheckRow(row) {
  if (!row) return null;
  return {
    id: toCount(row.id),
    actorId: toNullableId(row.actor_id),
    status: row.status || '',
    riskLevel: normalizeRiskLevel(row.risk_level),
    summary: row.summary || '',
    items: parseJsonValue(row.items_json, []),
    createdAt: row.created_at || null
  };
}

function releaseStatusForRisk(riskLevel) {
  const normalized = normalizeRiskLevel(riskLevel);
  if (normalized === 'fail' || normalized === 'danger') return 'blocked';
  if (normalized === 'watch') return 'watch';
  return 'ok';
}

function createGovernanceService(database) {
  if (!database || typeof database.queryOne !== 'function' || typeof database.queryRows !== 'function' || typeof database.execute !== 'function') {
    throw new Error('createGovernanceService requires queryOne, queryRows, and execute helpers');
  }

  const hashValue = typeof database.hashValue === 'function' ? database.hashValue : () => null;
  const formatDate = typeof database.formatSqlDateTime === 'function' ? database.formatSqlDateTime : (value) => value;

  async function countOne(sql, params) {
    const row = await database.queryOne(sql, params || []);
    return toCount(row && row.c);
  }

  async function getLatestReleaseCheck() {
    const row = await database.queryOne(
      `SELECT id, actor_id, status, risk_level, summary, items_json, created_at
       FROM admin_release_checks
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      []
    );
    return normalizeReleaseCheckRow(row);
  }

  async function getRecentAuditLogs(options) {
    const take = clampTake(options && options.take, 8);
    const rows = await database.queryRows(
      `SELECT id, actor_id, actor_login_id, actor_username, action, target_type, target_id,
              risk_level, summary, metadata_json, ip_hash, user_agent_hash, created_at
       FROM admin_audit_logs
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [take]
    );
    return rows.map(normalizeAuditRow);
  }

  async function getAuditLogs(filters) {
    const source = filters || {};
    const take = clampTake(source.take, 50);
    const skip = toOffset(source.skip);
    const clauses = [];
    const params = [];

    if (source.actorId !== undefined && source.actorId !== '') {
      clauses.push('actor_id = ?');
      params.push(toNullableId(source.actorId));
    }
    if (source.action) {
      clauses.push('action = ?');
      params.push(String(source.action));
    }
    if (source.targetType) {
      clauses.push('target_type = ?');
      params.push(String(source.targetType));
    }
    if (source.targetId) {
      clauses.push('target_id = ?');
      params.push(String(source.targetId));
    }
    if (source.riskLevel) {
      clauses.push('risk_level = ?');
      params.push(normalizeRiskLevel(source.riskLevel));
    }
    if (source.from) {
      clauses.push('created_at >= ?');
      params.push(formatDate(source.from));
    }
    if (source.to) {
      clauses.push('created_at <= ?');
      params.push(formatDate(source.to));
    }
    if (source.q) {
      clauses.push('(summary LIKE ? OR metadata_json LIKE ? OR actor_login_id LIKE ? OR actor_username LIKE ?)');
      const keyword = `%${String(source.q).trim()}%`;
      params.push(keyword, keyword, keyword, keyword);
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await database.queryRows(
      `SELECT id, actor_id, actor_login_id, actor_username, action, target_type, target_id,
              risk_level, summary, metadata_json, ip_hash, user_agent_hash, created_at
       FROM admin_audit_logs
       ${whereSql}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, take, skip]
    );
    return { logs: rows.map(normalizeAuditRow), take, skip };
  }

  async function getReleaseChecks(filters) {
    const source = filters || {};
    const take = clampTake(source.take, 30);
    const skip = toOffset(source.skip);
    const clauses = [];
    const params = [];

    if (source.riskLevel) {
      clauses.push('risk_level = ?');
      params.push(normalizeRiskLevel(source.riskLevel));
    }
    if (source.from) {
      clauses.push('created_at >= ?');
      params.push(formatDate(source.from));
    }
    if (source.to) {
      clauses.push('created_at <= ?');
      params.push(formatDate(source.to));
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await database.queryRows(
      `SELECT id, actor_id, status, risk_level, summary, items_json, created_at
       FROM admin_release_checks
       ${whereSql}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, take, skip]
    );
    return { checks: rows.map(normalizeReleaseCheckRow), take, skip };
  }

  async function writeAuditLog(details) {
    const source = details || {};
    const actor = source.actor || {};
    const actorId = toNullableId(actor.id || source.actorId);
    const actorLoginId = toNullableString(actor.login_id || actor.loginId || source.actorLoginId);
    const actorUsername = toNullableString(actor.username || source.actorUsername);
    const action = String(source.action || 'unknown');
    const targetType = String(source.targetType || source.target_type || 'general');
    const targetId = toNullableString(source.targetId || source.target_id);
    const riskLevel = normalizeRiskLevel(source.riskLevel || source.risk_level);
    const summary = String(source.summary || action);
    const metadataJson = JSON.stringify(source.metadata || {});
    const ipHash = source.ipHash || hashValue(source.ip);
    const userAgentHash = source.userAgentHash || hashValue(source.userAgent);
    const result = await database.execute(
      `INSERT INTO admin_audit_logs
       (actor_id, actor_login_id, actor_username, action, target_type, target_id, risk_level, summary, metadata_json, ip_hash, user_agent_hash)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       RETURNING id`,
      [actorId, actorLoginId, actorUsername, action, targetType, targetId, riskLevel, summary, metadataJson, ipHash, userAgentHash]
    );
    return {
      id: toCount(result && result.insertId),
      actorId,
      actorLoginId,
      actorUsername,
      action,
      targetType,
      targetId,
      riskLevel,
      summary,
      metadata: source.metadata || {},
      ipHash,
      userAgentHash
    };
  }

  async function collectOverviewContext(admin) {
    const tableStatus = await database.queryOne('SELECT 1 AS ok', []);
    const pendingReview = await countOne("SELECT COUNT(*) AS c FROM forum_posts WHERE status = 'pending'", []);
    const pendingDeleteRequests = await countOne("SELECT COUNT(*) AS c FROM admin_user_delete_requests WHERE status = 'pending'", []);
    const adminCount = await countOne('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1', []);
    const moderatorCount = await countOne('SELECT COUNT(*) AS c FROM users WHERE forum_publisher = 1', []);
    const punishedAccounts = await countOne('SELECT COUNT(*) AS c FROM users WHERE is_banned = 1 OR muted_until IS NOT NULL', []);
    const userVoices = await countOne('SELECT COUNT(*) AS c FROM user_voices', []);
    const calendarItems = await countOne('SELECT COUNT(*) AS c FROM calendar_schedules', []);
    const recentHighRiskAuditCount = await countOne(
      "SELECT COUNT(*) AS c FROM admin_audit_logs WHERE risk_level IN ('danger','fail') AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)",
      []
    );
    const announcementRow = await database.queryOne('SELECT value FROM site_settings WHERE `key` = ? LIMIT 1', ['announcement']);
    const announcement = parseJsonValue(announcementRow && announcementRow.value, null);
    const latestReleaseCheck = await getLatestReleaseCheck();
    const recentAuditLogs = await getRecentAuditLogs({ take: 8 });
    const isAdmin = Number(admin && admin.is_admin) === 1 || !!(admin && admin.isAdmin === true);

    return {
      healthOk: true,
      tableStatus: { ok: !!(tableStatus && tableStatus.ok) },
      isAdmin,
      adminReadable: true,
      dashboardReadable: true,
      announcement,
      pendingReview,
      pendingDeleteRequests,
      adminCount,
      moderatorCount,
      punishedAccounts,
      userVoices,
      calendarItems,
      recentHighRiskAuditCount,
      counts: {
        pendingReview,
        pendingDeleteRequests,
        adminCount,
        moderatorCount,
        punishedAccounts,
        userVoices,
        calendarItems
      },
      latestReleaseCheck,
      recentAuditLogs,
      recentAuditSummary: { highRiskCount24h: recentHighRiskAuditCount }
    };
  }

  async function runReleaseCheck(admin) {
    const context = await collectOverviewContext(admin);
    const items = buildReleaseCheckItems(context);
    const riskLevel = highestRiskLevel(items);
    const status = releaseStatusForRisk(riskLevel);
    const summary = summarizeReleaseItems(items);
    const actorId = toNullableId(admin && admin.id);
    const result = await database.execute(
      `INSERT INTO admin_release_checks (actor_id, status, risk_level, summary, items_json)
       VALUES (?,?,?,?,?)
       RETURNING id`,
      [actorId, status, riskLevel, summary, JSON.stringify(items)]
    );
    const check = {
      id: toCount(result && result.insertId),
      actorId,
      status,
      riskLevel,
      summary,
      items
    };
    await writeAuditLog({
      actor: admin,
      action: 'release_check.run',
      targetType: 'release-check',
      targetId: String(check.id),
      riskLevel,
      summary,
      metadata: { status, riskLevel, itemCount: items.length }
    });
    return check;
  }

  async function getOverview(admin) {
    const context = await collectOverviewContext(admin);
    return {
      counts: context.counts,
      announcement: context.announcement,
      latestReleaseCheck: context.latestReleaseCheck,
      recentAuditLogs: context.recentAuditLogs,
      recentAuditSummary: context.recentAuditSummary,
      risks: buildRiskCards(context)
    };
  }

  async function getRisks(admin) {
    const context = await collectOverviewContext(admin);
    return buildRiskCards(context);
  }

  return {
    writeAuditLog,
    getRecentAuditLogs,
    getAuditLogs,
    getLatestReleaseCheck,
    getReleaseChecks,
    collectOverviewContext,
    runReleaseCheck,
    getOverview,
    getRisks
  };
}

module.exports = {
  buildReleaseCheckItems,
  buildRiskCards,
  createGovernanceService,
  normalizeRiskLevel,
  highestRiskLevel,
  summarizeReleaseItems
};
