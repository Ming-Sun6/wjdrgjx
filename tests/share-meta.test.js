const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { firstImageFromHtml, injectShareMeta, parseCoverImages, resolvePageMeta } = require('../share-meta');

test('share metadata uses page defaults and injects Open Graph tags', () => {
  const meta = resolvePageMeta('/function/neighbor-progress.html', null);
  const html = injectShareMeta('<html><head><title>x</title></head><body></body></html>', meta, 'https://wjgl.store/function/neighbor-progress.html');
  assert.match(html, /og:title/);
  assert.match(html, /og:image/);
  assert.match(html, /summary_large_image/);
});

test('forum share metadata prefers cover, then first content image, then default', () => {
  assert.equal(parseCoverImages('["/uploads/a.jpg"]')[0], '/uploads/a.jpg');
  assert.equal(firstImageFromHtml('<p><img src="/uploads/b.jpg"></p>'), '/uploads/b.jpg');
  assert.match(resolvePageMeta('/function/forum-post.html', { title: '文章', coverImage: '/uploads/a.jpg' }).image, /uploads\/a\.jpg/);
  assert.match(resolvePageMeta('/function/forum-post.html', { title: '文章', contentHtml: '<img src="/uploads/b.jpg">' }).image, /uploads\/b\.jpg/);
  assert.match(resolvePageMeta('/function/forum-post.html', { title: '文章' }).image, /%E9%9B%AA%E5%9B%BD%E7%9B%B8%E5%86%8C/);
});

test('public tool pages include a static share image for WeChat crawlers', () => {
  const html = fs.readFileSync('public/function/T12Calculator.html', 'utf8');
  assert.match(html, /<meta property="og:image" content="https:\/\/wjgl\.store\//);
  assert.match(html, /<meta property="og:image:width" content="1200" \/>/);
  assert.match(html, /<meta property="og:image:height" content="675" \/>/);
});
