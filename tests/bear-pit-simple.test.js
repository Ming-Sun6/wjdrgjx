const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const page = fs.readFileSync(path.join(root, 'public/function/BearPitSimple.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('bear pit simple version is published and linked from the homepage', () => {
  assert.match(home, /data-tool-id="bear-pit-simple"/);
  assert.match(home, /function\/BearPitSimple\.html/);
  assert.match(page, /open-source-footer/);
  assert.match(page, /github\.com\/tianxiaofeng1014\/wjdr-bear-pit-designer/);
  assert.match(page, /2554王国 FBI 一口气吃十个大馒头/);
  assert.match(page, /api\/site-footer/);
  assert.match(page, /site-footer\.js/);
  assert.match(page, /site-beian\.js/);
  const source = fs.readFileSync(path.join(root, 'bear-pit-simple-src/src/styles.css'), 'utf8');
  assert.match(source, /@media \(max-width: 700px\)/);
  assert.match(source, /\.workspace\s*\{[\s\S]*?flex-direction: column/);
  const canvasSource = fs.readFileSync(path.join(root, 'bear-pit-simple-src/src/components/MapCanvas.tsx'), 'utf8');
  assert.match(canvasSource, /ResizeObserver/);
});

test('bearpit backup counting accepts simple-version placements', () => {
  assert.match(server, /bearpit/);
  const backups = require('../bearpit-backups');
  assert.equal(backups.countLayoutItems({ placements: [{ id: 'a' }, { id: 'b' }] }), 2);
});

test('simple toolbar opens login prompt before protected actions and shows one-time share key guidance', () => {
  const source = fs.readFileSync(path.join(root, 'bear-pit-simple-src/src/components/Toolbar.tsx'), 'utf8');
  assert.match(source, /openAuthModal/);
  assert.match(source, /秘钥仅显示.*一次/);
  assert.match(source, /返回主页/);
});

test('simple layout stores an adjustable rotation angle and rotates canvas content', () => {
  const types = fs.readFileSync(path.join(root, 'bear-pit-simple-src/src/types.ts'), 'utf8');
  const store = fs.readFileSync(path.join(root, 'bear-pit-simple-src/src/store.ts'), 'utf8');
  const canvas = fs.readFileSync(path.join(root, 'bear-pit-simple-src/src/components/MapCanvas.tsx'), 'utf8');
  assert.match(types, /rotation/);
  assert.match(store, /setRotation/);
  assert.match(canvas, /rotation=/);
});
