const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const rootDir = path.join(__dirname, '..');
const projectDir = path.join(rootDir, 'aeroplane-chess');
const gameDir = path.join(projectDir, 'frontend');
const publicGameDir = path.join(rootDir, 'public', 'function', 'aeroplane-chess');

async function importPollingTransport(baseDir) {
  global.window = {};
  global.localStorage = {
    getItem: () => 'player-test',
    setItem: () => {},
    removeItem: () => {}
  };

  const moduleUrl = `${pathToFileURL(path.join(baseDir, 'js', 'pollingTransport.js')).href}?t=${Date.now()}-${Math.random()}`;
  return import(moduleUrl);
}

test('home page links to imported aeroplane chess folder only', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

  assert.match(html, /function\/aeroplane-chess\//);
  assert.doesNotMatch(html, /function\/ludo\.html/);
  assert.doesNotMatch(html, /id="ludoBoard"/);
});

test('imported aeroplane chess entry and assets are present', () => {
  assert.equal(fs.existsSync(path.join(gameDir, 'index.html')), true);
  assert.equal(fs.existsSync(path.join(gameDir, 'game.html')), true);
  assert.equal(fs.existsSync(path.join(gameDir, 'spectate.html')), true);
  assert.equal(fs.existsSync(path.join(gameDir, 'css', 'style.css')), true);
  assert.equal(fs.existsSync(path.join(gameDir, 'js', 'indexMain.js')), true);
  assert.equal(fs.existsSync(path.join(projectDir, 'backend', 'server.cjs')), true);
});

test('aeroplane chess frontend is available in public static deployment path', () => {
  assert.equal(fs.existsSync(path.join(publicGameDir, 'index.html')), true);
  assert.equal(fs.existsSync(path.join(publicGameDir, 'game.html')), true);
  assert.equal(fs.existsSync(path.join(publicGameDir, 'spectate.html')), true);
  assert.equal(fs.existsSync(path.join(publicGameDir, 'css', 'style.css')), true);
  assert.equal(fs.existsSync(path.join(publicGameDir, 'js', 'indexMain.js')), true);
  assert.equal(fs.existsSync(path.join(publicGameDir, 'favicon.svg')), true);
  assert.equal(fs.existsSync(path.join(publicGameDir, 'audio', 'move.wav')), true);
});

test('old custom ludo api integration is removed', () => {
  const serverSource = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');
  const schemaSource = fs.readFileSync(path.join(rootDir, 'postgres-schema.js'), 'utf8');

  assert.doesNotMatch(serverSource, /mountLudoRoutes/);
  assert.doesNotMatch(serverSource, /ludo-routes/);
  assert.doesNotMatch(schemaSource, /ludo_match_/);
});

