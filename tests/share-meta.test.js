const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { firstImageFromHtml, injectShareMeta, parseCoverImages, resolvePageMeta } = require('../share-meta');

test('share metadata uses page defaults and injects Open Graph tags', () => {
  const meta = resolvePageMeta('/function/neighbor-progress.html', null);
  const html = injectShareMeta('<html><head><title>x</title></head><body></body></html>', meta, 'https://wjgl.store/function/neighbor-progress.html');
  assert.match(html, /og:title/);
  assert.match(html, /og:image/);
  assert.match(html, /summary_large_image/);
});

test('farthest migration range uses its own WeChat share title and subtitle', () => {
  const meta = resolvePageMeta('/function/farthest-migration-range.html', null);
  assert.equal(meta.title, '最远移民区间｜冬日工具箱');
  assert.match(meta.description, /往前、往后最远能移到哪一区/);
  assert.match(meta.image, /%E9%9B%AA%E5%9B%BD%E7%9B%B8%E5%86%8C-%E5%88%86%E4%BA%AB/);
  const html = injectShareMeta(
    '<html><head><title>x</title></head><body></body></html>',
    meta,
    'https://wjgl.store/function/farthest-migration-range.html'
  );
  assert.match(html, /og:title" content="最远移民区间｜冬日工具箱"/);
  assert.doesNotMatch(html, /og:title" content="冬日工具箱"/);
});

test('forum share metadata prefers cover, then first content image, then default', () => {
  assert.equal(parseCoverImages('["/uploads/a.jpg"]')[0], '/uploads/a.jpg');
  assert.equal(firstImageFromHtml('<p><img src="/uploads/b.jpg"></p>'), '/uploads/b.jpg');
  assert.match(resolvePageMeta('/function/forum-post.html', { title: '文章', coverImage: '/uploads/a.jpg' }).image, /uploads\/a\.jpg/);
  assert.match(resolvePageMeta('/function/forum-post.html', { title: '文章', contentHtml: '<img src="/uploads/b.jpg">' }).image, /uploads\/b\.jpg/);
  assert.match(resolvePageMeta('/function/forum-post.html', { title: '文章' }).image, /%E9%9B%AA%E5%9B%BD%E7%9B%B8%E5%86%8C/);
});

test('forum share metadata derives a description from html content', () => {
  const meta = resolvePageMeta('/function/forum-post.html', {
    title: '图文攻略',
    contentText: '',
    contentHtml: '<p>第一段攻略内容</p><p><img src="/uploads/forum/a.png">第二段</p>'
  });
  assert.equal(meta.description, '第一段攻略内容 第二段');
  assert.equal(meta.image, 'https://wjgl.store/uploads/forum/a.png');
});

test('IIS proxies forum detail pages to Node before static function rewrites', () => {
  const config = fs.readFileSync('web.config', 'utf8');
  const proxyIndex = config.indexOf('ReverseProxyForumPostToNode3000');
  const staticIndex = config.indexOf('StaticFunctionToPublicFunction');
  assert.ok(proxyIndex >= 0);
  assert.ok(proxyIndex < staticIndex);
  assert.match(config, /function\/forum-post\(\?:\\\.html\)\?/);
  assert.match(config, /127\.0\.0\.1:3000\/function\/forum-post\.html/);
  assert.match(config, /appendQueryString="true"/);
});

test('forum html responses explicitly disable intermediary caching', () => {
  const server = fs.readFileSync('server.js', 'utf8');
  assert.match(server, /CDN-Cache-Control', 'no-store'/);
  assert.match(server, /Surrogate-Control', 'no-store'/);
});

test('public tool pages include a static share image for WeChat crawlers', () => {
  const html = fs.readFileSync('public/function/T12Calculator.html', 'utf8');
  assert.match(html, /<meta property="og:image" content="https:\/\/wjgl\.store\//);
  assert.match(html, /<meta property="og:image:width" content="1200" \/>/);
  assert.match(html, /<meta property="og:image:height" content="675" \/>/);
});

test('every public user-facing html page includes static share metadata', () => {
  const publicRoot = path.join(__dirname, '..', 'public');
  const missing = [];

  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '_ops') continue;
        walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.html') || entry.name.toLowerCase() === 'admin.html') continue;
      const html = fs.readFileSync(fullPath, 'utf8');
      if (!/<meta\s+property="og:title"/i.test(html) ||
          !/<meta\s+property="og:description"/i.test(html) ||
          !/<meta\s+property="og:image"\s+content="https:\/\/wjgl\.store\//i.test(html)) {
        missing.push(path.relative(publicRoot, fullPath).split(path.sep).join('/'));
      }
    }
  }

  walk(publicRoot);
  assert.deepEqual(missing, []);
});

test('static share metadata injector covers games and nested public tools', () => {
  const script = fs.readFileSync('scripts/inject-static-share-meta.js', 'utf8');
  assert.doesNotMatch(script, /startsWith\('function\/aeroplane-chess\/'\)/);
  assert.doesNotMatch(script, /startsWith\('function\/wjdeyj\/fpgj\/'\)/);
});
