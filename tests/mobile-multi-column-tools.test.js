const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assertDensityOverride(rel, selectors) {
  const html = read(rel);
  const responsiveLink = html.indexOf('/function/mobile-responsive.css');
  const override = html.indexOf('id="wjdr-mobile-density"');
  assert.notEqual(responsiveLink, -1, `${rel} must load mobile-responsive.css`);
  assert.ok(override > responsiveLink, `${rel} density overrides must load after generic mobile CSS`);
  assert.match(html, /@media\s*\(min-width:\s*340px\)\s*and\s*\(max-width:\s*768px\)/);
  assert.match(html, /@media\s*\(max-width:\s*339px\)/);
  for (const selector of selectors) {
    assert.match(html, new RegExp(`${selector}[\\s\\S]{0,160}grid-template-columns:\\s*repeat\\(2,\\s*minmax\\(0,\\s*1fr\\)\\)`));
  }
}

test('selected calculators expose page-scoped two-column phone layouts', () => {
  assertDensityOverride('public/function/Architecture10.html', ['#cards', '\\.stats', '\\.btn-row']);
  assertDensityOverride('public/function/equipment-training-calculator.html', ['\\.panel \\.grid', '\\.stats']);
  assertDensityOverride('public/function/lord-equipment-gem-calculator.html', ['\\.box \\.grid', '\\.stats']);
  assertDensityOverride('public/function/refine-crystal-calculator.html', ['\\.grid', '\\.stats']);
  assertDensityOverride('public/function/refine-crystal-simulator.html', ['\\.grid', '\\.stats', '\\.btn-row']);
  assertDensityOverride('public/function/expert-calculator.html', ['\\.top-grid', '\\.skill-grid']);
});

test('table-backed calculators constrain their mobile grid containers', () => {
  for (const rel of [
    'public/function/Architecture10.html',
    'public/function/refine-crystal-calculator.html',
  ]) {
    const html = read(rel);
    assert.match(html, /@media\s*\(max-width:\s*768px\)[\s\S]*?\.app\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*min-width:\s*0/s);
    assert.match(html, /\.hero,\s*\.panel,\s*\.table-wrap\s*\{[^}]*max-width:\s*100%[^}]*min-width:\s*0/s);
  }
});

test('command buttons keep touch target height below the column breakpoint', () => {
  for (const rel of [
    'public/function/Architecture10.html',
    'public/function/refine-crystal-simulator.html',
  ]) {
    assert.match(read(rel), /@media\s*\(max-width:\s*768px\)[\s\S]*?\.btn\s*\{[^}]*min-height:\s*44px/s);
  }
});

test('hero and gift lists use two columns with full-width details', () => {
  assertDensityOverride('public/function/Zero/hero-data.html', ['#heroGrid']);
  for (const page of ['regular-gift-data.html', 'special-gift-data.html']) {
    const rel = `public/function/Zero/${page}`;
    assertDensityOverride(rel, ['\\.gift-list']);
    assert.match(read(rel), /\.gift-list\s*\{[^}]*display:\s*grid\s*!important[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
    assert.match(read(rel), /@media\s*\(min-width:\s*769px\)\s*and\s*\(max-width:\s*920px\)[\s\S]*?\.gift-list\s*\{[^}]*display:\s*grid\s*!important[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
    assert.match(read(rel), /\.gift-inline-detail\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  }
});

test('gift expansion exposes stable accessible details and restores focus', () => {
  const js = read('public/function/Zero/gift-data-page.js');
  assert.match(js, /aria-expanded/);
  assert.match(js, /aria-controls/);
  assert.match(js, /role="region"/);
  assert.match(js, /focusGiftButton/);
  assert.match(js, /\.focus\(\)/);
  assert.match(js, /const showInline = mobileLayout && expandedNames\.has\(pack\.name\)/);
  assert.match(js, /const hiddenAttr = showInline \? '' : ' hidden'/);
  assert.match(js, /const disclosureAttrs = mobileLayout\s*\?[\s\S]*aria-expanded[\s\S]*aria-controls[\s\S]*:\s*''/);

  for (const page of ['regular-gift-data.html', 'special-gift-data.html']) {
    const html = read(`public/function/Zero/${page}`);
    assert.match(html, /id="meta"[^>]*aria-live="polite"/);
    assert.match(html, /id="emptyLeft"[^>]*aria-live="polite"/);
    assert.match(html, /\.gift-inline-detail\[hidden\]\s*\{[^}]*display:\s*none\s*!important/s);
  }
});

test('gift rotation keeps one semantic table and labels mobile records', () => {
  const html = read('public/function/Zero/gift-rotation-schedule.html');
  assert.equal((html.match(/<table>/g) || []).length, 1);
  assert.match(html, /data-label="礼包"/);
  assert.match(html, /data-label="周期"/);
  assert.match(html, /data-label="说明"/);
  assert.match(html, /@media\s*\(max-width:\s*768px\)[\s\S]*td::before\s*\{[^}]*content:\s*attr\(data-label\)/);
  assert.match(html, /@media\s*\(max-width:\s*768px\)[\s\S]*table,\s*#bodyRows\s*\{[^}]*width:\s*auto\s*!important[^}]*max-width:\s*100%[^}]*min-width:\s*0/s);
  assert.match(html, /#bodyRows tr\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*min-width:\s*0/s);
  assert.match(html, /#bodyRows td\s*\{[^}]*width:\s*auto\s*!important/s);
  assert.match(html, /:focus-visible/);
});

test('all compact home tools share one title wrapper and badges stay out of flow', () => {
  const indexHtml = read('index.html');
  const homeBundle = indexHtml + '\n' + read('public/function/home.css');
  const names = [...indexHtml.matchAll(/<div class="card-title tool-tile-name">([\s\S]*?)<\/div>/g)];
  assert.ok(names.length >= 20, 'expected compact home tool titles');
  for (const [, content] of names) {
    assert.match(content, /^<span class="tool-tile-name-inner">[\s\S]*<\/span>$/);
  }
  assert.match(homeBundle, /\.tool-status-badge\s*\{[^}]*position:\s*absolute[^}]*right:/s);
  assert.match(homeBundle, /@media\s*\(max-width:\s*768px\)[\s\S]*\.tool-tile-name[\s\S]{0,160}display:\s*grid[^}]*min-height:\s*3\.84em/s);
  assert.match(indexHtml, /data-tool-id="pet-data-query"[\s\S]*?tool-tile-name-inner/);
  assert.match(indexHtml, /data-tool-id="wjti-personality-test"[\s\S]*?tool-tile-name-inner/);
});
