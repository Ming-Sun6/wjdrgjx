const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('bear body recommendation is linked under data query in basic tools', () => {
  const home = read('index.html');
  assert.match(home, /data-category="dataQuery"[\s\S]*data-tool-id="bear-body-recommendation"/);
  assert.match(home, /data-tool-priority="core"[^>]*data-tool-id="bear-body-recommendation"/);
  assert.match(home, /function\/bear-body-recommendation\.html/);
  assert.match(home, /打熊车身推荐/);
});

test('bear body recommendation includes every rating, skill, and hero', () => {
  const html = read('public/function/bear-body-recommendation.html');
  assert.match(html, /const RECOMMENDATIONS/);
  for (const grade of ['S', 'A', 'B', 'C', 'D']) assert.match(html, new RegExp(`grade: "${grade}"`));
  for (const hero of [
    '亨德里克', '丽姬娅', '艾丝黛拉', '埃莉诺', '杰赛尔', '杰西', '尼莫', '布兰奇', '赫尔薇尔',
    '汉克', '贝尔莎', '书允', '布拉德利', '马格努斯', '鲁弗斯', '维薇卡', '玲奈', '韦恩',
    '索尼娅', '多米尼克', '艾诗琳', '格温', '菲兰德', '格里高利', '诺拉', '格雷格', '阿隆索',
    '琳恩', '米娅', '弗洛拉'
  ]) assert.match(html, new RegExp(hero));
  assert.match(html, /受到的伤害提升50%/);
});

test('bear body recommendation supports search, grade filters, and compact mobile heroes', () => {
  const html = read('public/function/bear-body-recommendation.html');
  assert.match(html, /id="heroSearch"/);
  assert.match(html, /data-grade="S"/);
  assert.match(html, /function renderRecommendations/);
  assert.match(html, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(html, /html\[data-theme="day"\]/);
  assert.match(html, /analytics-tracker\.js/);
});

test('bear body recommendation follows the shared data-query theme language', () => {
  const html = read('public/function/bear-body-recommendation.html');
  assert.match(html, /--page:\s*#071318/);
  assert.match(html, /--panel:\s*#10282e/);
  assert.match(html, /html\[data-theme="night"\]\s+body/);
  assert.match(html, /body\.theme-night/);
  assert.match(html, /html\[data-theme="day"\]/);
  assert.match(html, /body\.theme-day/);
  assert.match(html, /class="hero"/);
  assert.doesNotMatch(html, /content:\s*"S  A  B  C  D"/);
});

test('bear body recommendation prominently credits the data source', () => {
  const html = read('public/function/bear-body-recommendation.html');
  assert.match(html, /class="source-credit"/);
  assert.match(html, /数据来源：1096今麦雾，欢迎移民1096/);
});
