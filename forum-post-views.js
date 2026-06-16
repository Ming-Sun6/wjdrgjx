const crypto = require('crypto');

const FORUM_DELAYED_VIEW_COUNT = 9;
const FORUM_DELAYED_VIEW_MIN_MS = 60 * 1000;
const FORUM_DELAYED_VIEW_MAX_MS = 25 * 60 * 1000;
const FORUM_DELAYED_VIEW_BATCHES = 3;
const FORUM_VISIBLE_VIEW_COUNT_SQL =
  '(SELECT COUNT(*) FROM forum_post_views v WHERE v.post_id = p.id AND v.created_at <= CURRENT_TIMESTAMP(3))';

function clampRandom(rng) {
  const n = typeof rng === 'function' ? Number(rng()) : Math.random();
  if (!Number.isFinite(n)) return 0;
  return Math.min(0.999999, Math.max(0, n));
}

function createViewerKey() {
  return `v:${crypto.randomUUID()}`;
}

function buildDelayedOffset(batchIndex, rng) {
  const span = FORUM_DELAYED_VIEW_MAX_MS - FORUM_DELAYED_VIEW_MIN_MS;
  const segment = span / FORUM_DELAYED_VIEW_BATCHES;
  return Math.round(FORUM_DELAYED_VIEW_MIN_MS + (batchIndex * segment) + (clampRandom(rng) * segment));
}

function buildForumViewRows(postId, now = new Date(), rng = Math.random) {
  const baseTime = now instanceof Date ? now : new Date(now);
  const rows = [{
    postId,
    viewerKey: createViewerKey(),
    createdAt: new Date(baseTime.getTime())
  }];

  for (let i = 0; i < FORUM_DELAYED_VIEW_COUNT; i += 1) {
    const batchIndex = Math.floor((i * FORUM_DELAYED_VIEW_BATCHES) / FORUM_DELAYED_VIEW_COUNT);
    rows.push({
      postId,
      viewerKey: createViewerKey(),
      createdAt: new Date(baseTime.getTime() + buildDelayedOffset(batchIndex, rng))
    });
  }

  return rows;
}

function FORUM_VISIBLE_VIEW_COUNT_EXPR(postAlias = 'p') {
  return FORUM_VISIBLE_VIEW_COUNT_SQL.replace(/p\.id/g, `${postAlias}.id`);
}

module.exports = {
  FORUM_DELAYED_VIEW_COUNT,
  FORUM_DELAYED_VIEW_MIN_MS,
  FORUM_DELAYED_VIEW_MAX_MS,
  FORUM_VISIBLE_VIEW_COUNT_SQL,
  FORUM_VISIBLE_VIEW_COUNT_EXPR,
  buildForumViewRows
};
