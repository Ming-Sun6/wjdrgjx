const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/function/Zero/hero-generation-page.js'), 'utf8');
const generations = JSON.parse(fs.readFileSync(path.join(root, 'data/hero-generations-seed.json'), 'utf8')).generations;

async function render(generation) {
  const list = {innerHTML: '', addEventListener() {}};
  const document = {title: '', getElementById: () => list, querySelector: () => ({textContent: ''})};
  const context = {document, console, URLSearchParams, location: {search: '?slug=' + generation.slug}, fetch: async () => ({ok: true, json: async () => ({generation})})};
  context.window = context;
  vm.runInNewContext(source, context);
  await context.initHeroGenerationPage();
  return list.innerHTML;
}

test('all seeded generations retain stat values and load shared layout through legacy URLs', async () => {
  for (const generation of generations) {
    const html = await render(generation);
    assert.equal((html.match(/class="card"/g) || []).length, generation.heroes.length);
    for (const hero of generation.heroes) {
      for (const value of hero.expeditionStats.filter(s => /^\d/.test(s))) {
        assert.ok(html.includes('<dd>' + value + '</dd>'), generation.slug + ': ' + value);
      }
    }
    const page = fs.readFileSync(path.join(root, 'public/function/Zero/' + generation.slug + '-heroes.html'), 'utf8');
    assert.match(page, /hero-generation-layout\.css\?v=/);
  }
});

test('new slugs preserve odd custom notes and escape admin text without changing schema', async () => {
  const html = await render({slug:'custom-generation', heroes:[{...generations[0].heroes[0], exploreStats:['攻击12345','自定义备注'], expeditionStats:['兵种攻击力','2000.50%','仅文字备注'], obtainWays:['<img src=x onerror=alert(1)>']}]});
  assert.ok(html.includes('<dt>攻击</dt><dd>12345</dd>'));
  assert.ok(html.includes('<dt>兵种攻击力</dt><dd>2000.50%</dd>'));
  assert.ok(html.includes('自定义备注'));
  assert.ok(html.includes('仅文字备注'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<img src=x'));
  assert.match(fs.readFileSync(path.join(root, 'public/function/Zero/generation-heroes.html'), 'utf8'), /hero-generation-layout\.css\?v=/);
});
