const { getRangeForQuery, getQueryBucketSpec } = require('./time');

function buildInsertEventParams(event) {
  const payload = event || {};
  return {
    sql: `
      INSERT INTO analytics_events (
        event_type, occurred_at, page_path, page_key, scope_type, scope_key,
        user_id, visitor_id, session_id, referrer, user_agent_hash, ip_hash,
        is_admin_area, status_code, duration_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    values: [
      String(payload.eventType || ''),
      formatSqlDateTime(payload.occurredAt || new Date()),
      payload.pagePath || null,
      payload.pageKey || null,
      String(payload.scopeType || 'site'),
      String(payload.scopeKey || 'site'),
      Number.isFinite(Number(payload.userId)) ? Number(payload.userId) : null,
      payload.visitorId || null,
      payload.sessionId || null,
      payload.referrer || null,
      payload.userAgentHash || null,
      payload.ipHash || null,
      payload.isAdminArea ? 1 : 0,
      Number.isFinite(Number(payload.statusCode)) ? Number(payload.statusCode) : null,
      Number.isFinite(Number(payload.durationMs)) ? Number(payload.durationMs) : null
    ]
  };
}

function toNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function buildSummaryResponse(row) {
  return {
    pv: toNumber(row?.pv),
    uv: toNumber(row?.uv),
    newUsers: toNumber(row?.newUsers),
    activeUsers: toNumber(row?.activeUsers),
    posts: toNumber(row?.posts),
    comments: toNumber(row?.comments),
    pendingReview: toNumber(row?.pendingReview),
    punishments: toNumber(row?.punishments)
  };
}

function buildRankingResponse(payload) {
  const input = payload || {};
  return {
    topPages: Array.isArray(input.topPages) ? input.topPages : [],
    topFunctionPages: Array.isArray(input.topFunctionPages) ? input.topFunctionPages : [],
    topApis: Array.isArray(input.topApis) ? input.topApis : []
  };
}

function buildTrendsResponse(payload) {
  const input = payload || {};
  return {
    traffic: Array.isArray(input.traffic) ? input.traffic : [],
    users: Array.isArray(input.users) ? input.users : [],
    content: Array.isArray(input.content) ? input.content : [],
    moderation: Array.isArray(input.moderation) ? input.moderation : []
  };
}

function formatSqlDateTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 23).replace('T', ' ');
}

function createAnalyticsService(deps) {
  const services = deps || {};
  const queryOne = services.queryOne || (async () => ({}));
  const queryRows = services.queryRows || (async () => []);
  const execute = services.execute || (async () => ({}));

  async function getSummary(query) {
    const range = getRangeForQuery(query);
    const start = formatSqlDateTime(range.start);
    const end = formatSqlDateTime(range.end);

    const traffic = await queryOne(
      `
      SELECT COUNT(*) AS pv,
             COUNT(DISTINCT COALESCE(CAST(user_id AS CHAR), visitor_id)) AS uv
      FROM analytics_events
      WHERE event_type = 'page_view' AND occurred_at >= ? AND occurred_at <= ?
      `,
      [start, end]
    );
    const newUsers = await queryOne(
      `
      SELECT COUNT(*) AS newUsers
      FROM users
      WHERE created_at >= ? AND created_at <= ?
      `,
      [start, end]
    );
    const activeUsers = await queryOne(
      `
      SELECT COUNT(DISTINCT user_id) AS activeUsers
      FROM analytics_events
      WHERE user_id IS NOT NULL AND occurred_at >= ? AND occurred_at <= ?
      `,
      [start, end]
    );
    const posts = await queryOne(
      `
      SELECT COUNT(*) AS posts
      FROM forum_posts
      WHERE created_at >= ? AND created_at <= ?
      `,
      [start, end]
    );
    const comments = await queryOne(
      `
      SELECT COUNT(*) AS comments
      FROM forum_comments
      WHERE created_at >= ? AND created_at <= ?
      `,
      [start, end]
    );
    const pendingReview = await queryOne(
      `
      SELECT COUNT(*) AS pendingReview
      FROM forum_posts
      WHERE status = 'pending'
      `,
      []
    );
    const punishments = await queryOne(
      `
      SELECT COUNT(*) AS punishments
      FROM users
      WHERE is_banned = 1 OR (muted_until IS NOT NULL AND muted_until > CURRENT_TIMESTAMP(3))
      `,
      []
    );

    var summary = buildSummaryResponse({
      pv: traffic?.pv,
      uv: traffic?.uv,
      newUsers: newUsers?.newUsers,
      activeUsers: activeUsers?.activeUsers,
      posts: posts?.posts,
      comments: comments?.comments,
      pendingReview: pendingReview?.pendingReview,
      punishments: punishments?.punishments
    });
    if (String(query?.mode || '') === 'custom_avg') {
      var dayMs = 24 * 60 * 60 * 1000;
      var divisor = Math.max(1, Math.ceil((range.end.getTime() - range.start.getTime()) / dayMs));
      summary = {
        pv: Math.round(summary.pv / divisor),
        uv: Math.round(summary.uv / divisor),
        newUsers: Math.round(summary.newUsers / divisor),
        activeUsers: Math.round(summary.activeUsers / divisor),
        posts: Math.round(summary.posts / divisor),
        comments: Math.round(summary.comments / divisor),
        pendingReview: summary.pendingReview,
        punishments: summary.punishments
      };
    }
    return summary;
  }

  async function trackPageView(payload) {
    const insert = buildInsertEventParams({
      eventType: 'page_view',
      occurredAt: payload?.occurredAt || new Date().toISOString(),
      pagePath: payload?.pagePath || '/',
      pageKey: payload?.pageKey || 'rukou',
      scopeType: 'page',
      scopeKey: payload?.pageKey || 'rukou',
      userId: payload?.userId || null,
      visitorId: payload?.visitorId || null,
      sessionId: payload?.sessionId || null,
      referrer: payload?.referrer || null,
      userAgentHash: payload?.userAgentHash || null,
      ipHash: payload?.ipHash || null,
      isAdminArea: !!payload?.isAdminArea,
      statusCode: 202
    });
    await execute(insert.sql, insert.values);
    return {
      ok: true,
      visitorId: payload?.visitorId || ''
    };
  }

  async function recordApiHit(payload) {
    const insert = buildInsertEventParams({
      eventType: 'api_hit',
      occurredAt: payload?.occurredAt || new Date().toISOString(),
      pagePath: null,
      pageKey: null,
      scopeType: 'api',
      scopeKey: payload?.scopeKey || '',
      userId: payload?.userId || null,
      visitorId: payload?.visitorId || null,
      sessionId: payload?.sessionId || null,
      referrer: payload?.referrer || null,
      userAgentHash: payload?.userAgentHash || null,
      ipHash: payload?.ipHash || null,
      isAdminArea: !!payload?.isAdminArea,
      statusCode: payload?.statusCode || null,
      durationMs: payload?.durationMs || null
    });
    await execute(insert.sql, insert.values);
    return { ok: true };
  }

  async function getTrends(query) {
    const range = getRangeForQuery(query);
    const start = formatSqlDateTime(range.start);
    const end = formatSqlDateTime(range.end);
    const bucketSpec = getQueryBucketSpec(query, range);
    const traffic = await queryRows(
      `
      SELECT DATE_FORMAT(occurred_at, '${bucketSpec.sqlFormat}') AS bucket,
             COUNT(*) AS pv,
             COUNT(DISTINCT COALESCE(CAST(user_id AS CHAR), visitor_id)) AS uv
      FROM analytics_events
      WHERE event_type = 'page_view' AND occurred_at >= ? AND occurred_at <= ?
      GROUP BY bucket
      ORDER BY bucket ASC
      `,
      [start, end]
    );
    const users = await queryRows(
      `
      SELECT DATE_FORMAT(created_at, '${bucketSpec.sqlFormat}') AS bucket,
             COUNT(*) AS newUsers
      FROM users
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY bucket
      ORDER BY bucket ASC
      `,
      [start, end]
    );
    const content = await queryRows(
      `
      SELECT bucket, SUM(posts) AS posts, SUM(comments) AS comments
      FROM (
        SELECT DATE_FORMAT(created_at, '${bucketSpec.sqlFormat}') AS bucket, COUNT(*) AS posts, 0 AS comments
        FROM forum_posts
        WHERE created_at >= ? AND created_at <= ?
        GROUP BY bucket
        UNION ALL
        SELECT DATE_FORMAT(created_at, '${bucketSpec.sqlFormat}') AS bucket, 0 AS posts, COUNT(*) AS comments
        FROM forum_comments
        WHERE created_at >= ? AND created_at <= ?
        GROUP BY bucket
      ) content_rows
      GROUP BY bucket
      ORDER BY bucket ASC
      `,
      [start, end, start, end]
    );
    return buildTrendsResponse({
      traffic,
      users,
      content,
      moderation: []
    });
  }

  async function getRankings(query) {
    const range = getRangeForQuery(query);
    const start = formatSqlDateTime(range.start);
    const end = formatSqlDateTime(range.end);
    const topPages = await queryRows(
      `
      SELECT scope_key AS \`key\`, COUNT(*) AS pv
      FROM analytics_events
      WHERE event_type = 'page_view' AND occurred_at >= ? AND occurred_at <= ?
      GROUP BY scope_key
      ORDER BY pv DESC, scope_key ASC
      LIMIT 10
      `,
      [start, end]
    );
    const topFunctionPages = (topPages || []).filter((row) => String(row.key || '').startsWith('function/'));
    const topApis = await queryRows(
      `
      SELECT scope_key AS \`key\`, COUNT(*) AS hits
      FROM analytics_events
      WHERE event_type = 'api_hit' AND occurred_at >= ? AND occurred_at <= ?
      GROUP BY scope_key
      ORDER BY hits DESC, scope_key ASC
      LIMIT 10
      `,
      [start, end]
    );
    return buildRankingResponse({ topPages, topFunctionPages, topApis });
  }

  async function getRealtime(query) {
    const summary = await getSummary({ ...(query || {}), mode: 'realtime' });
    const traffic = await getTrends({ ...(query || {}), mode: 'realtime' });
    return { summary, traffic };
  }

  return {
    getSummary,
    getTrends,
    getRankings,
    getRealtime,
    trackPageView,
    recordApiHit
  };
}

module.exports = {
  buildInsertEventParams,
  buildSummaryResponse,
  buildRankingResponse,
  buildTrendsResponse,
  createAnalyticsService
};
