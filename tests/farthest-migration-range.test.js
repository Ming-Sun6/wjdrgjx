const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const api = require('../public/function/farthest-migration-range.js');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function makeUniformSchedule(rangeCount) {
  const ranges = [];
  const dates = [];
  for (let i = 0; i < rangeCount; i++) {
    ranges.push((i * 14 + 1) + '~' + ((i + 1) * 14));
    dates.push(api.addDays('2024-01-01', i * 14));
  }
  return api.buildSchedule({
    ranges: ranges,
    intervalDays: 14,
    rangeStartDates: dates,
    anchorDate: '2024-01-01'
  });
}

test('furnace spans divide into the published neighbor hop counts', () => {
  assert.equal(api.theoreticalHops(90, 14).toFixed(3), '6.429');
  assert.equal(api.theoreticalHops(120, 14).toFixed(3), '8.571');
  assert.equal(api.theoreticalHops(180, 14).toFixed(3), '12.857');
  assert.equal(api.remainderDays(90, 14), 6);
  assert.equal(api.remainderDays(120, 14), 8);
  assert.equal(api.remainderDays(180, 14), 12);
  assert.equal(api.formatHops(90 / 14), '6.429');
});

test('server open dates are 145 days before interpolated furnace-five dates', () => {
  const schedule = makeUniformSchedule(20);
  assert.equal(api.FC5_FROM_OPEN_DAYS, 145);
  assert.equal(api.serialToDateStr(api.serverFc5Serial(schedule, 1)), '2024-01-01');
  assert.equal(api.serialToDateStr(api.serverOpenSerial(schedule, 1)), '2023-08-09');
  assert.equal(api.serialToDateStr(api.serverFc5Serial(schedule, 15)), '2024-01-15');
  assert.equal(api.serialToDateStr(api.serverOpenSerial(schedule, 15)), '2023-08-23');
  assert.equal(api.serialToDateStr(api.serverFc5Serial(schedule, 141)), '2024-05-20');
  assert.equal(api.serialToDateStr(api.serverOpenSerial(schedule, 141)), '2023-12-27');
  const origin = api.serverOpenSerial(schedule, 141);
  const edge = api.serverOpenSerial(schedule, 51);
  assert.equal(Math.round(origin - edge), 90);
  assert.equal(Math.round(api.serverFc5Serial(schedule, 141) - origin), 145);
});

test('forward and backward farthest servers are computed separately to the exact zone', () => {
  const schedule = makeUniformSchedule(20);
  const result = api.lookup(schedule, 141, 90);
  assert.equal(result.origin.server, 141);
  assert.equal(result.older.server, 51);
  assert.equal(result.older.daysRounded, 90);
  assert.equal(result.newer.server, 231);
  assert.equal(result.newer.daysRounded, 90);
  assert.notEqual(result.older.range, result.origin.range);
  assert.notEqual(result.newer.range, result.origin.range);
});

test('a later server in the same band cannot reach as old a zone but can reach a newer zone', () => {
  const schedule = makeUniformSchedule(20);
  const start = api.lookup(schedule, 141, 90);
  const late = api.lookup(schedule, 154, 90);
  assert.equal(start.origin.range, late.origin.range);
  assert.ok(late.older.server > start.older.server);
  assert.ok(late.newer.server > start.newer.server);
});

test('target compare reports direction and furnace reachability', () => {
  const schedule = makeUniformSchedule(20);
  const inside = api.compareTarget(schedule, 141, 51);
  assert.equal(inside.direction, 'older');
  assert.equal(inside.reachable.FC5, true);
  assert.equal(inside.reachable.FC8, true);
  const outside = api.compareTarget(schedule, 141, 50);
  assert.equal(outside.direction, 'older');
  assert.equal(outside.reachable.FC5, false);
  assert.equal(outside.reachable.FC8, true);
  const newer = api.compareTarget(schedule, 141, 231);
  assert.equal(newer.direction, 'newer');
  assert.equal(newer.reachable.FC5, true);
});

