const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  getSiteDateKey,
  getPreviousSiteDateKey,
  computeNextStreakDay,
  computeCheckinReward,
  normalizeActivationCodeInput,
  normalizeBatchActivationInput,
  normalizeRedeemCodeInput,
  activationValueLabel,
  applyMembershipFromCode,
  generateActivationCode,
  mapActivationCodeRow
} = require('../user-rewards');

function getAdminSection(html, pageId) {
  const marker = `id="${pageId}"`;
  const idStart = html.indexOf(marker);
  assert.notEqual(idStart, -1, `missing ${pageId}`);
  const start = html.lastIndexOf('<section', idStart);
  assert.notEqual(start, -1, `missing ${pageId}`);
  const next = html.indexOf('<section class="card page"', idStart + marker.length);
  return html.slice(start, next === -1 ? html.length : next);
}

test('getSiteDateKey uses UTC+8 calendar day', () => {
  const key = getSiteDateKey(new Date('2026-06-03T18:00:00.000Z'));
  assert.equal(key, '2026-06-04');
});

test('computeNextStreakDay continues from yesterday', () => {
  const today = '2026-06-04';
  const next = computeNextStreakDay({ check_in_date: '2026-06-03', streak_day: 3 }, today);
  assert.equal(next, 4);
});

test('computeNextStreakDay resets after gap', () => {
  const next = computeNextStreakDay({ check_in_date: '2026-06-01', streak_day: 5 }, '2026-06-04');
  assert.equal(next, 1);
});

test('computeNextStreakDay resets cycle after day 7', () => {
  const yesterday = getPreviousSiteDateKey('2026-06-08');
  const next = computeNextStreakDay({ check_in_date: yesterday, streak_day: 7 }, '2026-06-08');
  assert.equal(next, 1);
});

test('computeCheckinReward awards streak bonus on day 7', () => {
  const reward = computeCheckinReward(7);
  assert.equal(reward.pointsEarned, 7);
  assert.equal(reward.bonusAwarded, true);
  const normal = computeCheckinReward(3);
  assert.equal(normal.pointsEarned, 2);
  assert.equal(normal.bonusAwarded, false);
});

test('normalizeActivationCodeInput validates points and membership payloads', () => {
  const points = normalizeActivationCodeInput({ type: 'points', pointsAmount: 50, maxUses: 3 });
  assert.equal(points.type, 'points');
  assert.equal(points.pointsAmount, 50);
  assert.equal(points.maxUses, 3);

  const membership = normalizeActivationCodeInput({ type: 'membership', membershipDays: 30 });
  assert.equal(membership.membershipDays, 30);

  const lifetime = normalizeActivationCodeInput({ type: 'membership', membershipDays: 0 });
  assert.equal(lifetime.membershipDays, 0);

  const combo = normalizeActivationCodeInput({ type: 'combo', pointsAmount: 10, membershipDays: 7, maxUses: 0 });
  assert.equal(combo.type, 'combo');
  assert.equal(combo.maxUses, 0);
  assert.equal(combo.perUserLimit, 1);

  const bad = normalizeActivationCodeInput({ type: 'points', pointsAmount: 0 });
  assert.equal(bad.error, 'BAD_POINTS_AMOUNT');
});

test('normalizeBatchActivationInput parses batch options', () => {
  const batch = normalizeBatchActivationInput({
    count: 5,
    codeLength: 10,
    prefix: 'VIP',
    type: 'points',
    pointsAmount: 20
  });
  assert.equal(batch.count, 5);
  assert.equal(batch.prefix, 'VIP');
  assert.equal(batch.template.pointsAmount, 20);
});

test('activationValueLabel supports combo', () => {
  const label = activationValueLabel({
    type: 'combo',
    pointsAmount: 30,
    membershipDays: 0
  });
  assert.match(label, /30 积分/);
  assert.match(label, /永久会员/);
});

test('normalizeRedeemCodeInput uppercases and trims', () => {
  const parsed = normalizeRedeemCodeInput({ code: ' ab-12xy ' });
  assert.equal(parsed.code, 'AB-12XY');
});

test('applyMembershipFromCode extends active membership', () => {
  const now = new Date('2026-06-01T00:00:00.000Z');
  const next = applyMembershipFromCode('active', '2026-06-10T00:00:00.000Z', 7, now);
  assert.equal(next.membershipStatus, 'active');
  assert.equal(next.membershipExpiresAt.toISOString(), '2026-06-17T00:00:00.000Z');
});

test('applyMembershipFromCode supports lifetime', () => {
  const next = applyMembershipFromCode('none', null, 0, new Date());
  assert.equal(next.membershipStatus, 'lifetime');
  assert.equal(next.membershipExpiresAt, null);
});

test('generateActivationCode returns uppercase-like tokens', () => {
  const code = generateActivationCode(12);
  assert.equal(code.length, 12);
  assert.match(code, /^[A-Z0-9]+$/);
});

test('mapActivationCodeRow computes remaining uses', () => {
  const row = mapActivationCodeRow({ id: 1, code: 'ABC', type: 'points', max_uses: 5, use_count: 2 });
  assert.equal(row.remainingUses, 3);
});

test('server mounts user rewards routes and pages include UI hooks', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const adminHtml = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'function', '_ops', 'console-7a9', 'internal', 'admin.html'),
    'utf8'
  );
  assert.match(serverSource, /mountUserRewardsRoutes\(/);
  assert.match(serverSource, /ensureUserRewardsSchema\(/);
  assert.match(indexHtml, /meCheckInBtn/);
  assert.match(indexHtml, /meRedeemCodeBtn/);
  assert.match(indexHtml, /meShopGrid/);
  assert.match(adminHtml, /data-page="activation-codes"/);
  assert.match(adminHtml, /activationBatchCreateBtn/);
  assert.match(adminHtml, /admin-activation-codes-page\.js/);
});

test('admin activation codes page exposes searchable paginated redemption records', () => {
  const rewardsSource = fs.readFileSync(path.join(__dirname, '..', 'user-rewards.js'), 'utf8');
  const adminHtml = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'function', '_ops', 'console-7a9', 'internal', 'admin.html'),
    'utf8'
  );
  const adminJs = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'function', 'admin-activation-codes-page.js'),
    'utf8'
  );

  assert.match(rewardsSource, /\/api\/admin\/activation-codes\/redemptions/);
  assert.match(rewardsSource, /JOIN users u ON u\.id = r\.user_id/);
  assert.match(rewardsSource, /LIMIT \? OFFSET \?/);
  assert.match(adminHtml, /activationRedemptionSearchInput/);
  assert.match(adminHtml, /activationRedemptionsTbody/);
  assert.match(getAdminSection(adminHtml, 'page-activation-codes'), /activationRedemptionSearchInput/);
  assert.doesNotMatch(getAdminSection(adminHtml, 'page-moderators'), /activationRedemptionSearchInput/);
  assert.match(adminJs, /loadActivationRedemptionsAdmin/);
  assert.match(adminJs, /activationRedemptionPrevBtn/);
  assert.match(adminJs, /activationRedemptionNextBtn/);
});
