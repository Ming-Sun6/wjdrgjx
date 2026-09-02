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

test('publisher forum stats counts only real view keys and can expand posts', async () => {
  const { createPublisherForumStatsService } = require('../publisher-forum-stats');
  const calls = [];
  const service = createPublisherForumStatsService({
    getSetting: async () => ({ doneAt: '2026-09-01T00:00:00.000Z' }),
    setSetting: async () => {},
    queryOne: async (sql) => {
      calls.push(['one', sql]);
      if (/COUNT\(\*\) AS total/.test(sql)) return { total: 1 };
      return { users: 1, posts: 2, realViews: 4, recentViews: 1 };
    },
    queryRows: async (sql, params) => {
      calls.push(['rows', sql, params]);
      if (/AS postCount/.test(sql)) {
        return [{ userId: 9, username: '飞菇', loginId: 'feigu', postCount: 2, realViews: 4, recentViews: 1 }];
      }
      return [
        { id: 21, userId: 9, title: '攻略A', status: 'approved', createdAt: '2026-08-01', realViews: 3, recentViews: 1 },
        { id: 22, userId: 9, title: '攻略B', status: 'approved', createdAt: '2026-08-02', realViews: 1, recentViews: 0 }
      ];
    }
  });

  const result = await service.getAuthorViewStats({ days: 7, q: '飞菇' });
  assert.equal(result.summary.realViews, 4);
  assert.equal(result.summary.recentViews, 1);
  assert.equal(result.users.length, 1);
  assert.equal(result.users[0].username, '飞菇');
  assert.equal(result.users[0].posts.length, 2);
  assert.equal(result.users[0].posts[0].realViews, 3);
  assert.match(calls.map((c) => c[1]).join('\n'), /viewer_key LIKE 'r:%'/);
  assert.doesNotMatch(calls.map((c) => c[1]).join('\n'), /created_at <= CURRENT_TIMESTAMP/);
});

test('admin publisher page and server expose split ad switches plus real view stats', () => {
  const server = read('server.js');
  const admin = read('public/function/_ops/console-7a9/internal/admin.html');
  const stats = read('publisher-forum-stats.js');

  assert.match(server, /createPublisherForumStatsService/);
  assert.match(server, /homeAdEnabled: publisher\.homeAdEnabled/);
  assert.match(server, /forumAdEnabled: publisher\.forumAdEnabled/);
  assert.match(admin, /id="publisherHomeAdEnabled"/);
  assert.match(admin, /id="publisherForumAdEnabled"/);
  assert.match(admin, /id="publisherUserFilter"/);
  assert.match(admin, /data-days="7"/);
  assert.match(admin, /真实总浏览/);
  assert.match(admin, /区间新增浏览/);
  assert.match(admin, /publisher-expand/);
  assert.match(stats, /FORUM_VIEW_REAL_BACKFILL_SETTING/);
  assert.match(stats, /pickLegacyLeadersToPromote/);
});