test('current furnace maps to 90 / 120 / 180 day spans', () => {
  const schedule = makeUniformSchedule(20);
  const fc5 = api.detectFurnace(schedule, 141, api.dateToSerial('2024-05-20'));
  const fc8 = api.detectFurnace(schedule, 141, api.dateToSerial('2024-11-04'));
  const fc10 = api.detectFurnace(schedule, 141, api.dateToSerial('2025-04-21'));
  assert.equal(fc5.key, 'FC5');
  assert.equal(fc5.days, 90);
  assert.equal(fc8.key, 'FC8');
  assert.equal(fc8.days, 120);
  assert.equal(fc10.key, 'FC10');
  assert.equal(fc10.days, 180);
});

test('a zone is not furnace-five until 145 days after it opens', () => {
  const schedule = makeUniformSchedule(20);
  const before = api.detectFurnace(schedule, 141, api.dateToSerial('2024-05-19'));
  const onDay = api.detectFurnace(schedule, 141, api.dateToSerial('2024-05-20'));
  assert.equal(before.key, 'PRE');
  assert.equal(before.days, 0);
  assert.equal(onDay.key, 'FC5');
  assert.equal(onDay.days, 90);
});

test('war academy and hero gens still count as the last opened furnace span', () => {
  const schedule = makeUniformSchedule(20);
  const beforeFc8 = api.detectFurnace(schedule, 141, api.dateToSerial('2024-11-03'));
  assert.equal(beforeFc8.key, 'FC5');
  assert.equal(beforeFc8.days, 90);
});

test('upcoming immigration dates follow the prediction interval after the last history mark', () => {
  const upcoming = api.upcomingImmigrationDates(
    { dates: api.DEFAULT_HISTORY_DATES, intervalDays: 28, rules: { displayOffsetDays: 1 } },
    '2026-09-03',
    4
  );
  assert.equal(upcoming[0].date, '2026-09-13');
  assert.equal(upcoming[0].displayDate, '2026-09-14');
  assert.equal(upcoming[1].date, '2026-10-11');
  assert.equal(upcoming[1].displayDate, '2026-10-12');
});

test('september prediction group for 755 is 743 to 918', () => {
  const { defaultNeighborProgressConfig } = require('../neighbor-progress-config');
  const schedule = api.applyNeighborProgress(defaultNeighborProgressConfig());
  const group = api.predictionGroup(schedule, 755, '2026-09-13');
  assert.equal(group.lo, 743);
  assert.equal(group.hi, 918);
  assert.match(group.progressText, /火10/);
  const current = api.lookupCurrent(schedule, 755, '2026-09-03');
  assert.equal(current.furnace.key, 'FC10');
  assert.ok(current.newer.server > 918);
  const plan = api.planHopsToTarget(schedule, 755, 3333, {
    asOfDate: '2026-09-03',
    historyConfig: { dates: api.DEFAULT_HISTORY_DATES, intervalDays: 28, rules: { displayOffsetDays: 1 } }
  });
  assert.equal(plan.steps[0].label, '下期');
  assert.equal(plan.steps[0].date, '2026-09-13');
  assert.equal(plan.steps[0].to, 918);
  assert.equal(plan.steps[0].reached, false);
  assert.equal(plan.beyondSpan, true);
  assert.equal(plan.reached, false);
  assert.ok(plan.steps[0].to < 2285);
  const over = plan.steps.filter(function (step) { return step.overCap; });
  assert.ok(over.length >= 2);
  assert.equal(over[0].to, 2441);
  assert.ok(over[1].to > 2441);
  const last = plan.steps[plan.steps.length - 1];
  assert.equal(last.overCap, true);
  assert.ok(last.to >= 3333);
});

