const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const pgSchema = require('../postgres-schema').POSTGRES_SCHEMA_SQL.join('\n');

test('server initializes and mounts the modular calendar implementation once', () => {
  assert.match(server, /require\('\.\/calendar-store'\)/);
  assert.match(server, /require\('\.\/calendar-routes'\)/);
  assert.match(server, /ensureCalendarSchema\(/);
  assert.match(server, /mountCalendarRoutes\(/);
  assert.equal((server.match(/app\.get\('\/api\/calendar\/schedules'/g) || []).length, 0, 'calendar routes should be mounted by the module');
});

test('postgres startup schema includes canonical calendar tables', () => {
  assert.match(pgSchema, /calendar_categories/);
  assert.match(pgSchema, /calendar_schedule_definitions/);
  assert.match(pgSchema, /calendar_schedule_items/);
});
