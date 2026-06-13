const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadExpertData() {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'function', 'expert-calculator-data.js'),
    'utf8'
  );
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  return sandbox.window.ExpertCalculatorData;
}

test('expert calculator data includes level rows and reserved skills', () => {
  const data = loadExpertData();
  assert.equal(data.experts.length, 8);

  const bald = data.experts.find(expert => expert.name === '巴尔德');
  assert.ok(bald);
  assert.equal(bald.levels.length, 100);
  assert.equal(bald.levels[0].level, 1);
  assert.equal(bald.levels[0].favor, 1000);
  assert.equal(bald.levels[99].level, 100);
  assert.equal(bald.relationMilestones.at(-1).relation, '莫逆于心');
  assert.ok(Array.isArray(bald.skills));
});

test('expert calculator parses Ronie skill names, costs, and talent rows', () => {
  const data = loadExpertData();
  const ronnie = data.experts.find(expert => expert.name === '罗妮');
  assert.ok(ronnie);
  const skillNames = JSON.parse(JSON.stringify(ronnie.skills.map(skill => skill.name)));
  assert.deepEqual(skillNames, ['路线规划', '敏锐洞察', '迅猛反击', '金牌护卫', '战刃之舞']);

  const route = ronnie.skills[0];
  assert.equal(route.type, 'skill');
  assert.equal(route.levels.length, 10);
  assert.equal(route.levels[0].level, 1);
  assert.equal(route.levels[0].requirement, '专家关系泛泛之交Ⅰ');
  assert.equal(route.levels[1].books, 300);
  assert.equal(route.levels[2].cumulativeBooks, 13500);
  assert.match(route.levels[9].description, /额外3次免费刷新机会/);

  const talent = ronnie.skills[4];
  assert.equal(talent.type, 'talent');
  assert.equal(talent.levels.length, 11);
  assert.equal(talent.levels[0].level, 1);
  assert.equal(talent.levels[0].relation, '萍水相逢');
  assert.equal(talent.levels[10].talentLevel, 11);
  assert.match(talent.levels[10].description, /攻击力和防御力\+30%/);
});

test('expert calculator page loads data and exposes calculator controls', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'function', 'expert-calculator.html'),
    'utf8'
  );

  assert.match(html, /expert-calculator-data\.js/);
  assert.match(html, /id="expertSelect"/);
  assert.match(html, /id="currentLevel"/);
  assert.match(html, /id="targetLevel"/);
  assert.match(html, /id="favorNeeded"/);
  assert.match(html, /id="skillList"/);
  assert.match(html, /id="expertEffect"/);
  assert.match(html, /id="totalFavor"/);
  assert.match(html, /id="totalSkillXp"/);
  assert.match(html, /技能升级计算/);
  assert.match(html, /skill-level-table/);
  assert.match(html, /待补充/);
});

test('expert calculator has dedicated mobile layout rules', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'function', 'expert-calculator.html'),
    'utf8'
  );

  assert.match(html, /class="inline level-range"/);
  assert.match(html, /class="inline form-actions"/);
  assert.match(html, /class="inline skill-range"/);
  assert.match(
    html,
    /@media\s*\(max-width:\s*560px\)\s*\{[\s\S]*\.level-range,\s*\.skill-range\s*\{[\s\S]*grid-template-columns:\s*64px minmax\(0,1fr\)/
  );
  assert.match(
    html,
    /@media\s*\(max-width:\s*560px\)\s*\{[\s\S]*\.form-actions\s*\{[\s\S]*grid-template-columns:\s*1fr 1fr/
  );
  assert.match(
    html,
    /@media\s*\(max-width:\s*560px\)\s*\{[\s\S]*select,\s*button\s*\{[\s\S]*min-width:\s*0/
  );
});

test('home page links to expert calculator', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /function\/expert-calculator\.html/);
  assert.match(html, /专家计算器/);
});
