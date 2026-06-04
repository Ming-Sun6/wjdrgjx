const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { validateHeroGenerationPayload, normalizeHero } = require('../hero-data');

test('validateHeroGenerationPayload accepts seed-shaped generation', () => {
  const seed = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'hero-generations-seed.json'), 'utf8')
  );
  const first = seed.generations[0];
  const valid = validateHeroGenerationPayload(first, {
    requireSlug: true,
    requireGenerationNum: true
  });
  assert.equal(valid.error, undefined);
  assert.equal(valid.value.heroes.length, first.heroes.length);
});

test('normalizeHero preserves skill groups', () => {
  const hero = normalizeHero({
    name: '测试英雄',
    image: '/img.png',
    attr: '属性: 盾',
    advice: '建议',
    exploreStats: ['攻击1'],
    expeditionStats: ['兵种攻击力', '1%'],
    obtainWays: ['招募'],
    skills: {
      explore: [{ name: '技能', lines: ['一行'] }],
      expedition: [{ name: '技能', lines: ['一行'] }],
      weapon: [{ name: '武器', lines: ['一行'] }]
    }
  });
  assert.equal(hero.error, undefined);
  assert.equal(hero.value.skills.explore[0].name, '技能');
});

test('generation pages load heroes from shared API script', () => {
  for (const fileName of ['first-generation-heroes.html', 'fifteenth-generation-heroes.html']) {
    const html = fs.readFileSync(
      path.join(__dirname, '..', 'public', 'function', 'Zero', fileName),
      'utf8'
    );
    assert.match(html, /hero-generation-page\.js/);
    assert.match(html, /initHeroGenerationPage\(\{ slug:/);
    assert.doesNotMatch(html, /const heroes = \[/);
  }
});

test('hero hub page loads from API script', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'function', 'Zero', 'hero-data.html'),
    'utf8'
  );
  assert.match(html, /hero-hub-page\.js/);
  assert.match(html, /initHeroHubPage\(\)/);
  assert.doesNotMatch(html, /href="first-generation-heroes.html"/);
});

test('generic generation page reads slug from query string', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'function', 'Zero', 'generation-heroes.html'),
    'utf8'
  );
  assert.match(html, /initHeroGenerationPage\(\)/);
  assert.match(html, /hero-generation-page\.js/);
});

test('server supports creating and deleting hero generations', () => {
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', 'hero-data.js'), 'utf8');
  assert.match(moduleSource, /app\.post\('\/api\/admin\/hero-generations',/);
  assert.match(moduleSource, /app\.delete\('\/api\/admin\/hero-generations\/:id'/);
});

test('admin page includes hero data management menu and script', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'function', '_ops', 'console-7a9', 'internal', 'admin.html'),
    'utf8'
  );
  assert.match(html, /data-page="heroes"/);
  assert.match(html, /admin-heroes-page\.js/);
  assert.match(html, /id="heroGenEditor"/);
});

test('admin heroes editor supports image upload control', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'function', 'admin-heroes-page.js'),
    'utf8'
  );
  assert.match(source, /heroFieldImageUploadBtn/);
  assert.match(source, /\/api\/admin\/announcement\/images/);
});

test('admin heroes page places add-generation control in list sidebar', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'function', '_ops', 'console-7a9', 'internal', 'admin.html'),
    'utf8'
  );
  assert.match(html, /id="heroGenListMeta"/);
  assert.match(html, /id="heroGenCreateGenBtn"/);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'function', 'admin-heroes-page.js'),
    'utf8'
  );
  assert.doesNotMatch(source, /id="heroGenCreateGenBtn">新增代数<\/button>'[\s\S]*heroGenSaveBtn/);
});

test('server mounts hero data routes', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', 'hero-data.js'), 'utf8');
  assert.match(serverSource, /mountHeroDataRoutes\(/);
  assert.match(serverSource, /seedHeroGenerationsIfEmpty\(/);
  assert.match(moduleSource, /\/api\/hero-generations/);
});
