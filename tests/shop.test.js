const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizeShopItemPayload,
  mapShopItemRow,
  shopRewardSummary,
  purchaseShopItem
} = require('../shop');

function getAdminSection(html, pageId) {
  const marker = `id="${pageId}"`;
  const idStart = html.indexOf(marker);
  assert.notEqual(idStart, -1, `missing ${pageId}`);
  const start = html.lastIndexOf('<section', idStart);
  assert.notEqual(start, -1, `missing ${pageId}`);
  const next = html.indexOf('<section class="card page"', idStart + marker.length);
  return html.slice(start, next === -1 ? html.length : next);
}

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

test('purchaseShopItem returns success after applying a points reward', async () => {
  let balance = 20;
  let soldCount = 0;
  const itemRow = {
    id: 7,
    name: 'Points Pack',
    description: '',
    item_type: 'points',
    price_points: 10,
    points_reward: 5,
    membership_days: null,
    stock_limit: 3,
    sold_count: 0,
    enabled: 1,
    sort_order: 0
  };
  const executed = [];
  const deps = {
    async queryOne(sql) {
      if (/FROM shop_items/.test(sql)) return { ...itemRow, sold_count: soldCount };
      if (/FROM users/.test(sql)) {
        return {
          id: 1,
          points: balance,
          membership_status: 'none',
          membership_expires_at: null
        };
      }
      return null;
    },
    async execute(sql, params) {
      executed.push(sql);
      if (/UPDATE users SET points = COALESCE\(points, 0\) - \?/.test(sql)) balance -= Number(params[0] || 0);
      if (/UPDATE users SET points = COALESCE\(points, 0\) \+ \?/.test(sql)) balance += Number(params[0] || 0);
      if (/UPDATE shop_items SET sold_count/.test(sql)) soldCount += 1;
    }
  };

  const result = await purchaseShopItem(deps, 1, 7, { now: new Date('2026-06-13T00:00:00Z') });

  assert.equal(result.error, undefined);
  assert.equal(result.pointsSpent, 10);
  assert.equal(result.pointsAdded, 5);
  assert.equal(result.points, 15);
  assert.equal(balance, 15);
  assert.equal(soldCount, 1);
  assert.equal(executed.some((sql) => /INSERT INTO shop_purchases/.test(sql)), true);
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

test('admin shop page exposes searchable paginated purchase records', () => {
  const shopSource = fs.readFileSync(path.join(__dirname, '..', 'shop.js'), 'utf8');
  const adminHtml = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'function', '_ops', 'console-7a9', 'internal', 'admin.html'),
    'utf8'
  );
  const adminJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'function', 'admin-shop-page.js'), 'utf8');

  assert.match(shopSource, /\/api\/admin\/shop\/purchases/);
  assert.match(shopSource, /JOIN users u ON u\.id = p\.user_id/);
  assert.match(shopSource, /LIMIT \? OFFSET \?/);
  assert.match(adminHtml, /shopPurchaseSearchInput/);
  assert.match(adminHtml, /shopPurchasesTbody/);
  assert.match(getAdminSection(adminHtml, 'page-shop'), /shopPurchaseSearchInput/);
  assert.doesNotMatch(getAdminSection(adminHtml, 'page-admins'), /shopPurchaseSearchInput/);
  assert.match(adminJs, /loadShopPurchasesAdmin/);
  assert.match(adminJs, /shopPurchasePrevBtn/);
  assert.match(adminJs, /shopPurchaseNextBtn/);
});
