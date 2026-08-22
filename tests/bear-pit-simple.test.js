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
});

test('bearpit backup counting accepts simple-version placements', () => {
  assert.match(server, /bearpit/);
  const backups = require('../bearpit-backups');
  assert.equal(backups.countLayoutItems({ placements: [{ id: 'a' }, { id: 'b' }] }), 2);
});
