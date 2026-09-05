const {
  HOME_AD_PAGE_KEYS,
  FORUM_POST_PAGE_KEY
} = require('./forum-post-reads');

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function startOfLocalDay(value = new Date()) {
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(d.getTime())) return new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfLocalDay(value = new Date()) {
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(d.getTime())) return new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function parseDateOnly(value, endOfDay) {
  const s = String(value || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return endOfDay ? endOfLocalDay(d) : d;
  }
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return endOfDay ? endOfLocalDay(d) : startOfLocalDay(d);
}

function parsePublisherForumViewRange(query, now = new Date()) {
  const input = query || {};
  const rangeAll = String(input.range || '').trim() === 'all' || String(input.days || '') === '0';
  const customFrom = parseDateOnly(input.from, false);
  const customTo = parseDateOnly(input.to, true);
  let days = Number(input.days);
  if (!Number.isFinite(days)) days = customFrom || customTo || rangeAll ? 0 : 7;
  days = Math.max(0, Math.min(3650, Math.floor(days)));

  let to = customTo || new Date(now.getTime());
  let from;
  if (customFrom) from = customFrom;
  else if (rangeAll || days === 0) from = new Date(0);
  else from = startOfLocalDay(new Date(startOfLocalDay(now).getTime() - ((days - 1) * 24 * 60 * 60 * 1000)));

  if (from.getTime() > to.getTime()) {
    const swap = from;
    from = startOfLocalDay(to);
    to = endOfLocalDay(swap);
  }

  const spanDays = Math.max(1, Math.round((startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime()) / (24 * 60 * 60 * 1000)) + 1);
  return {
    from,
    to,
    days: rangeAll || (customFrom && !Number(input.days)) ? 0 : (days || spanDays),
    range: rangeAll ? 'all' : 'custom'
  };
}

function sanitizeUserQuery(value) {
  return String(value || '').trim().slice(0, 80).replace(/[%_]/g, ' ');
}

function buildUserFilter(query, likeOp) {
  const userId = Number(query && (query.userId || query.authorId));
  const q = sanitizeUserQuery(query && (query.q || query.user || query.search));
  const where = [];
  const params = [];
  if (Number.isFinite(userId) && userId > 0) {
    where.push('u.id = ?');
    params.push(userId);
  }
  if (q) {
    const like = `%${q}%`;
    where.push(`(u.username ${likeOp} ? OR u.login_id ${likeOp} ? OR CAST(u.id AS CHAR) = ?)`);
    params.push(like, like, q);
  }
  return { where, params };
}

function normalizeAuthorRow(row) {
  return {
    userId: toNumber(row.userId || row.userid),
    username: String(row.username || ''),
    loginId: String(row.loginId || row.loginid || row.login_id || ''),
    postCount: toNumber(row.postCount || row.postcount),
    realViews: toNumber(row.realViews || row.realviews),
    realUv: toNumber(row.realUv || row.realuv),
    recentViews: toNumber(row.recentViews || row.recentviews),
    recentUv: toNumber(row.recentUv || row.recentuv),
    posts: []
  };
}

function normalizePostRow(row) {
  return {
    id: toNumber(row.id),
    title: String(row.title || ''),
    status: String(row.status || ''),
    createdAt: row.createdAt || row.created_at || null,
    realViews: toNumber(row.realViews || row.realviews),
    realUv: toNumber(row.realUv || row.realuv),
    recentViews: toNumber(row.recentViews || row.recentviews),
    recentUv: toNumber(row.recentUv || row.recentuv),
    displayViews: toNumber(row.displayViews || row.displayviews)
  };
}

function homePageKeySql() {
  return HOME_AD_PAGE_KEYS.map(() => '?').join(',');
}

function toolAdPageSql() {
  return `(
    (
      page_key LIKE 'function/%'
      AND page_key NOT IN ('function/forum-post', 'function/forum', 'function/my')
      AND page_key NOT LIKE 'function/_ops/%'
      AND page_key NOT LIKE '%/admin'
    )
    OR page_key LIKE 'map-tool%'
    OR page_key LIKE 'giftcode%'
  )`;
}

