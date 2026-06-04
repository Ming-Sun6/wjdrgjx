import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ZERO = path.join(ROOT, 'public', 'function', 'Zero');

function extractHeroesArray(html) {
  const needle = 'const heroes = [';
  const i = html.indexOf(needle);
  if (i < 0) throw new Error('missing const heroes = [');
  const start = html.indexOf('[', i);
  let depth = 0;
  for (let k = start; k < html.length; k++) {
    const c = html[k];
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) {
        const snippet = html.slice(start, k + 1);
        return new Function('return ' + snippet)();
      }
    }
  }
  throw new Error('unclosed heroes array');
}

function slugFromHref(href) {
  return String(href || '').replace(/-heroes\.html$/, '');
}

function extractPageTitle(html) {
  const m = html.match(/<h1 class="title">([^<]+)<\/h1>/);
  return m ? m[1].trim() : '';
}

const hubHtml = fs.readFileSync(path.join(ZERO, 'hero-data.html'), 'utf8');
const cardRe = /<a class="card" href="([^"]+)">\s*<h2 class="title">([^<]+)<\/h2>\s*<p class="desc">([^<]+)<\/p>\s*<span class="tag">([^<]+)<\/span>\s*<\/a>/g;
const hubCards = [];
let match;
while ((match = cardRe.exec(hubHtml))) {
  hubCards.push({
    href: match[1],
    hubTitle: match[2].trim(),
    hubDesc: match[3].trim(),
    hubTag: match[4].trim()
  });
}

const generations = [];
for (let i = 0; i < hubCards.length; i++) {
  const card = hubCards[i];
  const slug = slugFromHref(card.href);
  const fileName = `${slug}-heroes.html`;
  const filePath = path.join(ZERO, fileName);
  const html = fs.readFileSync(filePath, 'utf8');
  const heroes = extractHeroesArray(html);
  generations.push({
    slug,
    generationNum: i + 1,
    pageTitle: extractPageTitle(html),
    hubTitle: card.hubTitle,
    hubDesc: card.hubDesc,
    hubTag: card.hubTag,
    enabled: true,
    sortOrder: i,
    heroes
  });
}

const outPath = path.join(ROOT, 'data', 'hero-generations-seed.json');
fs.writeFileSync(outPath, JSON.stringify({ generations }, null, 2), 'utf8');
console.log('wrote', outPath, 'generations:', generations.length, 'heroes:', generations.reduce((n, g) => n + g.heroes.length, 0));
