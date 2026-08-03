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

function loadExpertCore() {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'function', 'expert-calculator-core.js'),
    'utf8'
  );
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  return sandbox.window.ExpertCalculatorCore;
}

test('expert calculator data includes level rows and reserved skills', () => {
  const data = loadExpertData();
  assert.equal(data.experts.length, 9);

  const bald = data.experts.find(expert => expert.name === '巴尔德');
  assert.ok(bald);
  assert.equal(bald.levels.length, 100);
  assert.equal(bald.levels[0].level, 1);
  assert.equal(bald.levels[0].favor, 1000);
  assert.equal(bald.levels[99].level, 100);
  assert.equal(bald.relationMilestones.at(-1).relation, '莫逆于心');
  assert.ok(Array.isArray(bald.skills));
});

test('expert calculator imports complete Gareth expert, talent, and skill data', () => {
  const data = loadExpertData();
  const gareth = data.experts.find(expert => expert.name === '加雷斯');
  assert.ok(gareth);
  assert.equal(gareth.hasExpertLevelData, true);
  assert.equal(gareth.statLabel, '部队穿透力 部队生命力');
  assert.equal(gareth.levels.length, 100);
  assert.deepEqual(JSON.parse(JSON.stringify(gareth.levels[0])), {
    level: 1,
    favor: 1000,
    totalFavor: 1000,
    stat: 0.021,
    mark: null,
    relation: '萍水相逢',
    computedTotalFavor: 1000
  });
  assert.equal(gareth.levels[99].totalFavor, 2561350);
  assert.equal(gareth.levels[99].stat, 0.288);
  assert.equal(gareth.relationMilestones.length, 10);
  assert.equal(gareth.relationMilestones.reduce((sum, row) => sum + row.mark, 0), 2730);
  assert.deepEqual(JSON.parse(JSON.stringify(gareth.relationMilestones.at(-1))), {
    afterLevel: 100,
    stat: 0.3,
    mark: 540,
    relation: '莫逆于心'
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(gareth.skills.map(skill => [skill.name, skill.type, skill.levels.length]))),
    [
      ['铁森林馈赠', 'skill', 10],
      ['铁棘战阵', 'skill', 20],
      ['不败铁军', 'skill', 20],
      ['威名震慑', 'skill', 20],
      ['重振旗鼓', 'talent', 11]
    ]
  );

  const normalSkills = gareth.skills.filter(skill => skill.type === 'skill');
  assert.equal(normalSkills.flatMap(skill => skill.levels).reduce((sum, row) => sum + row.xp, 0), 226663800);
  assert.equal(normalSkills.flatMap(skill => skill.levels).reduce((sum, row) => sum + row.books, 0), 1313500);
  assert.equal(normalSkills[0].levels[1].xp, 25800);
  assert.equal(normalSkills[0].levels[1].books, 300);
  assert.equal(normalSkills[0].levels[2].cumulativeBooks, 900);
  assert.equal(normalSkills[0].levels[0].requirement, '专家关系泛泛之交Ⅰ');
  assert.match(normalSkills[0].levels[9].description, /每日最多获得30份/);
  assert.equal(normalSkills[1].levels[19].description, '严密的阵型和钢铁纪律，使部队防御力+50%。');
  assert.equal(normalSkills[2].levels[19].requirement, '专家技能总等级50级');
  assert.match(normalSkills[3].levels[19].description, /穿透力降低5\.00%/);
  const talent = gareth.skills.find(skill => skill.type === 'talent');
  assert.equal(talent.levels[0].description, '军医所容量+50000，治疗速度+3%');
  assert.equal(talent.levels[10].description, '军医所容量+200000，治疗速度+50%');
  assert.ok(data.experts.filter(expert => expert !== gareth).every(expert => expert.hasExpertLevelData === true));
  assert.equal(data.source, undefined);
  assert.equal(data.sources, undefined);
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

test('expert calculator core enables Gareth after complete level data is imported', () => {
  const data = loadExpertData();
  const core = loadExpertCore();
  const gareth = data.experts.find(expert => expert.name === '加雷斯');
  const bald = data.experts.find(expert => expert.name === '巴尔德');

  const garethState = core.calculatorViewState(gareth);
  assert.equal(garethState.levels.disabled, false);
  assert.equal(garethState.levels.values.length, 100);

  const completeState = core.calculatorViewState(bald);
  assert.equal(completeState.levels.disabled, false);
  assert.equal(completeState.levels.values.length, 100);
  assert.deepEqual(Array.from(completeState.levels.values.slice(0, 3)), [1, 2, 3]);
  assert.deepEqual(Array.from(completeState.levels.values.slice(-2)), [99, 100]);

  const firstReset = JSON.parse(JSON.stringify(core.initialRanges(gareth)));
  const secondReset = JSON.parse(JSON.stringify(core.initialRanges(gareth)));
  assert.deepEqual(firstReset, secondReset);
  assert.deepEqual(firstReset.expert, { from: 1, to: 100 });
  assert.equal(firstReset.skills.length, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(core.initialRanges(bald).expert)), { from: 1, to: 100 });
  assert.deepEqual(JSON.parse(JSON.stringify(core.expertTotals(gareth, 1, 100))), {
    available: true,
    favor: 2560350,
    marks: 2730
  });
  assert.deepEqual(JSON.parse(JSON.stringify(core.skillCost(gareth.skills[0], 1, 10))), {
    xp: 1164000,
    books: 13500
  });
});

test('expert calculator page loads data and exposes calculator controls', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'function', 'expert-calculator.html'),
    'utf8'
  );

  assert.match(html, /expert-calculator-data\.js/);
  assert.match(html, /expert-calculator-core\.js/);
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
  assert.match(html, /暂无数据/);
  assert.match(html, /待补充/);
  assert.doesNotMatch(html, /\.xlsx|数据来源|id="dataSource"/i);
});

test('published expert calculator data does not disclose workbook sources', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'function', 'expert-calculator-data.js'),
    'utf8'
  );
  assert.doesNotMatch(source, /\.xlsx|public\/参考|Auto-generated from/i);
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
