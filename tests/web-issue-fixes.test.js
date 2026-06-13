const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('forum post html is sanitized on the server before storage', () => {
  const source = read('server.js');

  assert.match(source, /function sanitizeForumPostHtml/);
  assert.match(source, /contentHtml\s*=\s*sanitizeForumPostHtml\(contentHtml\)/);
  assert.match(source, /allowedTags:\s*\[/);
  assert.match(source, /allowedAttributes:/);
});

test('forum detail page uses whitelist html sanitizer before innerHTML rendering', () => {
  const source = read('public/function/forum-post.html');

  assert.match(source, /function sanitizeHtml\(html\)/);
  assert.match(source, /document\.createElement\('template'\)/);
  assert.match(source, /allowedTags/);
  assert.match(source, /sanitizeUrl/);
  assert.doesNotMatch(source, /text=text\.replace\(\/<script/);
});

test('gift value calculator uses unified day/night theme only', () => {
  const source = read('public/function/gift-value-calculator.html');

  assert.doesNotMatch(source, /data-theme="dark"/);
  assert.doesNotMatch(source, /themeToggleEl/);
  assert.doesNotMatch(source, /setAttribute\("data-theme",\s*isDay\s*\?\s*"light"\s*:\s*"dark"\)/);
  assert.match(source, /data-theme="night"/);
  assert.match(source, /\/function\/theme\.js/);
});

test('duihuan page delegates theme toggle to unified theme manager', () => {
  const source = read('public/function/duihuan.html');

  assert.match(source, /\/function\/theme\.js/);
  assert.doesNotMatch(source, /id="themeToggle"/);
  assert.doesNotMatch(source, /wjdr-theme-fab-script/);
  assert.doesNotMatch(source, /root\.setAttribute\('data-theme'/);
});

test('T12 calculator delegates theme toggle to unified theme manager', () => {
  const source = read('public/function/T12Calculator.html');

  assert.match(source, /\/function\/theme\.js/);
  assert.doesNotMatch(source, /function initTheme\(\)/);
  assert.doesNotMatch(source, /getElementById\("themeToggle"\)/);
});
