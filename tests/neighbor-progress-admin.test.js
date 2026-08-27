const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const config = require('../neighbor-progress-config');

function loadNeighborProgressAdminContext() {
  const script = fs.readFileSync(path.join(__dirname, '..', 'public/function/admin-neighbor-progress-page.js'), 'utf8');
  const context = {
    window: {},
    document: {
      getElementById() { return null; },
      addEventListener() {}
    }
  };
  vm.createContext(context);
  vm.runInContext(script, context, { filename: 'admin-neighbor-progress-page.js' });
  return context;
}

test('neighbor progress config generates stage dates every 14 days', () => {
  const result = config.generateStageDates('2026-08-17', 4, 14);
  assert.deepEqual(result, ['2026-08-17', '2026-08-31', '2026-09-14', '2026-09-28']);
});

test('neighbor progress config normalizes stages and preserves explicit overrides', () => {
  const result = config.normalizeNeighborProgressConfig({
    intervalDays: 14,
    stages: [{ key: 'Hero13', name: '13代英雄', anchorDate: '2026-09-01', dates: ['2026-09-01', '', '2026-09-29'] }]
  });
  assert.equal(result.error, undefined);
  assert.equal(result.intervalDays, 14);
  assert.deepEqual(result.stages[0].dates.slice(0, 4), ['2026-09-01', '2026-09-15', '2026-09-29', '2026-10-13']);
});

test('neighbor progress normalizes common range separators for public queries', () => {
  assert.equal(config.normalizeNeighborProgressRange('4446～4470'), '4446~4470');
  assert.equal(config.normalizeNeighborProgressRange('4471 - 4495'), '4471~4495');
  assert.equal(config.normalizeNeighborProgressRange('4520—4496'), '4496~4520');

  const result = config.normalizeNeighborProgressConfig({
    ranges: ['4446～4470', '4471–4495'],
    stages: []
  });
  assert.deepEqual(result.ranges, ['4446~4470', '4471~4495']);
});

test('public neighbor progress searches the authoritative remote range list', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'public/function/neighbor-progress.html'), 'utf8');
  assert.match(page, /labels\s*=\s*config\.ranges\.slice\(\)/);
  assert.doesNotMatch(page, /config\.ranges\.concat\(labels\.slice/);
  assert.match(page, /\[~\\uFF5E\\-\\u2013\\u2014\]/);
});

test('neighbor progress treats the first range date as the saved anchor', () => {
  const result = config.normalizeNeighborProgressConfig({
    intervalDays: 14,
    stages: [{ key: 'Hero13', name: '13代英雄', anchorDate: '2026-08-01', dates: ['2026-09-01'] }]
  });
  assert.equal(result.stages[0].anchorDate, '2026-09-01');
  assert.equal(result.stages[0].dates[0], '2026-09-01');
  assert.equal(result.stages[0].dates[1], '2026-09-15');
});

test('admin exposes neighbor progress management and public page fetch hook', () => {
  const admin = fs.readFileSync(path.join(__dirname, '..', 'public/function/_ops/console-7a9/internal/admin.html'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '..', 'public/function/neighbor-progress.html'), 'utf8');
  assert.match(admin, /data-page="neighbor-progress"/);
  assert.match(admin, /api\/admin\/neighbor-progress/);
  assert.match(server, /api\/neighbor-progress/);
  assert.match(page, /api\/neighbor-progress/);
});

test('admin interval generation keeps the first range as the edited anchor', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'public/function/admin-neighbor-progress-page.js'), 'utf8');
  assert.match(script, /date \+ 'T00:00:00Z'/);
  assert.match(script, /setUTCDate/);
  assert.match(script, /var anchor = \(s\.dates \|\| \[\]\)\[0\]/);
  assert.match(script, /neighborProgressInterval/);
  assert.match(script, /if \(i === 0\) return anchor/);
  assert.doesNotMatch(script, /s\.anchorDate \|\| \(s\.dates \|\| \[\]\)\[0\]/);
});

test('admin add range continues every stage from its latest date', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'public/function/admin-neighbor-progress-page.js'), 'utf8');
  assert.match(script, /var previousIndex = state\.ranges\.length - 1/);
  assert.match(script, /var previousDate = s\.dates\[previousIndex\] \|\| ''/);
  assert.match(script, /s\.dates\.push\(previousDate \? addDays\(previousDate, interval\) : ''\)/);
});

test('admin serializes neighbor progress config as JSON when saving', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'public/function/admin-neighbor-progress-page.js'), 'utf8');
  assert.match(script, /body:\s*JSON\.stringify\(state\)/);
  assert.doesNotMatch(script, /body:\s*state\s*}/);
});

test('admin generates the next hero stage from the current highest generation', () => {
  const context = loadNeighborProgressAdminContext();
  const next = context.window.nextNeighborHeroGeneration;
  assert.equal(typeof next, 'function');
  const stages = [
    { key: 'FC10', name: '火晶十' },
    { key: 'Hero14', name: '14代英雄' },
    { key: 'CustomHero', name: '15代英雄' }
  ];
  assert.equal(next(stages), 16);
  stages.push({ key: 'Hero16', name: '16代英雄' });
  assert.equal(next(stages), 17);
  stages.pop();
  assert.equal(next(stages), 16);
});

test('neighbor progress default config includes Hero12 for downstream calculators', () => {
  const result = config.defaultNeighborProgressConfig();
  const hero12 = result.stages.find((stage) => stage.key === 'Hero12');
  assert.ok(hero12);
  assert.equal(hero12.anchorDate, '2026-08-17');
  assert.equal(hero12.dates[0], '2026-08-17');
});