test('main server exposes aeroplane chess through http polling api', () => {
  const serverSource = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');
  const pollingSource = fs.readFileSync(path.join(rootDir, 'aeroplane-chess-polling.js'), 'utf8');

  assert.match(serverSource, /\/function\/aeroplane-chess/);
  assert.match(serverSource, /aeroplane-chess['"], ['"]frontend/);
  assert.match(serverSource, /mountAeroplaneChessPollingRoutes/);
  assert.match(serverSource, /aeroplane_chess_match_history/);
  assert.match(pollingSource, /\/message/);
  assert.match(pollingSource, /\/events/);
  assert.match(pollingSource, /transport:\s*'polling'/);
});

test('main server no longer launches or proxies a websocket backend for aeroplane chess', () => {
  const serverSource = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');

  assert.doesNotMatch(serverSource, /require\('net'\)/);
  assert.doesNotMatch(serverSource, /require\('child_process'\)/);
  assert.doesNotMatch(serverSource, /startAeroplaneChessBackend/);
  assert.doesNotMatch(serverSource, /proxyAeroplaneChessUpgrade/);
  assert.doesNotMatch(serverSource, /AEROPLANE_CHESS_PORT/);
  assert.doesNotMatch(serverSource, /ensureAeroplaneChessBackendRunning/);
  assert.doesNotMatch(serverSource, /\.on\('upgrade'/);
});

test('aeroplane chess frontend uses http polling transport in source and public deployment', () => {
  const sourceFiles = [
    path.join(gameDir, 'js', 'websocketClient.js'),
    path.join(gameDir, 'js', 'pollingTransport.js'),
    path.join(gameDir, 'js', 'multiplayerManager.js'),
    path.join(gameDir, 'js', 'multiplayerGameManager.js'),
    path.join(publicGameDir, 'js', 'websocketClient.js'),
    path.join(publicGameDir, 'js', 'pollingTransport.js'),
    path.join(publicGameDir, 'js', 'multiplayerManager.js'),
    path.join(publicGameDir, 'js', 'multiplayerGameManager.js')
  ];

  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /PollingTransport|\/api\/aeroplane-chess|connect\(\)/);
    assert.doesNotMatch(source, /new WebSocket\(/);
    assert.doesNotMatch(source, /wss?:\/\/[^`'"]*\/ws/);
    assert.doesNotMatch(source, /\/ws/);
  }
});

test('polling websocket compatibility client keeps bindable lifecycle handlers', () => {
  const sourceFiles = [
    path.join(gameDir, 'js', 'websocketClient.js'),
    path.join(publicGameDir, 'js', 'websocketClient.js')
  ];

  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /onOpen\(event\)/);
    assert.match(source, /onClose\(event\)/);
    assert.match(source, /onError\(error\)/);
    assert.doesNotMatch(source, /this\.onOpen\s*=\s*null/);
    assert.doesNotMatch(source, /this\.onClose\s*=\s*null/);
    assert.doesNotMatch(source, /this\.onError\s*=\s*null/);
  }
});

test('create room errors never render undefined', () => {
  const source = fs.readFileSync(path.join(gameDir, 'js', 'multiplayerManager.js'), 'utf8');
  const publicSource = fs.readFileSync(path.join(publicGameDir, 'js', 'multiplayerManager.js'), 'utf8');

  assert.match(source, /normalizeCreateRoomError/);
  assert.match(publicSource, /normalizeCreateRoomError/);
  assert.doesNotMatch(source, /创建房间失败[^\n]+undefined/);
  assert.doesNotMatch(publicSource, /创建房间失败[^\n]+undefined/);
  assert.match(source, /\.connect\(\)\.catch\(reject\)/);
  assert.match(publicSource, /\.connect\(\)\.catch\(reject\)/);
});

test('online no-movable turns are advanced by the authoritative client', () => {
  const sourceFiles = [
    path.join(gameDir, 'js', 'dice.js'),
    path.join(publicGameDir, 'js', 'dice.js')
  ];

  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /const shouldAdvanceOnlineNoMovableTurn = isLocalPlayer \|\| isHost;/);
    assert.match(source, /reason: 'noMovableChess'/);
    assert.doesNotMatch(source, /无法移动，等待服务器同步玩家切换/);
  }
});

test('aeroplane chess home page has toolbox return link and no qq feedback', () => {
  const homeFiles = [
    path.join(gameDir, 'index.html'),
    path.join(publicGameDir, 'index.html')
  ];
  const styleFiles = [
    path.join(gameDir, 'css', 'style.css'),
    path.join(publicGameDir, 'css', 'style.css')
  ];

  for (const file of homeFiles) {
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /class="toolbox-home-link"/);
    assert.match(html, /href="https:\/\/wjdr\.store\/"/);
    assert.doesNotMatch(html, /Bug反馈QQ群/);
    assert.doesNotMatch(html, /1097294452/);
    assert.doesNotMatch(html, /qq-group-number/);
  }

  for (const file of styleFiles) {
    const css = fs.readFileSync(file, 'utf8');
    assert.match(css, /\.toolbox-home-link/);
    assert.doesNotMatch(css, /\.footer-feedback/);
    assert.doesNotMatch(css, /\.qq-group-number/);
  }
});

test('polling transport ignores already delivered event sequences', async () => {
  const { PollingTransport } = await importPollingTransport(gameDir);
  const transport = new PollingTransport({ playerId: 'player-test' });
  const delivered = [];
  transport.onmessage = (event) => delivered.push(JSON.parse(event.data));

  transport._deliverEvents([
    { seq: 10, type: 'diceRoll', diceValue: 1, player: 1 },
    { seq: 10, type: 'diceRoll', diceValue: 1, player: 1 },
    { seq: 9, type: 'noMovableChess', diceValue: 1, player: 1 },
    { seq: 11, type: 'playerTurnChange', newPlayer: 2 }
  ]);

  assert.deepEqual(delivered.map((event) => event.type), ['diceRoll', 'playerTurnChange']);

  const publicSource = fs.readFileSync(path.join(publicGameDir, 'js', 'pollingTransport.js'), 'utf8');
  assert.match(publicSource, /_lastDeliveredSeq/);
  assert.match(publicSource, /eventSeq <= this\._lastDeliveredSeq/);
});
