const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('publisher forum view range defaults to last 7 local days', () => {
  const { parsePublisherForumViewRange } = require('../publisher-forum-stats');
  const now = new Date(2026, 8, 2, 15, 30, 0);
  const range = parsePublisherForumViewRange({}, now);
  assert.equal(range.days, 7);
  assert.equal(range.from.getFullYear(), 2026);
  assert.equal(range.from.getMonth(), 7);
  assert.equal(range.from.getDate(), 27);
  assert.equal(range.from.getHours(), 0);
  assert.ok(range.to.getTime() >= now.getTime() - 1000);
});

test('publisher forum view range accepts today, all, and custom dates', () => {
  const { parsePublisherForumViewRange } = require('../publisher-forum-stats');
  const now = new Date(2026, 8, 2, 15, 30, 0);

  const today = parsePublisherForumViewRange({ days: 1 }, now);
  assert.equal(today.days, 1);
  assert.equal(today.from.getDate(), 2);
  assert.equal(today.from.getHours(), 0);

  const all = parsePublisherForumViewRange({ range: 'all' }, now);
  assert.equal(all.days, 0);
  assert.equal(all.from.getTime(), 0);

  const custom = parsePublisherForumViewRange({ from: '2026-08-01', to: '2026-08-10' }, now);
  assert.equal(custom.from.getMonth(), 7);
  assert.equal(custom.from.getDate(), 1);
  assert.equal(custom.to.getDate(), 10);
  assert.equal(custom.to.getHours(), 23);
});

test('publisher forum stats reads fact table and ad slot events, not inflated view keys', async () => {
  const { createPublisherForumStatsService } = require('../publisher-forum-stats');
  const calls = [];
  const service = createPublisherForumStatsService({
    queryOne: async (sql) => {
      calls.push(['one', sql]);
      if (/analytics_events/.test(sql)) return { homePv: 20, homeUv: 8, forumPv: 12, forumUv: 5 };
      if (/COUNT\(\*\) AS total/.test(sql)) return { total: 1 };
      return { users: 1, posts: 2, realViews: 4, realUv: 3, recentViews: 1, recentUv: 1 };
    },
    queryRows: async (sql, params) => {
      calls.push(['rows', sql, params]);
      if (/AS postCount/.test(sql)) {
        return [{ userId: 9, username: '飞菇', loginId: 'feigu', postCount: 2, realViews: 4, realUv: 3, recentViews: 1, recentUv: 1 }];
      }
      return [
        { id: 21, userId: 9, title: '攻略A', status: 'approved', createdAt: '2026-08-01', realViews: 3, realUv: 2, recentViews: 1, recentUv: 1, displayViews: 18 },
        { id: 22, userId: 9, title: '攻略B', status: 'approved', createdAt: '2026-08-02', realViews: 1, realUv: 1, recentViews: 0, recentUv: 0, displayViews: 6 }
      ];
    }
  });

  const result = await service.getAuthorViewStats({ days: 7, q: '飞菇' });
  const sql = calls.map((c) => c[1]).join('\n');
  assert.equal(result.summary.realViews, 4);
  assert.equal(result.summary.realUv, 3);
  assert.equal(result.ads.homePv, 20);
  assert.equal(result.ads.forumUv, 5);
  assert.equal(result.users[0].posts[0].displayViews, 18);
  assert.match(sql, /forum_post_reads/);
  assert.match(sql, /analytics_events/);
  assert.doesNotMatch(sql, /viewer_key LIKE 'r:%'/);
  assert.doesNotMatch(sql, /forum_view_real_backfill/);
});

test('admin publisher page and server expose split ads plus fact-table stats', () => {
  const server = read('server.js');
  const admin = read('public/function/_ops/console-7a9/internal/admin.html');
  const stats = read('publisher-forum-stats.js');
  const tracker = read('public/function/analytics-tracker.js');

  assert.match(server, /createPublisherForumStatsService/);
  assert.match(server, /CREATE TABLE IF NOT EXISTS forum_post_reads/);
  assert.match(admin, /id="publisherAdSummary"/);
  assert.match(admin, /内容真实阅读/);
  assert.match(admin, /前台展示量/);
  assert.match(admin, /本方案上线后/);
  assert.match(stats, /forum_post_reads/);
  assert.doesNotMatch(stats, /FORUM_VIEW_REAL_BACKFILL_SETTING/);
  assert.match(tracker, /function scheduleForumQualifiedRead/);
  assert.match(tracker, /scopeKey/);
  assert.match(tracker, /forum_post:/);
});
