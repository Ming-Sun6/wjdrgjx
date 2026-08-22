const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function stripHtmlComments(source) {
  return source.replace(/<!--[\s\S]*?-->/g, '');
}

function topLevelCssRules(css) {
  const rules = [];
  let cursor = 0;

  while (cursor < css.length) {
    const openingBrace = css.indexOf('{', cursor);
    if (openingBrace < 0) break;

    const selector = css.slice(cursor, openingBrace).trim();
    let closingBrace = openingBrace + 1;
    let depth = 1;
    let quote = null;
    let escaped = false;

    while (closingBrace < css.length && depth > 0) {
      const char = css[closingBrace];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = null;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
      }
      closingBrace += 1;
    }

    if (depth > 0) break;
    if (selector && !selector.startsWith('@')) {
      rules.push({
        selectors: selector.split(',').map(item => item.trim()),
        declarations: css.slice(openingBrace + 1, closingBrace - 1)
      });
    }
    cursor = closingBrace;
  }

  return rules;
}

function cssDeclarationsForSelectors(source, selectors) {
  const html = stripHtmlComments(source);
  const css = Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi), match => match[1])
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const declarations = new Map();

  for (const rule of topLevelCssRules(css)) {
    if (!rule.selectors.some(selector => selectors.includes(selector))) continue;

    for (const declaration of rule.declarations.split(';')) {
      const colon = declaration.indexOf(':');
      if (colon < 0) continue;
      const property = declaration.slice(0, colon).trim().toLowerCase();
      const value = declaration.slice(colon + 1).trim();
      if (property && value) declarations.set(property, value);
    }
  }

  return declarations;
}

function getTagAttribute(tag, name) {
  const pattern = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = tag.match(pattern);
  return match ? (match[1] ?? match[2] ?? match[3]) : null;
}

function findElements(source, tagName) {
  const elements = [];
  const openingPattern = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  const closingPattern = new RegExp(`</${tagName}\\s*>`, 'gi');

  for (const opening of source.matchAll(openingPattern)) {
    closingPattern.lastIndex = opening.index + opening[0].length;
    const closing = closingPattern.exec(source);
    if (!closing) continue;
    elements.push({
      openingTag: opening[0],
      html: source.slice(opening.index, closing.index + closing[0].length)
    });
  }

  return elements;
}

function countTagsWithAttribute(source, name, value) {
  const tags = source.match(/<[a-z][a-z0-9:-]*\b[^>]*>/gi) || [];
  return tags.filter(tag => getTagAttribute(tag, name) === value).length;
}

function hasNonZeroDeclaration(declarations, property) {
  const value = declarations.get(property);
  return Boolean(value) && !/^0(?:[a-z%]+)?(?:\s+0(?:[a-z%]+)?){0,3}$/i.test(value);
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

test('forum detail base content style preserves source newlines for every post type', () => {
  const source = read('public/function/forum-post.html');
  const contentStyles = cssDeclarationsForSelectors(source, ['.content']);

  assert.match(contentStyles.get('white-space') || '', /^pre-wrap(?:\s*!important)?$/i);
});

test('forum detail initializes the content container before rendering the post body', () => {
  const source = read('public/function/forum-post.html');
  const initialization = source.indexOf("var contentBox=document.getElementById('content');");
  const render = source.indexOf('contentBox.innerHTML=bodyHtml + imgHtml;');

  assert.notEqual(initialization, -1, 'missing forum content container initialization');
  assert.notEqual(render, -1, 'missing forum body render');
  assert.ok(initialization < render, 'contentBox must be initialized before its first render');
});

test('forum detail initializes its outer content container before binding image clicks', () => {
  const source = read('public/function/forum-post.html');
  const binding = source.indexOf("contentBox.addEventListener('click'");
  const declaration = "var contentBox=document.getElementById('content');";
  const declarations = [...source.matchAll(new RegExp(declaration.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))];
  const initialization = source.lastIndexOf(declaration, binding);
  const loadPostStart = source.indexOf('async function loadPost()');

  assert.notEqual(binding, -1, 'missing forum image click binding');
  assert.equal(declarations.length, 2, 'render and loadPost each need their own contentBox declaration');
  assert.ok(initialization > loadPostStart, 'outer contentBox must be initialized inside loadPost');
  assert.ok(initialization < binding, 'outer contentBox must be initialized before image click binding');
});

test('forum detail page uses the shared footer with a single local fallback', () => {
  const source = read('public/function/forum-post.html');
  const html = stripHtmlComments(source);
  const sharedFooters = findElements(html, 'footer').filter(({ openingTag }) => {
    const classes = (getTagAttribute(openingTag, 'class') || '').split(/\s+/);
    return classes.includes('wjdr-footer');
  });
  const scripts = html.match(/<script\b[^>]*>/gi) || [];
  const footerStyles = cssDeclarationsForSelectors(html, ['.wjdr-footer', 'footer.wjdr-footer']);
  const creditStyles = cssDeclarationsForSelectors(html, ['#wjdr-footer-credits']);

  assert.equal(sharedFooters.length, 1);
  assert.equal(countTagsWithAttribute(html, 'id', 'wjdr-footer-credits'), 1);
  assert.equal(countTagsWithAttribute(sharedFooters[0].html, 'id', 'wjdr-footer-credits'), 1);
  assert.ok(scripts.some(tag => getTagAttribute(tag, 'src') === '/function/site-footer.js'));
  assert.doesNotMatch(html, /thanks-footer/);
  assert.match(footerStyles.get('display') || '', /^(?:block|flex|grid|flow-root)$/i);
  assert.ok(footerStyles.has('width') || footerStyles.has('max-width'));
  assert.ok(['margin', 'margin-top', 'padding', 'gap'].some(property => footerStyles.has(property)));
  assert.match(creditStyles.get('white-space') || '', /^pre-wrap(?:\s*!important)?$/i);
  assert.ok(hasNonZeroDeclaration(creditStyles, 'padding'));
  assert.ok(hasNonZeroDeclaration(creditStyles, 'font-size'));
  assert.ok(hasNonZeroDeclaration(creditStyles, 'line-height'));
});

test('forum detail image lightbox exposes zoom controls and mobile pinch zoom', () => {
  const source = read('public/function/forum-post.html');

  assert.match(source, /id="imgLightboxZoomOut"/);
  assert.match(source, /id="imgLightboxZoomIn"/);
  assert.match(source, /id="imgLightboxZoomReset"/);
  assert.match(source, /function setLightboxZoom\(nextZoom(?:,\s*keepViewport)?\)/);
  assert.match(source, /function handleLightboxTouchMove\(ev\)/);
  assert.match(source, /touches\.length\s*===\s*2/);
});

test('forum detail image lightbox keeps original button visible on mobile and supports panning', () => {
  const source = read('public/function/forum-post.html');

  assert.match(source, /@media \(max-width:520px\)[\s\S]*\.lightbox-original\{[\s\S]*position:fixed[\s\S]*bottom:74px/);
  assert.match(source, /function startLightboxPan\(clientX,\s*clientY\)/);
  assert.match(source, /function moveLightboxPan\(clientX,\s*clientY\)/);
  assert.match(source, /function centerLightboxViewport\(center\)/);
  assert.match(source, /addEventListener\('mousemove',\s*handleLightboxMouseMove/);
  assert.match(source, /touches\.length\s*===\s*1/);
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
