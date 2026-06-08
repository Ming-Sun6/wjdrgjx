const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');
const projectDir = path.join(rootDir, 'aeroplane-chess');
const gameDir = path.join(projectDir, 'frontend');

test('home page links to imported aeroplane chess folder only', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

  assert.match(html, /function\/aeroplane-chess\//);
  assert.doesNotMatch(html, /function\/ludo\.html/);
  assert.doesNotMatch(html, /id="ludoBoard"/);
});

test('imported aeroplane chess entry and assets are present', () => {
  const entry = path.join(gameDir, 'index.html');
  const game = path.join(gameDir, 'game.html');
  const spectate = path.join(gameDir, 'spectate.html');
  const css = path.join(gameDir, 'css', 'style.css');
  const mainScript = path.join(gameDir, 'js', 'indexMain.js');

  assert.equal(fs.existsSync(entry), true);
  assert.equal(fs.existsSync(game), true);
  assert.equal(fs.existsSync(spectate), true);
  assert.equal(fs.existsSync(css), true);
  assert.equal(fs.existsSync(mainScript), true);
  assert.equal(fs.existsSync(path.join(projectDir, 'backend', 'server.cjs')), true);
});

test('old custom ludo api integration is removed', () => {
  const serverSource = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');
  const schemaSource = fs.readFileSync(path.join(rootDir, 'postgres-schema.js'), 'utf8');

  assert.doesNotMatch(serverSource, /mountLudoRoutes/);
  assert.doesNotMatch(serverSource, /ludo-routes/);
  assert.doesNotMatch(schemaSource, /ludo_match_/);
});

test('main server exposes the imported aeroplane chess frontend and backend launcher', () => {
  const serverSource = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');

  assert.match(serverSource, /\/function\/aeroplane-chess/);
  assert.match(serverSource, /aeroplane-chess['"], ['"]frontend/);
  assert.match(serverSource, /startAeroplaneChessBackend/);
});
