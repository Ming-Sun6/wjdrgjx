const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizeShopItemPayload,
  mapShopItemRow,
  shopRewardSummary
} = require('../shop');

test('normalizeShopItemPayload validates membership item', () => {
  const item = normalizeShopItemPayload({
    name: '月度会员',
    itemType: 'membership',
    pricePoints: 120,
    membershipDays: 30
  });
  assert.equal(item.itemType, 'membership');
  assert.equal(item.pricePoints, 120);
  assert.equal(item.membershipDays, 30);
});

test('normalizeShopItemPayload supports combo item', () => {
  const item = normalizeShopItemPayload({
    name: '豪华礼包',
    itemType: 'combo',
    pricePoints: 200,
    pointsReward: 50,
    membershipDays: 7
  });
  assert.equal(item.pointsReward, 50);
  assert.equal(item.membershipDays, 7);
});

test('mapShopItemRow computes remaining stock', () => {
  const row = mapShopItemRow({
    id: 1,
    name: '测试',
    item_type: 'membership',
    price_points: 10,
    membership_days: 30,
    stock_limit: 5,
    sold_count: 2,
    enabled: 1,
    sort_order: 0
  });
  assert.equal(row.remainingStock, 3);
});

test('shopRewardSummary formats combo reward', () => {
  const text = shopRewardSummary({
    itemType: 'combo',
    pointsReward: 20,
    membershipDays: 0
  });
  assert.match(text, /\+20 积分/);
  assert.match(text, /永久会员/);
});

test('server mounts shop routes and admin pages include shop UI', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const adminHtml = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'function', '_ops', 'console-7a9', 'internal', 'admin.html'),
    'utf8'
  );
  assert.match(serverSource, /mountShopRoutes\(/);
  assert.match(indexHtml, /meShopGrid/);
  assert.match(adminHtml, /data-page="shop"/);
  assert.match(adminHtml, /admin-shop-page\.js/);
});
