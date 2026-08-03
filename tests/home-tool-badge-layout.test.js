const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const homeBundle = [
  indexHtml,
  fs.readFileSync(path.join(__dirname, '..', 'public', 'function', 'home.css'), 'utf8'),
  fs.readFileSync(path.join(__dirname, '..', 'public', 'function', 'home-app.js'), 'utf8'),
].join('\n');

test('every managed home tool title uses the shared wrapping element', () => {
  const titles = [...indexHtml.matchAll(/<div class="card-title (tool-tile-name|tool-entry-title)">([\s\S]*?)<\/div>/g)];

  assert.ok(titles.length >= 25, 'expected all managed compact and featured tool titles');
  for (const [, type, content] of titles) {
    assert.match(
      content,
      /^<span class="tool-tile-name-inner">[\s\S]*<\/span>$/,
      `${type} must use tool-tile-name-inner`,
    );
  }
});

test('managed badges reserve their own space on narrow cards', () => {
  assert.match(
    homeBundle,
    /card\.classList\.toggle\(['"]has-tool-status-badge['"],\s*Boolean\(label\)\)/,
    'badge lifecycle must expose a card state for layout',
  );

  const phoneCss = indexHtml.match(/<style id="wjdr-home-mobile-title-fix">([\s\S]*?)<\/style>/)?.[1] || '';
  assert.match(phoneCss, /@media\s*\(max-width:\s*768px\)/);
  assert.match(
    phoneCss,
    /\.tool-tile-card\.has-tool-status-badge\s+\.tool-tile-link\s*\{[^}]*padding-top:\s*(?:2[4-9]|[3-9]\d)px\s*!important[^}]*align-content:\s*start\s*!important/s,
    'compact card links must keep the badge clear of the icon',
  );
  assert.match(
    phoneCss,
    /\.featured-tool-card\.has-tool-status-badge\s+\.featured-tool-link\s*\{[^}]*padding-top:[^;}]+!important/s,
    'featured cards must keep the badge clear of their content',
  );
});
