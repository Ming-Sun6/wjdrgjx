const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FORUM_READ_DEDUP_MS,
  shouldCountRealRead,
  applyQualifiedForumRead,
  isToolAdPageKey
} = require('../forum-post-reads');

test('real reads skip authors, admins, and missing visitors', () => {
  assert.equal(shouldCountRealRead({ visitorId: 'abc', isAuthor: false, isAdmin: false }), true);
  assert.equal(shouldCountRealRead({ visitorId: '', isAuthor: false, isAdmin: false }), false);
  assert.equal(shouldCountRealRead({ visitorId: 'abc', isAuthor: true, isAdmin: false }), false);
  assert.equal(shouldCountRealRead({ visitorId: 'abc', isAuthor: false, isAdmin: true }), false);
  assert.equal(FORUM_READ_DEDUP_MS, 30 * 60 * 1000);
});

test('tool ad page keys cover front-end tools and skip admin or account pages', () => {
  assert.equal(isToolAdPageKey('function/equipment-training-calculator'), true);
  assert.equal(isToolAdPageKey('function/BeaPit.html'), true);
  assert.equal(isToolAdPageKey('map-tool/index'), true);
  assert.equal(isToolAdPageKey('function/forum-post'), false);
  assert.equal(isToolAdPageKey('function/bearpit-collect.html'), false);
  assert.equal(isToolAdPageKey('function/my'), false);
  assert.equal(isToolAdPageKey('function/_ops/console-7a9/internal/admin'), false);
  assert.equal(isToolAdPageKey('function/aeroplane-chess/admin'), false);
});

test('qualified read inserts one fact row and display rows only when accepted', async () => {
  const inserts = [];
  const result = await applyQualifiedForumRead({
    queryOne: async (sql) => {
      if (/forum_post_reads/.test(sql)) return null;
      return { c: 11 };
    },
    execute: async (sql, params) => { inserts.push([sql, params]); },
    buildForumViewRows: (postId, now) => ([
      { postId, viewerKey: 'r:1', createdAt: now },
      { postId, viewerKey: 'v:2', createdAt: now }
    ]),
    pgDatabase: false
  }, {
    postId: 9,
    visitorId: 'aabbccddeeff00112233445566778899',
    userId: 3,
    isAuthor: false,
    isAdmin: false,
    now: new Date('2026-09-02T03:00:00.000Z')
  });

  assert.equal(result.recorded, true);
  assert.equal(result.viewCount, 11);
  assert.equal(inserts.length, 3);
  assert.match(inserts[0][0], /INSERT INTO forum_post_reads/);
  assert.match(inserts[1][0], /INSERT IGNORE INTO forum_post_views/);
});

test('recent duplicate visitor does not write another real or display batch', async () => {
  const inserts = [];
  const result = await applyQualifiedForumRead({
    queryOne: async (sql) => {
      if (/forum_post_reads/.test(sql)) return { id: 1 };
      return { c: 4 };
    },
    execute: async (sql, params) => { inserts.push([sql, params]); },
    buildForumViewRows: () => [{ postId: 9, viewerKey: 'r:x', createdAt: new Date() }],
    pgDatabase: false
  }, {
    postId: 9,
    visitorId: 'aabbccddeeff00112233445566778899',
    isAuthor: false,
    isAdmin: false
  });

  assert.equal(result.recorded, false);
  assert.equal(inserts.length, 0);
  assert.equal(result.viewCount, 4);
});
