const crypto = require('crypto');

const FORUM_MIN_VIEW_COUNT = 2;
const FORUM_MAX_VIEW_COUNT = 20;
const FORUM_DELAYED_VIEW_MIN_MS = 60 * 1000;
const FORUM_DELAYED_VIEW_MAX_MS = 25 * 60 * 1000;
const FORUM_DELAYED_VIEW_BATCHES = 3;
const FORUM_REAL_VIEW_KEY_PREFIX = 'r:';
const FORUM_SEEDED_VIEW_KEY_PREFIX = 'v:';
const FORUM_VISIBLE_VIEW_COUNT_SQL =
  '(SELECT COUNT(*) FROM forum_post_views v WHERE v.post_id = p.id AND v.created_at <= CURRENT_TIMESTAMP(3))';
const FORUM_REAL_VIEW_COUNT_SQL =
  `(SELECT COUNT(*) FROM forum_post_views v WHERE v.post_id = p.id AND v.viewer_key LIKE '${FORUM_REAL_VIEW_KEY_PREFIX}%')`;

function clampRandom(rng) {
  const n = typeof rng === 'function' ? Number(rng()) : Math.random();
  if (!Number.isFinite(n)) return 0;
  return Math.min(0.999999, Math.max(0, n));
}

function createViewerKey(prefix = FORUM_SEEDED_VIEW_KEY_PREFIX) {
  return `${prefix}${crypto.randomUUID()}`;
}

function isRealForumViewKey(key) {
  return String(key || '').startsWith(FORUM_REAL_VIEW_KEY_PREFIX);
}

function buildForumViewCount(rng = Math.random) {
  const span = FORUM_MAX_VIEW_COUNT - FORUM_MIN_VIEW_COUNT + 1;
  return FORUM_MIN_VIEW_COUNT + Math.floor(clampRandom(rng) * span);
}

function buildDelayedOffset(batchIndex, rng) {
  const span = FORUM_DELAYED_VIEW_MAX_MS - FORUM_DELAYED_VIEW_MIN_MS;
  const segment = span / FORUM_DELAYED_VIEW_BATCHES;
  return Math.round(FORUM_DELAYED_VIEW_MIN_MS + (batchIndex * segment) + (clampRandom(rng) * segment));
}

function buildForumViewRows(postId, now = new Date(), rng = Math.random) {
  const baseTime = now instanceof Date ? now : new Date(now);
  const delayedViewCount = buildForumViewCount(rng) - 1;
  const rows = [{
    postId,
    viewerKey: createViewerKey(FORUM_REAL_VIEW_KEY_PREFIX),
    createdAt: new Date(baseTime.getTime())
  }];

  for (let i = 0; i < delayedViewCount; i += 1) {
    const batchIndex = Math.floor((i * FORUM_DELAYED_VIEW_BATCHES) / delayedViewCount);
    rows.push({
      postId,
      viewerKey: createViewerKey(FORUM_SEEDED_VIEW_KEY_PREFIX),
      createdAt: new Date(baseTime.getTime() + buildDelayedOffset(batchIndex, rng))
    });
  }

  return rows;
}

function toViewTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function pickLegacyLeadersToPromote(rows, maxMs = FORUM_DELAYED_VIEW_MAX_MS, maxBatch = FORUM_MAX_VIEW_COUNT) {
  const sorted = (Array.isArray(rows) ? rows.slice() : []).sort((a, b) => toViewTime(a.createdAt || a.created_at) - toViewTime(b.createdAt || b.created_at));
  const leaders = [];
  let i = 0;
  while (i < sorted.length) {
    const start = sorted[i];
    const startMs = toViewTime(start.createdAt || start.created_at);
    const cluster = [start];
    let j = i + 1;
    while (j < sorted.length && cluster.length < maxBatch) {
      const nextMs = toViewTime(sorted[j].createdAt || sorted[j].created_at);
      if (nextMs - startMs > maxMs) break;
      cluster.push(sorted[j]);
      j += 1;
    }
    if (!cluster.some((row) => isRealForumViewKey(row.viewerKey || row.viewer_key))) {
      leaders.push(start);
    }
    i = j;
  }
  return leaders;
}

function FORUM_REAL_VIEW_COUNT_EXPR(postAlias = 'p') {
  return FORUM_REAL_VIEW_COUNT_SQL.replace(/p\.id/g, `${postAlias}.id`);
}

function FORUM_VISIBLE_VIEW_COUNT_EXPR(postAlias = 'p') {
  return FORUM_VISIBLE_VIEW_COUNT_SQL.replace(/p\.id/g, `${postAlias}.id`);
}

module.exports = {
  FORUM_MIN_VIEW_COUNT,
  FORUM_MAX_VIEW_COUNT,
  FORUM_DELAYED_VIEW_MIN_MS,
  FORUM_DELAYED_VIEW_MAX_MS,
  FORUM_REAL_VIEW_KEY_PREFIX,
  FORUM_SEEDED_VIEW_KEY_PREFIX,
  FORUM_VISIBLE_VIEW_COUNT_SQL,
  FORUM_VISIBLE_VIEW_COUNT_EXPR,
  FORUM_REAL_VIEW_COUNT_SQL,
  FORUM_REAL_VIEW_COUNT_EXPR,
  isRealForumViewKey,
  buildForumViewCount,
  buildForumViewRows,
  pickLegacyLeadersToPromote
};
