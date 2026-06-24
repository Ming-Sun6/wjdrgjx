const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('announcement sanitizer keeps browser color picker rgb styles', () => {
  const source = read('server.js');

  assert.match(source, /function sanitizeAnnouncementHtml/);
  assert.match(source, /'color':[\s\S]*\^rgb\\\(/);
});
