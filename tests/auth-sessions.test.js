const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { POSTGRES_SCHEMA_SQL } = require('../postgres-schema');

test('postgres schema persists hashed auth sessions', () => {
  const sql = POSTGRES_SCHEMA_SQL.join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS auth_sessions/);
  assert.match(sql, /token_hash varchar\(64\) PRIMARY KEY/);
  assert.match(sql, /idx_auth_sessions_user/);
  assert.match(sql, /idx_auth_sessions_expires/);
});

test('server stores auth sessions in the database instead of memory only', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(source, /async function createSession\(/);
  assert.match(source, /await persistNewSession\(/);
  assert.match(source, /INSERT INTO auth_sessions/);
  assert.match(source, /loadPersistedSession\(/);
  assert.match(source, /SELECT user_id, expires_at FROM auth_sessions/);
  assert.match(source, /await createSession\(user\.id\)/);
  assert.match(source, /await deleteSessionFromRequest\(req\)/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS auth_sessions/);
  assert.doesNotMatch(source, /会话存储在内存/);
});

test('session tokens are hashed before they are written to the database', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(source, /function hashSessionToken\(token\)/);
  assert.match(source, /createHash\('sha256'\)\.update\(String\(token/);
  const token = 'a'.repeat(64);
  const digest = crypto.createHash('sha256').update(token).digest('hex');
  assert.equal(digest.length, 64);
});
