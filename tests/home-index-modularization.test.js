const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('homepage keeps presentation and application logic in dedicated static assets', () => {
  const html = read('index.html');
  assert.ok(fs.existsSync(path.join(root, 'public/function/home.css')), 'missing home.css');
  assert.ok(fs.existsSync(path.join(root, 'public/function/home-app.js')), 'missing home-app.js');
  const css = read('public/function/home.css');
  const js = read('public/function/home-app.js');

  assert.ok(html.split(/\r?\n/).length < 3000, 'index.html should remain a readable document shell');
  assert.match(html, /<link rel="stylesheet" href="\/function\/home\.css\?v=20260803">/);
  assert.match(html, /<script src="\/function\/home-app\.js\?v=20260803"><\/script>/);
  assert.match(css, /\.points-ranking-list/);
  assert.match(css, /\.chat-wrap/);
  assert.match(js, /function openUserHome/);
  assert.match(js, /function openMePointsRanking/);
  assert.doesNotThrow(() => new vm.Script(js, { filename: 'home-app.js' }));
});
