const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('announcement supports an admin enabled switch and hides disabled announcements publicly', () => {
  const server = read('server.js');
  const admin = read('public/function/_ops/console-7a9/internal/admin.html');
  const home = read('index.html');

  assert.match(server, /enabled:\s*req\.body\?\.enabled\s*!==\s*false/);
  assert.match(server, /normalizedAnnouncement\.enabled\s*\?\s*normalizedAnnouncement\s*:\s*null/);
  assert.match(admin, /id="announcementEnabled"/);
  assert.match(admin, /enabled:\s*!!enabledInput\.checked/);
  assert.match(home, /raw\.enabled===false/);
  assert.match(home, /announcementButton\.style\.display/);
});

test('home lead click switch is persisted and renders non-link slides when disabled', () => {
  const server = read('server.js');
  const admin = read('public/function/_ops/console-7a9/internal/admin.html');
  const home = read('index.html');

  assert.match(server, /clickEnabled:\s*true/);
  assert.match(server, /clickEnabled\s*=\s*input\.clickEnabled\s*!==\s*false/);
  assert.match(server, /return \{ intervalMs, clickEnabled, slides \}/);
  assert.match(admin, /id="homeLeadClickEnabled"/);
  assert.match(admin, /clickEnabled:\s*!!clickInput\.checked/);
  assert.match(home, /function build\(slidesCfg, ms, clickEnabled\)/);
  assert.match(home, /wjdr-home-carousel-media is-static/);
});

test('home lead has responsive presentation and disabled-click styling', () => {
  const home = read('index.html');

  assert.match(home, /\.wjdr-home-carousel-media/);
  assert.match(home, /aspect-ratio:/);
  assert.match(home, /\.wjdr-home-carousel\.is-static/);
  assert.match(home, /@media \(max-width:\s*600px\)/);
});
