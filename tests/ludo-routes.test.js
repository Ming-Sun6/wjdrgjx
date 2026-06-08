const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('server mounts ludo routes', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(serverSource, /mountLudoRoutes\(/);
});

test('ludo route module exposes DDL and mount function', () => {
  const ludo = require('../ludo-routes');
  assert.equal(typeof ludo.mountLudoRoutes, 'function');
  assert.equal(typeof ludo.ensureLudoSchema, 'function');
  assert.match(ludo.LUDO_DDL_MYSQL, /ludo_match_history/);
  assert.match(ludo.LUDO_DDL_MYSQL, /ludo_match_players/);
  assert.match(ludo.LUDO_DDL_PG, /ludo_match_history/);
  assert.match(ludo.LUDO_DDL_PG, /ludo_match_players/);
});

test('standalone ludo page contains core app nodes', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'function', 'ludo.html'), 'utf8');
  assert.match(html, /id="ludoApp"/);
  assert.match(html, /id="ludoRoomList"/);
  assert.match(html, /id="ludoBoard"/);
  assert.match(html, /\/api\/ludo\/rooms/);
});

test('home page links to standalone ludo page without embedding game app', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /function\/ludo\.html/);
  assert.doesNotMatch(html, /id="ludoBoard"/);
});
