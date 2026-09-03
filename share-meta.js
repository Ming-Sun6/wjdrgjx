const path = require('path');

const DEFAULT_SHARE_IMAGE = '/public/wjdr-home/%E9%9B%AA%E5%9B%BD%E7%9B%B8%E5%86%8C-%E5%88%86%E4%BA%AB.jpg';
const PAGE_SHARE_META = {
  '/': { title: '冬日工具箱', description: '无尽冬日玩家攻略站：计算工具、活动日历、英雄数据、礼包兑换与论坛交流。' },
  '/function/neighbor-progress.html': { title: '邻邦进度｜冬日工具箱', description: '查询各区间邻邦进度、英雄阶段和开放日期。' },
  '/function/history-immigration-group.html': { title: '历史移民分组｜冬日工具箱', description: '查看历史移民日期、邻邦进度和分组变化。' },
  '/function/migration-prediction.html': { title: '移民预测｜冬日工具箱', description: '根据邻邦进度和历史移民数据推算后续移民分组。' },
  '/function/farthest-migration-range.html': { title: '最远移民区间｜冬日工具箱', description: '自动判断本区火晶进度，计算往前、往后最远能移到哪一区；填写目标区后按移民预测期次推到能移入为止。' },
  '/function/forum.html': { title: '论坛｜冬日工具箱', description: '无尽冬日玩家交流、攻略分享和问题讨论。' },
  '/function/forum-post.html': { title: '论坛文章｜冬日工具箱', description: '查看无尽冬日玩家分享的攻略与讨论。' }
};

function escapeMeta(value) {
  return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function absoluteShareUrl(value, origin = 'https://wjgl.store') {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('data:')) return '';
  try { return new URL(raw, origin).toString(); } catch (_) { return ''; }
}

function firstImageFromHtml(html) {
  const match = String(html || '').match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  return match ? match[1] : '';
}

function plainTextFromHtml(html) {
  return String(html || '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCoverImages(value) {
  if (Array.isArray(value)) return value;
  const raw = String(value || '').trim();
  if (!raw) return [];
  try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed; } catch (_) {}
  return [raw];
}

function resolvePageMeta(pathname, post, origin = 'https://wjgl.store') {
  const key = PAGE_SHARE_META[pathname] ? pathname : '/';
  const base = PAGE_SHARE_META[key];
  let title = base.title;
  let description = base.description;
  let image = '';
  if (post) {
    title = String(post.title || title).slice(0, 120);
    description = String(post.contentText || plainTextFromHtml(post.contentHtml) || description).replace(/\s+/g, ' ').trim().slice(0, 160);
    const imageCandidates = parseCoverImages(post.coverImage).concat(firstImageFromHtml(post.contentHtml));
    image = imageCandidates.map((value) => absoluteShareUrl(value, origin)).find(Boolean) || '';
  }
  return { title, description, image: image || absoluteShareUrl(image, origin) || new URL(DEFAULT_SHARE_IMAGE, origin).toString() };
}

function buildShareMetaTags(meta, url) {
  const title = escapeMeta(meta.title);
  const description = escapeMeta(meta.description);
  const image = escapeMeta(meta.image);
  const canonical = escapeMeta(url);
  return [
    `<meta property="og:type" content="${meta.title.includes('论坛文章') || url.includes('forum-post') ? 'article' : 'website'}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:image" content="${image}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="675" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`
  ].join('\n  ');
}

function injectShareMeta(html, meta, url) {
  const tags = buildShareMetaTags(meta, url);
  return String(html || '').replace(/\s*<meta\s+property=["']og:[^>]+>\s*/gi, '\n').replace(/\s*<meta\s+name=["']twitter:[^>]+>\s*/gi, '\n').replace('</head>', `  ${tags}\n</head>`);
}

function resolvePublicHtmlPath(rootDir, pathname) {
  let relative = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  if (relative.startsWith('public/')) relative = relative.slice(7);
  if (relative.endsWith('/')) relative += 'index.html';
  else if (!relative.toLowerCase().endsWith('.html')) relative += '.html';
  const filePath = path.resolve(rootDir, relative);
  const root = path.resolve(rootDir);
  return filePath.startsWith(root + path.sep) ? filePath : null;
}

module.exports = { DEFAULT_SHARE_IMAGE, PAGE_SHARE_META, absoluteShareUrl, buildShareMetaTags, firstImageFromHtml, injectShareMeta, parseCoverImages, plainTextFromHtml, resolvePageMeta, resolvePublicHtmlPath };
