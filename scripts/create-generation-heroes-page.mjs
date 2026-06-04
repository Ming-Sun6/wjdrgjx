import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'function', 'Zero');
const src = path.join(dir, 'first-generation-heroes.html');
const dest = path.join(dir, 'generation-heroes.html');
let html = fs.readFileSync(src, 'utf8');
html = html
  .replace('第一代英雄数据-无尽冬日工具箱', '英雄数据-无尽冬日工具箱')
  .replace('<h1 class="title">第一代英雄数据</h1>', '<h1 class="title">英雄数据</h1>')
  .replace('initHeroGenerationPage({ slug: "first-generation" });', 'initHeroGenerationPage();');
fs.writeFileSync(dest, html, 'utf8');
console.log('wrote', dest);
