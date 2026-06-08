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
