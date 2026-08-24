const fs = require('fs');
const path = require('path');
const { buildShareMetaTags } = require('../share-meta');

const ROOT = path.join(__dirname, '..');
const PUBLIC_ROOT = path.join(ROOT, 'public');
const ORIGIN = 'https://wjgl.store';
const IMAGE = new URL('/public/wjdr-home/%E9%9B%AA%E5%9B%BD%E7%9B%B8%E5%86%8C-%E5%88%86%E4%BA%AB.jpg', ORIGIN).toString();

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return entry.isFile() && entry.name.toLowerCase().endsWith('.html') ? [fullPath] : [];
  });
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function getMetaContent(html, name) {
  const match = html.match(new RegExp(`<meta\\s+[^>]*(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'));
  return match ? decodeHtml(match[1]) : '';
}

function getTitle(html, relativePath) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return (match ? decodeHtml(match[1]) : path.basename(relativePath, '.html')).replace(/\s+/g, ' ').trim().slice(0, 120);
}

function inject(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  if (/<meta\s+property=["']og:image["']/i.test(html)) return false;
  if (!/<\/head>/i.test(html)) return false;
  const relativePath = path.relative(PUBLIC_ROOT, filePath).split(path.sep).join('/');
  const url = `${ORIGIN}/${relativePath}`;
  const meta = {
    title: getTitle(html, relativePath),
    description: getMetaContent(html, 'description') || `${getTitle(html, relativePath)}｜冬日工具箱`,
    image: IMAGE
  };
  const tags = buildShareMetaTags(meta, url);
  const next = html.replace(/<\/head>/i, `  ${tags}\n</head>`);
  fs.writeFileSync(filePath, next, 'utf8');
  return true;
}

const changed = walk(PUBLIC_ROOT).filter((filePath) => {
  const relative = path.relative(PUBLIC_ROOT, filePath).split(path.sep).join('/');
  if (relative.startsWith('function/_ops/')) return false;
  if (relative.endsWith('/admin.html')) return false;
  return inject(filePath);
});

console.log(`Injected static share metadata into ${changed.length} public tool pages.`);
