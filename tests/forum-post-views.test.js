const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('forum view rows include one immediate row and nine delayed rows within 1-25 minutes', () => {
  const {
    FORUM_DELAYED_VIEW_COUNT,
    FORUM_DELAYED_VIEW_MIN_MS,
    FORUM_DELAYED_VIEW_MAX_MS,
    buildForumViewRows
  } = require('../forum-post-views');

  const now = new Date('2026-06-16T00:00:00.000Z');
  const rows = buildForumViewRows(42, now, () => 0.5);

  assert.equal(FORUM_DELAYED_VIEW_COUNT, 9);
  assert.equal(FORUM_DELAYED_VIEW_MIN_MS, 60 * 1000);
  assert.equal(FORUM_DELAYED_VIEW_MAX_MS, 25 * 60 * 1000);
  assert.equal(rows.length, 10);
  assert.equal(rows[0].postId, 42);
  assert.equal(rows[0].createdAt.getTime(), now.getTime());

  const delayedRows = rows.slice(1);
  assert.equal(delayedRows.length, 9);
  const distinctTimes = new Set(delayedRows.map((row) => row.createdAt.getTime()));
  assert.ok(distinctTimes.size >= 3, 'delayed views should be split across several batches');

  for (const row of delayedRows) {
    const offset = row.createdAt.getTime() - now.getTime();
    assert.ok(offset >= FORUM_DELAYED_VIEW_MIN_MS, `offset ${offset} should be at least 1 minute`);
    assert.ok(offset <= FORUM_DELAYED_VIEW_MAX_MS, `offset ${offset} should be at most 25 minutes`);
  }
});

test('forum visible view count SQL excludes future delayed rows', () => {
  const {
    FORUM_VISIBLE_VIEW_COUNT_SQL,
    FORUM_VISIBLE_VIEW_COUNT_EXPR
  } = require('../forum-post-views');

  assert.match(FORUM_VISIBLE_VIEW_COUNT_SQL, /created_at\s*<=\s*CURRENT_TIMESTAMP\(3\)/i);
  assert.match(FORUM_VISIBLE_VIEW_COUNT_EXPR('p'), /WHERE v\.post_id = p\.id/i);
  assert.match(FORUM_VISIBLE_VIEW_COUNT_EXPR('p'), /created_at\s*<=\s*CURRENT_TIMESTAMP\(3\)/i);
});

test('server integrates delayed forum view helpers for inserts and counts', () => {
  const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

  assert.match(source, /require\('\.\/forum-post-views'\)/);
  assert.match(source, /FORUM_VISIBLE_VIEW_COUNT_EXPR\('p'\)/);
  assert.match(source, /buildForumViewRows\(postId/);
  assert.match(source, /SELECT COUNT\(\*\) AS c FROM forum_post_views WHERE post_id = \? AND created_at <= CURRENT_TIMESTAMP\(3\)/);
});
