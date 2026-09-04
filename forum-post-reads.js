const FORUM_READ_DEDUP_MS = 30 * 60 * 1000;
const FORUM_READ_MIN_VISIBLE_MS = 2500;
const HOME_AD_PAGE_KEYS = ['rukou', 'index', 'public/index'];
const FORUM_POST_PAGE_KEY = 'function/forum-post';
const TOOL_AD_PAGE_KEYS = [
  'function/farthest-migration-range',
  'function/neighbor-progress',
  'function/history-immigration-group',
  'function/migration-prediction',
  'function/jisuan'
];
const RANGE_AD_PAGE_KEY = TOOL_AD_PAGE_KEYS[0];

function shouldCountRealRead(input) {
  const visitorId = String((input && input.visitorId) || '').trim();
  if (!visitorId) return false;
  if (input && input.isAuthor) return false;
  if (input && input.isAdmin) return false;
  return true;
}

function isHomeAdPageKey(pageKey) {
  return HOME_AD_PAGE_KEYS.indexOf(String(pageKey || '')) >= 0;
}

function isForumPostPageKey(pageKey) {
  return String(pageKey || '') === FORUM_POST_PAGE_KEY;
}

function isRangeAdPageKey(pageKey) {
  return isToolAdPageKey(pageKey);
}

function isToolAdPageKey(pageKey) {
  return TOOL_AD_PAGE_KEYS.indexOf(String(pageKey || '')) >= 0;
}

async function applyQualifiedForumRead(deps, input) {
  const services = deps || {};
  const queryOne = services.queryOne;
  const execute = services.execute;
  const buildForumViewRows = services.buildForumViewRows;
  const pgDatabase = !!services.pgDatabase;
  const postId = Number(input && input.postId);
  const now = (input && input.now instanceof Date) ? input.now : new Date();
  const visitorId = String((input && input.visitorId) || '').trim();
  const userId = Number.isFinite(Number(input && input.userId)) ? Number(input.userId) : null;

  let recorded = false;
  if (shouldCountRealRead(input) && Number.isFinite(postId) && postId > 0) {
    const recent = await queryOne(
      'SELECT id FROM forum_post_reads WHERE post_id = ? AND visitor_id = ? AND created_at >= ? LIMIT 1',
      [postId, visitorId, new Date(now.getTime() - FORUM_READ_DEDUP_MS)]
    );
    if (!recent) {
      await execute(
        'INSERT INTO forum_post_reads (post_id, visitor_id, user_id, created_at) VALUES (?, ?, ?, ?)',
        [postId, visitorId, userId, now]
      );
      recorded = true;
    }
  }

  if (recorded && typeof buildForumViewRows === 'function') {
    const viewRows = buildForumViewRows(postId, now);
    for (const viewRow of viewRows) {
      if (pgDatabase) {
        await execute(
          'INSERT INTO forum_post_views (post_id, viewer_key, created_at) VALUES (?, ?, ?) ON CONFLICT (post_id, viewer_key) DO NOTHING',
          [viewRow.postId, viewRow.viewerKey, viewRow.createdAt]
        );
      } else {
        await execute(
          'INSERT IGNORE INTO forum_post_views (post_id, viewer_key, created_at) VALUES (?, ?, ?)',
          [viewRow.postId, viewRow.viewerKey, viewRow.createdAt]
        );
      }
    }
  }

  const cnt = await queryOne(
    'SELECT COUNT(*) AS c FROM forum_post_views WHERE post_id = ? AND created_at <= CURRENT_TIMESTAMP(3)',
    [postId]
  );
  return {
    recorded,
    viewCount: Math.max(0, Number(cnt && cnt.c || 0))
  };
}

module.exports = {
  FORUM_READ_DEDUP_MS,
  FORUM_READ_MIN_VISIBLE_MS,
  HOME_AD_PAGE_KEYS,
  FORUM_POST_PAGE_KEY,
  RANGE_AD_PAGE_KEY,
  TOOL_AD_PAGE_KEYS,
  shouldCountRealRead,
  isHomeAdPageKey,
  isForumPostPageKey,
  isRangeAdPageKey,
  isToolAdPageKey,
  applyQualifiedForumRead
};