test('unreachable targets keep forecasting through every immigration period', () => {
  const { defaultNeighborProgressConfig } = require('../neighbor-progress-config');
  const schedule = api.applyNeighborProgress(defaultNeighborProgressConfig());
  const historyConfig = { dates: api.DEFAULT_HISTORY_DATES, intervalDays: 28, rules: { displayOffsetDays: 1 } };
  const dates = api.upcomingImmigrationDates(historyConfig, '2026-09-03');
  const plan = api.planHopsToTarget(schedule, 755, 2500, {
    asOfDate: '2026-09-03',
    historyConfig: historyConfig
  });
  assert.equal(plan.reached, false);
  assert.equal(plan.beyondSpan, true);
  assert.equal(plan.steps.length, dates.length);
  assert.ok(plan.steps.length > 8);
  const inGroupStep = plan.steps.find(function (step) {
    return step.to >= 2500 && step.to <= step.group.hi;
  });
  assert.ok(inGroupStep);
  assert.equal(inGroupStep.overCap, true);
  assert.notEqual(plan.steps[plan.steps.length - 1].index, inGroupStep.index);
});

test('steps past the 180-day farthest zone are flagged over cap', () => {
  const { defaultNeighborProgressConfig } = require('../neighbor-progress-config');
  const schedule = api.applyNeighborProgress(defaultNeighborProgressConfig());
  const plan = api.planHopsToTarget(schedule, 755, 2888, {
    asOfDate: '2026-09-03',
    historyConfig: { dates: api.DEFAULT_HISTORY_DATES, intervalDays: 28, rules: { displayOffsetDays: 1 } }
  });
  assert.equal(plan.capServer, 2285);
  assert.equal(plan.beyondSpan, true);
  assert.equal(plan.reached, false);
  let prev = 755;
  plan.steps.forEach(function (step) {
    assert.ok(step.to >= prev);
    if (step.to > 2285) assert.equal(step.overCap, true);
    else assert.equal(step.overCap, false);
    prev = step.to;
  });
  const over = plan.steps.filter(function (step) { return step.overCap; });
  assert.ok(over.length >= 3);
  assert.equal(over[0].to, 2441);
  assert.equal(over[1].to, 2577);
  assert.equal(over[2].to, 2731);
  const last = plan.steps[plan.steps.length - 1];
  assert.equal(last.overCap, true);
  assert.ok(last.to >= 2888);
});

test('period list only moves toward the target and never backward', () => {
  const { defaultNeighborProgressConfig } = require('../neighbor-progress-config');
  const schedule = api.applyNeighborProgress(defaultNeighborProgressConfig());
  const plan = api.planHopsToTarget(schedule, 2041, 2999, {
    asOfDate: '2026-09-03',
    historyConfig: { dates: api.DEFAULT_HISTORY_DATES, intervalDays: 28, rules: { displayOffsetDays: 1 } }
  });
  assert.equal(plan.beyondSpan, false);
  assert.equal(plan.steps[0].date, '2026-09-13');
  let prev = 2041;
  plan.steps.forEach(function (step) {
    assert.equal(step.from, 2041);
    assert.ok(step.to >= prev);
    prev = step.to;
  });
});

test('furnace-ten age window for 2041 reaches the 3177 band', () => {
  const { defaultNeighborProgressConfig } = require('../neighbor-progress-config');
  const schedule = api.applyNeighborProgress(defaultNeighborProgressConfig());
  const current = api.lookupCurrent(schedule, 2041, '2026-09-03');
  assert.equal(current.furnace.key, 'FC10');
  assert.equal(current.furnace.days, 180);
  assert.equal(current.newer.daysRounded, 180);
  assert.ok(current.newer.server >= 3076);
  assert.ok(current.newer.server <= 3236);
});

test('home pages and the tool shell expose farthest migration range', () => {
  const home = read('index.html');
  const publicHome = read('public/index.html');
  const page = read('public/function/farthest-migration-range.html');
  assert.match(home, /data-tool-id="farthest-migration-range"/);
  assert.match(publicHome, /data-tool-id="farthest-migration-range"/);
  assert.match(home, /function\/farthest-migration-range\.html/);
  assert.match(page, /往前最远区/);
  assert.match(page, /往后最远区/);
  assert.match(page, /目标区/);
  assert.match(page, /仅供参考，请以游戏内为准/);
  assert.doesNotMatch(page, /三档最远区号/);
  assert.match(page, /farthest-migration-range\.js\?v=20260903-11/);
  assert.match(page, /overCap/);
  assert.match(page, /pill ok zone/);
  assert.match(page, /property="og:image"/);
});
