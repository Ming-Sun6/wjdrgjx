const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pagePath = path.join(__dirname, '..', 'public', 'function', 'wjti-personality-test.html');
const indexPath = path.join(__dirname, '..', 'index.html');

test('wjti personality test page is integrated into toolbox', () => {
  const html = fs.readFileSync(pagePath, 'utf8');
  assert.match(html, /无尽冬日人格测试-无尽冬日工具箱/);
  assert.match(html, /href="\.\.\/rukou\.html"/);
  assert.match(html, /\/function\/theme\.js/);
  assert.match(html, /data-mode-card="standard"/);
  assert.match(html, /const QUESTIONS = \[/);
  assert.match(html, /function getQuestionIdsForMode/);
  assert.match(html, /function scoreAnswers/);
  assert.match(html, /name: "黑奴"/);
  assert.doesNotMatch(html, /data-theme-toggle/);
});

test('homepage lists the wjti personality test entry', () => {
  const html = fs.readFileSync(indexPath, 'utf8');
  assert.match(html, /wjti-personality-test\.html/);
  assert.match(html, /&#x65E0;&#x5C3D;&#x51AC;&#x65E5;&#x4EBA;&#x683C;&#x6D4B;&#x8BD5;/);
});
