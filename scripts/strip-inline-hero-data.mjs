import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZERO = path.join(__dirname, '..', 'public', 'function', 'Zero');

const files = fs.readdirSync(ZERO).filter((name) => /-generation-heroes\.html$/.test(name));
for (const file of files) {
  const slug = file.replace(/-heroes\.html$/, '');
  const fp = path.join(ZERO, file);
  let html = fs.readFileSync(fp, 'utf8');
  const marker = 'const heroes = [';
  const scriptStart = html.lastIndexOf('<script>', html.indexOf(marker));
  const end = html.indexOf('</script>', scriptStart);
  if (scriptStart < 0 || end < 0 || !html.includes(marker)) {
    throw new Error(`script block not found in ${file}`);
  }
  const replacement = `  <script src="hero-generation-page.js"></script>
  <script>
    initHeroGenerationPage({ slug: "${slug}" });
  </script>`;
  html = html.slice(0, scriptStart) + replacement + html.slice(end + '</script>'.length);
  fs.writeFileSync(fp, html, 'utf8');
  console.log('updated', file);
}

const hubPath = path.join(ZERO, 'hero-data.html');
let hubHtml = fs.readFileSync(hubPath, 'utf8');
const gridStart = hubHtml.indexOf('<section class="grid" id="heroGrid">');
const gridEnd = hubHtml.indexOf('</section>', gridStart);
if (gridStart < 0 || gridEnd < 0) throw new Error('heroGrid not found');
hubHtml =
  hubHtml.slice(0, gridStart) +
  '<section class="grid" id="heroGrid"></section>' +
  hubHtml.slice(gridEnd + '</section>'.length);
const inlineScriptStart = hubHtml.lastIndexOf('<script>', hubHtml.indexOf('searchInput'));
const inlineScriptEnd = hubHtml.indexOf('</script>', inlineScriptStart);
if (inlineScriptStart < 0 || inlineScriptEnd < 0) throw new Error('hub script not found');
hubHtml =
  hubHtml.slice(0, inlineScriptStart) +
  `  <script src="hero-hub-page.js"></script>
  <script>
    initHeroHubPage();
  </script>` +
  hubHtml.slice(inlineScriptEnd + '</script>'.length);
fs.writeFileSync(hubPath, hubHtml, 'utf8');
console.log('updated hero-data.html');