function createPublisherForumStatsService(deps) {
  const services = deps || {};
  const queryRows = services.queryRows || (async () => []);
  const queryOne = services.queryOne || (async () => null);
  const likeOp = services.likeOp || 'LIKE';

  async function getAdSlotStats(range) {
    const row = await queryOne(
      `
      SELECT
        COALESCE(SUM(CASE WHEN page_key IN (${homePageKeySql()}) THEN 1 ELSE 0 END), 0) AS homePv,
        COUNT(DISTINCT CASE WHEN page_key IN (${homePageKeySql()}) THEN visitor_id END) AS homeUv,
        COALESCE(SUM(CASE WHEN page_key = ? THEN 1 ELSE 0 END), 0) AS forumPv,
        COUNT(DISTINCT CASE WHEN page_key = ? THEN visitor_id END) AS forumUv,
        COALESCE(SUM(CASE WHEN ${toolAdPageSql()} THEN 1 ELSE 0 END), 0) AS toolPv,
        COUNT(DISTINCT CASE WHEN ${toolAdPageSql()} THEN visitor_id END) AS toolUv
      FROM analytics_events
      WHERE event_type = 'page_view'
        AND COALESCE(is_admin_area, 0) = 0
        AND occurred_at >= ? AND occurred_at <= ?
      `,
      [...HOME_AD_PAGE_KEYS, ...HOME_AD_PAGE_KEYS, FORUM_POST_PAGE_KEY, FORUM_POST_PAGE_KEY, range.from, range.to]
    );
    const toolPv = toNumber(row && (row.toolPv || row.toolpv || row.rangePv || row.rangepv));
    const toolUv = toNumber(row && (row.toolUv || row.tooluv || row.rangeUv || row.rangeuv));
    return {
      homePv: toNumber(row && (row.homePv || row.homepv)),
      homeUv: toNumber(row && (row.homeUv || row.homeuv)),
      forumPv: toNumber(row && (row.forumPv || row.forumpv)),
      forumUv: toNumber(row && (row.forumUv || row.forumuv)),
      toolPv,
      toolUv,
      rangePv: toolPv,
      rangeUv: toolUv
    };
  }

  async function getAuthorViewStats(query) {
    const range = parsePublisherForumViewRange(query);
    const filter = buildUserFilter(query, likeOp);
    const page = Math.max(1, Math.floor(toNumber(query && query.page) || 1));
    const pageSize = Math.max(1, Math.min(200, Math.floor(toNumber(query && query.pageSize) || 50)));
    const sortKey = String((query && query.sort) || 'recentViews');
    const sortSql = {
      recentViews: 'recentViews DESC, realViews DESC, postCount DESC',
      recentUv: 'recentUv DESC, recentViews DESC, realUv DESC',
      realViews: 'realViews DESC, realUv DESC, postCount DESC',
      realUv: 'realUv DESC, realViews DESC, postCount DESC',
      postCount: 'postCount DESC, realViews DESC',
      username: 'u.username ASC'
    }[sortKey] || 'recentViews DESC, realViews DESC, postCount DESC';

    const whereSql = filter.where.length ? `WHERE ${filter.where.join(' AND ')}` : '';
    const rangeParams = [range.from, range.to, range.from, range.to];

    const totalRow = await queryOne(
      `
      SELECT COUNT(*) AS total
      FROM (
        SELECT u.id
        FROM users u
        INNER JOIN forum_posts p ON p.author_id = u.id
        ${whereSql}
        GROUP BY u.id
      ) t
      `,
      filter.params
    );
    const total = Math.max(0, toNumber(totalRow && totalRow.total));
    const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * pageSize;

    const users = (await queryRows(
      `
      SELECT
        u.id AS userId,
        u.username AS username,
        u.login_id AS loginId,
        COUNT(DISTINCT p.id) AS postCount,
        COALESCE(SUM(CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END), 0) AS realViews,
        COUNT(DISTINCT r.visitor_id) AS realUv,
        COALESCE(SUM(CASE WHEN r.created_at >= ? AND r.created_at <= ? THEN 1 ELSE 0 END), 0) AS recentViews,
        COUNT(DISTINCT CASE WHEN r.created_at >= ? AND r.created_at <= ? THEN r.visitor_id END) AS recentUv
      FROM users u
      INNER JOIN forum_posts p ON p.author_id = u.id
      LEFT JOIN forum_post_reads r ON r.post_id = p.id
      ${whereSql}
      GROUP BY u.id, u.username, u.login_id
      ORDER BY ${sortSql}
      LIMIT ? OFFSET ?
      `,
      [...rangeParams, ...filter.params, pageSize, offset]
    ) || []).map(normalizeAuthorRow);

    const userIds = users.map((u) => u.userId).filter((id) => id > 0);
    if (userIds.length) {
      const placeholders = userIds.map(() => '?').join(',');
      const postRows = await queryRows(
        `
        SELECT
          p.id AS id,
          p.author_id AS userId,
          p.title AS title,
          p.status AS status,
          p.created_at AS createdAt,
          COALESCE(SUM(CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END), 0) AS realViews,
          COUNT(DISTINCT r.visitor_id) AS realUv,
          COALESCE(SUM(CASE WHEN r.created_at >= ? AND r.created_at <= ? THEN 1 ELSE 0 END), 0) AS recentViews,
          COUNT(DISTINCT CASE WHEN r.created_at >= ? AND r.created_at <= ? THEN r.visitor_id END) AS recentUv,
          (
            SELECT COUNT(*) FROM forum_post_views v
            WHERE v.post_id = p.id AND v.created_at <= CURRENT_TIMESTAMP(3)
          ) AS displayViews
        FROM forum_posts p
        LEFT JOIN forum_post_reads r ON r.post_id = p.id
        WHERE p.author_id IN (${placeholders})
        GROUP BY p.id, p.author_id, p.title, p.status, p.created_at
        ORDER BY recentViews DESC, realViews DESC, p.created_at DESC
        `,
        [...rangeParams, ...userIds]
      );
      const byUser = new Map(users.map((u) => [u.userId, u]));
      for (const row of postRows || []) {
        const user = byUser.get(toNumber(row.userId || row.userid || row.author_id));
        if (user) user.posts.push(normalizePostRow(row));
      }
    }

    const summaryRow = await queryOne(
      `
      SELECT
        COUNT(DISTINCT u.id) AS users,
        COUNT(DISTINCT p.id) AS posts,
        COALESCE(SUM(CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END), 0) AS realViews,
        COUNT(DISTINCT r.visitor_id) AS realUv,
        COALESCE(SUM(CASE WHEN r.created_at >= ? AND r.created_at <= ? THEN 1 ELSE 0 END), 0) AS recentViews,
        COUNT(DISTINCT CASE WHEN r.created_at >= ? AND r.created_at <= ? THEN r.visitor_id END) AS recentUv
      FROM users u
      INNER JOIN forum_posts p ON p.author_id = u.id
      LEFT JOIN forum_post_reads r ON r.post_id = p.id
      ${whereSql}
      `,
      [...rangeParams, ...filter.params]
    );

    const ads = await getAdSlotStats(range);

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        days: range.days
      },
      ads,
      summary: {
        users: toNumber(summaryRow && summaryRow.users),
        posts: toNumber(summaryRow && summaryRow.posts),
        realViews: toNumber(summaryRow && (summaryRow.realViews || summaryRow.realviews)),
        realUv: toNumber(summaryRow && (summaryRow.realUv || summaryRow.realuv)),
        recentViews: toNumber(summaryRow && (summaryRow.recentViews || summaryRow.recentviews)),
        recentUv: toNumber(summaryRow && (summaryRow.recentUv || summaryRow.recentuv))
      },
      page: safePage,
      pageSize,
      total,
      totalPages,
      users
    };
  }

  return {
    getAdSlotStats,
    getAuthorViewStats
  };
}

module.exports = {
  parsePublisherForumViewRange,
  sanitizeUserQuery,
  createPublisherForumStatsService
};
