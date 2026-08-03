const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let socialFeatures = {};
try {
  socialFeatures = require('../social-features');
} catch (_err) {}

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('points leaderboard assigns shared ranks and keeps a deterministic order', () => {
  assert.equal(typeof socialFeatures.rankPointsRows, 'function');
  const rows = socialFeatures.rankPointsRows([
    { id: 8, username: '乙', points: 120 },
    { id: 3, username: '甲', points: 120 },
    { id: 5, username: '丙', points: 90 }
  ]);
  assert.deepEqual(rows.map((item) => [item.id, item.points, item.rank]), [
    [3, 120, 1],
    [8, 120, 1],
    [5, 90, 3]
  ]);
});

test('chat permits an unfollowed recipient to reply and promotes two-way chats to rate limits', () => {
  assert.equal(typeof socialFeatures.getChatSendPolicy, 'function');
  assert.deepEqual(
    socialFeatures.getChatSendPolicy({ iFollow: false, mutualFollow: false, incomingCount: 0, outgoingCount: 0 }),
    { allowed: false, established: false, limit: 'follow_required' }
  );
  assert.deepEqual(
    socialFeatures.getChatSendPolicy({ iFollow: false, mutualFollow: false, incomingCount: 1, outgoingCount: 0 }),
    { allowed: true, established: false, limit: 'daily' }
  );
  assert.deepEqual(
    socialFeatures.getChatSendPolicy({ iFollow: false, mutualFollow: false, incomingCount: 1, outgoingCount: 1 }),
    { allowed: true, established: true, limit: 'minute' }
  );
  assert.deepEqual(
    socialFeatures.getChatSendPolicy({ iFollow: true, mutualFollow: true, incomingCount: 0, outgoingCount: 0 }),
    { allowed: true, established: false, limit: 'minute' }
  );
  assert.equal(socialFeatures.canReadChatThread({ iFollow: false, followsMe: false, incomingCount: 1, outgoingCount: 0 }), true);
  assert.equal(socialFeatures.canReadChatThread({ iFollow: false, followsMe: false, incomingCount: 0, outgoingCount: 1 }), true);
  assert.equal(socialFeatures.canReadChatThread({ iFollow: false, followsMe: false, incomingCount: 0, outgoingCount: 0 }), false);
});

test('chat send serialization prevents same-conversation limit checks from racing', async () => {
  assert.equal(typeof socialFeatures.createKeyedSerialExecutor, 'function');
  const runSerial = socialFeatures.createKeyedSerialExecutor();
  const events = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const first = runSerial('1:2', async () => {
    events.push('first-start');
    await firstGate;
    events.push('first-end');
  });
  const second = runSerial('1:2', async () => {
    events.push('second-start');
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ['first-start']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, ['first-start', 'first-end', 'second-start']);
});

test('homepage and API expose points ranking, user search, and profile navigation from chat', () => {
  const server = read('server.js');
  const rewards = read('user-rewards.js');
  const home = [
    read('index.html'),
    read('public/function/home.css'),
    read('public/function/home-app.js'),
  ].join('\n');
  const admin = read('public/function/_ops/console-7a9/internal/admin.html');

  assert.match(rewards, /\/api\/me\/points-ranking/);
  assert.match(rewards, /WHERE u\.id = \?[\s\S]*?COALESCE\(u\.is_banned, 0\) = 0/);
  assert.match(server, /\/api\/users\/search/);
  assert.match(home, /openMePointsRankingBtn/);
  assert.match(home, /mePointsRankingModal/);
  assert.match(home, /userSearchHint/);
  assert.match(home, /data-chat-open-profile/);
  assert.match(home, /收到过对方消息，无需回关即可回复/);

  for (const html of [home, admin]) {
    assert.match(html, /积分排行榜/);
    assert.match(html, /用户名搜索/);
    assert.match(html, /免回关回复/);
  }
  assert.match(admin, /新增积分榜与用户名搜索接口/);
  assert.doesNotMatch(admin, /本轮无新增接口、权限点或数据库字段/);
});
