const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const oldBrand = '\u65e0\u5c3d\u51ac\u65e5\u5de5\u5177\u7bb1';
const newBrand = '\u51ac\u65e5\u5de5\u5177\u7bb1';

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('shared analytics script injects player-made unofficial notice at page top', () => {
  const source = read('public/function/analytics-tracker.js');

  assert.match(source, /ensurePlayerMadeNotice/);
  assert.match(source, /wjdr-player-notice/);
  assert.match(source, /\u73a9\u5bb6\u5236\u4f5c/);
  assert.match(source, /\u975e\u5b98\u65b9/);
  assert.match(source, /insertBefore\(notice,\s*document\.body\.firstChild/);
});

test('main public pages use the shortened site brand', () => {
  const pages = [
    'index.html',
    'rukou.html',
    'legal/privacy.html',
    'legal/user-agreement.html',
    'public/function/expert-calculator.html',
    'public/function/forum-post.html',
    'public/function/wjti-personality-test.html',
    'public/function/_ops/console-7a9/internal/admin.html',
  ];

  for (const page of pages) {
    const source = read(page);
    assert.doesNotMatch(source, new RegExp(oldBrand), `${page} should not use the old full brand`);
    assert.match(source, new RegExp(newBrand), `${page} should use the shortened brand`);
  }
});

test('served html pages load the shared notice injector', () => {
  const skipped = new Set([
    'baidu_verify_codeva-BN4sg0Yffy.html',
    'verification.html',
  ]);
  const pages = [];

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.html') && !skipped.has(entry.name)) {
      pages.push(entry.name);
    }
  }

  for (const dir of ['legal', 'public']) {
    const base = path.join(root, dir);
    const stack = [base];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        const rel = path.relative(root, full).replace(/\\/g, '/');
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.isFile() && entry.name.endsWith('.html') && !skipped.has(rel)) {
          pages.push(rel);
        }
      }
    }
  }

  assert.ok(pages.length > 20);
  for (const page of pages) {
    const source = read(page);
    assert.match(source, /analytics-tracker\.js/, `${page} should load analytics-tracker.js`);
  }
});
