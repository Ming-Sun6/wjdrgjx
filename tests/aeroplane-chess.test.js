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

test('homepage places aeroplane chess in mini games alliance activity section', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const miniStart = html.indexOf('id="miniGameWarehouse"');
  const miniEnd = html.indexOf('<!-- 暂时隐藏活动日历入口');
  const extendedStart = html.indexOf('id="extendedToolWarehouse"');
  const extendedEnd = miniStart;
  const aeroplaneIndex = html.indexOf('href="function/aeroplane-chess/"');

  assert.notEqual(miniStart, -1);
  assert.notEqual(miniEnd, -1);
  assert.notEqual(aeroplaneIndex, -1);
  assert.match(html, /data-tool-tab="miniGames"[^>]*>小游戏<\/button>/);
  assert.match(html, /<div class="warehouse-title">小游戏<\/div>/);
  assert.match(html, /联盟活动/);
  assert.match(html, /活跃升温小游戏/);
  assert.ok(aeroplaneIndex > miniStart && aeroplaneIndex < miniEnd);

  const miniSection = html.slice(miniStart, miniEnd);
  const extendedSection = html.slice(extendedStart, extendedEnd);
  assert.match(miniSection, /data-category="miniGames" data-tool-priority="miniGames"[\s\S]*href="function\/aeroplane-chess\/"/);
  assert.doesNotMatch(extendedSection, /function\/aeroplane-chess\//);
  assert.match(html, /lower==='minigames'\|\|lower==='game'\|\|lower==='games'/);
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

test('polling transport drops stale queued events before opening a fresh connection', () => {
  const transportFiles = [
    path.join(gameDir, 'js', 'pollingTransport.js'),
    path.join(publicGameDir, 'js', 'pollingTransport.js')
  ];
  const pollingApiSource = fs.readFileSync(path.join(rootDir, 'aeroplane-chess-polling.js'), 'utf8');

  assert.match(pollingApiSource, /reset:\s*req\.query\.reset/);
  assert.match(pollingApiSource, /playerEvents\.set\(playerId,\s*\[\]\)/);

  for (const file of transportFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /_resetQueuedEventsBeforePolling\(\)/);
    assert.match(source, /reset=1/);
    assert.match(source, /this\._since\s*=\s*Number\(data\.nextSeq\)/);
    assert.match(source, /await this\._resetQueuedEventsBeforePolling\(\)/);
    assert.match(source, /this\._schedulePoll\(50\)/);
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

test('multiplayer manager avoids duplicate method overrides and keys players by id', () => {
  const managerFiles = [
    path.join(gameDir, 'js', 'multiplayerManager.js'),
    path.join(publicGameDir, 'js', 'multiplayerManager.js')
  ];
  const duplicateSensitiveMethods = [
    'showJoinRoomModal',
    'hideJoinRoomModal',
    'clearRoomCodeInputs',
    'focusFirstInput',
    'getRoomCode',
    'joinRoom',
    'showJoinRoomError',
    'hideJoinRoomError',
    'showInputError',
    'initRoomCodeInputs'
  ];

  for (const file of managerFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const method of duplicateSensitiveMethods) {
      const matches = source.match(new RegExp(`\\n\\s*(?:async\\s+)?${method}\\(`, 'g')) || [];
      assert.equal(matches.length, 1, `${path.basename(file)} should define ${method} once`);
    }
    assert.match(source, /this\.players\s*=\s*new Map\(roomData\.players\.map\(p => \[p\.id, p\]\)\)/);
    assert.doesNotMatch(source, /this\.players\s*=\s*new Map\(roomData\.players\.map\(p => \[p\.color, p\]\)\)/);
  }
});

test('clearing reconnect state preserves cached lobby nickname', () => {
  const reconnectFiles = [
    path.join(gameDir, 'js', 'reconnectManager.js'),
    path.join(publicGameDir, 'js', 'reconnectManager.js')
  ];

  for (const file of reconnectFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const clearBody = source.match(/clearPlayerIdentity\(\)\s*\{([\s\S]*?)\n    \}/);
    assert.ok(clearBody, `${path.basename(file)} should define clearPlayerIdentity`);
    assert.doesNotMatch(clearBody[1], /removeItem\('aeroplaneChess_playerNickname'\)/);
    assert.match(clearBody[1], /removeItem\('aeroplaneChess_playerEmoji'\)/);
    assert.match(clearBody[1], /removeItem\('aeroplaneChess_isHost'\)/);
  }
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
    assert.match(html, /href="https:\/\/wjgl\.store\/"/);
    const mainMenuStart = html.indexOf('id="mainMenuContainer"');
    const mainMenuEnd = html.indexOf('id="playerConfigWrapper"');
    const linkIndex = html.indexOf('class="toolbox-home-link"');
    assert.ok(linkIndex < mainMenuStart);
    assert.doesNotMatch(html, /wjdr\.store/);
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

test('toolbox return link is shown only on the aeroplane chess main menu', () => {
  const indexMainFiles = [
    path.join(gameDir, 'js', 'indexMain.js'),
    path.join(publicGameDir, 'js', 'indexMain.js')
  ];

  for (const file of indexMainFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /setToolboxHomeLinkVisible\(visible\)/);
    assert.match(source, /showMainMenu\(\)[\s\S]*this\.setToolboxHomeLinkVisible\(true\)/);
    assert.match(source, /showConfigPanel\(\)[\s\S]*this\.setToolboxHomeLinkVisible\(false\)/);
    assert.match(source, /showOnlineMultiplayerConfig\(\)[\s\S]*this\.setToolboxHomeLinkVisible\(false\)/);
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

test('polling transport keeps connection open across transient poll failures', async () => {
  const { PollingTransport } = await importPollingTransport(gameDir);
  const originalFetch = global.fetch;
  let errorCount = 0;
  global.fetch = async () => {
    throw new Error('temporary network failure');
  };
  const transport = new PollingTransport({ playerId: 'player-test', pollDelay: 100000 });
  transport.readyState = PollingTransport.OPEN;
  transport.onerror = () => {
    errorCount += 1;
  };

  try {
    await transport._poll();
  } finally {
    global.fetch = originalFetch;
    if (transport._pollTimer) clearTimeout(transport._pollTimer);
  }

  assert.equal(transport.readyState, PollingTransport.OPEN);
  assert.equal(errorCount, 0);

  const publicSource = fs.readFileSync(path.join(publicGameDir, 'js', 'pollingTransport.js'), 'utf8');
  assert.match(publicSource, /_pollFailureCount/);
  assert.match(publicSource, /this\._pollFailureCount >= this\._maxSilentPollFailures/);
});

test('online inactivity timeout enables ai takeover after one minute', () => {
  const gameStateFiles = [
    path.join(gameDir, 'js', 'gameState.js'),
    path.join(publicGameDir, 'js', 'gameState.js')
  ];
  const indexMainFiles = [
    path.join(gameDir, 'js', 'indexMain.js'),
    path.join(publicGameDir, 'js', 'indexMain.js')
  ];
  const multiplayerGameManagerFiles = [
    path.join(gameDir, 'js', 'multiplayerGameManager.js'),
    path.join(publicGameDir, 'js', 'multiplayerGameManager.js')
  ];

  for (const file of gameStateFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /this\.THINKING_TIME\s*=\s*60000/);
    assert.doesNotMatch(source, /this\.THINKING_TIME\s*=\s*20000/);
  }

  for (const file of indexMainFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /60秒|1分钟/);
    assert.doesNotMatch(source, /20秒的思考时长/);
  }

  for (const file of multiplayerGameManagerFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /游戏尚未正式开始，且为人类玩家回合，不启动超时计时器/);
    assert.doesNotMatch(source, /允许无限等待直到首发玩家操作/);
  }
});

test('aeroplane chess rooms support configurable takeoff rules', () => {
  const homeFiles = [
    path.join(gameDir, 'index.html'),
    path.join(publicGameDir, 'index.html')
  ];
  const managerFiles = [
    path.join(gameDir, 'js', 'multiplayerManager.js'),
    path.join(publicGameDir, 'js', 'multiplayerManager.js')
  ];
  const gameStateFiles = [
    path.join(gameDir, 'js', 'gameState.js'),
    path.join(publicGameDir, 'js', 'gameState.js')
  ];
  const movementFiles = [
    path.join(gameDir, 'js', 'chessPiece.js'),
    path.join(gameDir, 'js', 'dice.js'),
    path.join(gameDir, 'js', 'uiUpdater.js'),
    path.join(gameDir, 'js', 'multiplayerGameManager.js'),
    path.join(gameDir, 'js', 'botController.js'),
    path.join(publicGameDir, 'js', 'chessPiece.js'),
    path.join(publicGameDir, 'js', 'dice.js'),
    path.join(publicGameDir, 'js', 'uiUpdater.js'),
    path.join(publicGameDir, 'js', 'multiplayerGameManager.js'),
    path.join(publicGameDir, 'js', 'botController.js')
  ];
  const gameMainFiles = [
    path.join(gameDir, 'js', 'gameMain.js'),
    path.join(publicGameDir, 'js', 'gameMain.js')
  ];
  const styleFiles = [
    path.join(gameDir, 'css', 'style.css'),
    path.join(publicGameDir, 'css', 'style.css')
  ];

  for (const file of homeFiles) {
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /id="takeoffRuleSix"/);
    assert.match(html, /id="takeoffRuleEven"/);
    assert.match(html, /data-takeoff-rule="six"/);
    assert.match(html, /data-takeoff-rule="even"/);
  }

  for (const file of managerFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /getSelectedTakeoffRule/);
    assert.match(source, /setTakeoffRule/);
    assert.match(source, /document\.querySelector\('#hostSettings \.takeoff-rule-option\.selected'\)/);
    assert.match(source, /document\.querySelector\('#hostSettings \.takeoff-rule-selector'\)/);
    assert.doesNotMatch(source, /document\.querySelector\('\.takeoff-rule-selector'\)/);
    assert.doesNotMatch(source, /document\.querySelector\('\.takeoff-rule-option\.selected'\)/);
    assert.match(source, /takeoffRule:\s*this\.getSelectedTakeoffRule\(\)/);
    assert.match(source, /settings:\s*{[\s\S]*takeoffRule:\s*rule/);
  }

  for (const file of gameStateFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /this\.takeoffRule\s*=\s*'even'/);
    assert.match(source, /setTakeoffRule\(rule\)/);
    assert.match(source, /canTakeoff\(diceValue\)/);
    assert.match(source, /this\.takeoffRule\s*===\s*'six'\s*\?\s*value\s*===\s*6\s*:\s*\(value\s*===\s*2\s*\|\|\s*value\s*===\s*4\s*\|\|\s*value\s*===\s*6\)/);
  }

  for (const file of movementFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /canTakeoff\(/);
    assert.doesNotMatch(source, /diceValue\s*%\s*2\s*===\s*0/);
    assert.doesNotMatch(source, /gameData\.diceValue\s*%\s*2\s*===\s*0/);
  }

  for (const file of gameMainFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /takeoffRule:\s*multiplayerGameData\.takeoffRule\s*\|\|\s*'even'/);
    assert.match(source, /gameState\.setTakeoffRule\(multiplayerGameData\.takeoffRule\s*\|\|\s*'even'\)/);
    assert.match(source, /gameState\.setTakeoffRule\(gameConfig\.takeoffRule\s*\|\|\s*'even'\)/);
  }

  for (const file of styleFiles) {
    const css = fs.readFileSync(file, 'utf8');
    assert.match(css, /\.takeoff-rule-selector\s*{[\s\S]*border:\s*2px solid var\(--border-light\)/);
    assert.match(css, /\.takeoff-rule-option\.selected\s*{[\s\S]*background:\s*#e9c1df/);
  }
});

test('ai battle and local multiplayer carry the selected takeoff rule into game config', () => {
  const homeFiles = [
    path.join(gameDir, 'index.html'),
    path.join(publicGameDir, 'index.html')
  ];
  const indexMainFiles = [
    path.join(gameDir, 'js', 'indexMain.js'),
    path.join(publicGameDir, 'js', 'indexMain.js')
  ];

  for (const file of homeFiles) {
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /id="aiTakeoffRuleEven"/);
    assert.match(html, /id="aiTakeoffRuleSix"/);
    assert.match(html, /id="localTakeoffRuleEven"/);
    assert.match(html, /id="localTakeoffRuleSix"/);
  }

  for (const file of indexMainFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /getSelectedModeTakeoffRule\('ai'\)/);
    assert.match(source, /getSelectedModeTakeoffRule\('local'\)/);
    assert.match(source, /takeoffRule:\s*this\.getSelectedModeTakeoffRule\('ai'\)/);
    assert.match(source, /takeoffRule:\s*this\.getSelectedModeTakeoffRule\('local'\)/);
    assert.match(source, /selectedTakeoffRule:\s*this\.getSelectedModeTakeoffRule\('ai'\)/);
    assert.match(source, /takeoffRule:\s*this\.getSelectedModeTakeoffRule\('local'\)/);
  }
});

test('online lobby recalculates start button immediately after ai roster changes', () => {
  const managerFiles = [
    path.join(gameDir, 'js', 'multiplayerManager.js'),
    path.join(publicGameDir, 'js', 'multiplayerManager.js')
  ];

  for (const file of managerFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /case 'aiPlayerAdded':[\s\S]*this\.currentRoom\s*=\s*data\.room[\s\S]*this\.updateStartGameButton\(\)/);
    assert.match(source, /case 'aiPlayerRemoved':[\s\S]*this\.currentRoom\s*=\s*data\.room[\s\S]*this\.updateStartGameButton\(\)/);
    assert.match(source, /case 'aiDifficultyUpdated':[\s\S]*this\.currentRoom\s*=\s*data\.room[\s\S]*this\.updateStartGameButton\(\)/);
  }
});

test('online settlement return clears reconnect state instead of re-entering a finished room', () => {
  const settlementFiles = [
    path.join(gameDir, 'js', 'settlementModal.js'),
    path.join(publicGameDir, 'js', 'settlementModal.js')
  ];

  for (const file of settlementFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /const\s+settlementGameSessionId\s*=\s*multiplayerGameManager\?\.gameSessionId/);
    assert.match(source, /multiplayerGameManager\.sendMessage\('returnToRoom',\s*\{[\s\S]*gameSessionId:\s*settlementGameSessionId[\s\S]*roomCode:\s*settlementRoomCode/);
    assert.match(source, /reconnectManager\.clearPlayerIdentity\(\)/);
    assert.match(source, /sessionStorage\.removeItem\('multiplayerGameData'\)/);
    assert.match(source, /sessionStorage\.removeItem\('gameConfig'\)/);
    assert.match(source, /sendMessage\('returnToRoom'[\s\S]*multiplayerGameManager\.gameSessionId\s*=\s*null/);
    assert.doesNotMatch(source, /window\.location\.replace\(`\.\/\?room=\$\{roomCode\}`\)/);
  }
});

test('missing online room errors clear stale room context and return to lobby', () => {
  const managerFiles = [
    path.join(gameDir, 'js', 'multiplayerManager.js'),
    path.join(publicGameDir, 'js', 'multiplayerManager.js')
  ];

  for (const file of managerFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /handleMissingRoomError\(message\)/);
    assert.match(source, /case 'error':[\s\S]*this\.handleMissingRoomError\(errorMessage\)[\s\S]*break;/);
    assert.match(source, /url\.searchParams\.delete\('room'\)/);
    assert.match(source, /reconnectManager\.clearPlayerIdentity\(\)/);
    assert.match(source, /sessionStorage\.removeItem\('multiplayerGameData'\)/);
    assert.match(source, /sessionStorage\.removeItem\('gameConfig'\)/);
    assert.match(source, /this\.roomCode\s*=\s*null/);
    assert.match(source, /this\.showRoomSelection\(\)/);
  }
});

test('online pause return home clears stale multiplayer session before leaving game page', () => {
  const handlerFiles = [
    path.join(gameDir, 'js', 'eventHandler.js'),
    path.join(publicGameDir, 'js', 'eventHandler.js')
  ];

  for (const file of handlerFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const method = source.match(/handleReturnHomeClick\(\)\s*\{([\s\S]*?)\n    \}/);
    assert.ok(method, `${path.basename(file)} should define handleReturnHomeClick`);
    assert.match(method[1], /sessionStorage\.removeItem\('multiplayerGameData'\)/);
    assert.match(method[1], /sessionStorage\.removeItem\('gameConfig'\)/);
    assert.match(method[1], /sessionStorage\.removeItem\('aeroplaneChess_roomCode'\)/);
    assert.match(method[1], /sessionStorage\.removeItem\('aeroplaneChess_gameSessionId'\)/);
    assert.match(method[1], /reconnectManager\.clearPlayerIdentity\(\)/);
    assert.match(method[1], /multiplayerGameManager\.gameSessionId\s*=\s*null/);
    assert.match(method[1], /window\.location\.replace\('\.\/'\)/);
  }
});

test('online game page clears stale session when rejoin reports invalid session errors', () => {
  const gameManagerFiles = [
    path.join(gameDir, 'js', 'multiplayerGameManager.js'),
    path.join(publicGameDir, 'js', 'multiplayerGameManager.js')
  ];

  for (const file of gameManagerFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const method = source.match(/handleError\(data\)\s*\{([\s\S]*?)\n    \}/);
    assert.ok(method, `${path.basename(file)} should define handleError`);
    assert.match(method[1], /this\.handleInvalidSessionError\(data\.message\)/);
    assert.match(source, /handleInvalidSessionError\(message\)/);
    assert.match(source, /text\.includes\('房间'\)[\s\S]*text\.includes\('不存在'\)[\s\S]*text\.includes\('销毁'\)/);
    assert.match(source, /text\.includes\('游戏正在进行中'\)[\s\S]*text\.includes\('无法加入新玩家'\)/);
    assert.match(source, /sessionStorage\.removeItem\('multiplayerGameData'\)/);
    assert.match(source, /sessionStorage\.removeItem\('gameConfig'\)/);
    assert.match(source, /sessionStorage\.removeItem\('aeroplaneChess_roomCode'\)/);
    assert.match(source, /sessionStorage\.removeItem\('aeroplaneChess_gameSessionId'\)/);
    assert.match(source, /localStorage\.removeItem\('flyingChessGameState'\)/);
    assert.match(source, /this\.disableReconnect\s*=\s*true/);
    assert.match(source, /window\.location\.replace\('\.\/'\)/);
  }
});

test('game page rejects online session cache when local player is missing from player list', () => {
  const gameMainFiles = [
    path.join(gameDir, 'js', 'gameMain.js'),
    path.join(publicGameDir, 'js', 'gameMain.js')
  ];

  for (const file of gameMainFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /isInvalidOnlineSessionCache\(multiplayerGameData\)/);
    assert.match(source, /this\.clearStaleOnlineSessionCache\(\)/);
    assert.match(source, /const\s+localPlayerId\s*=\s*multiplayerGameData\.wsClient\?\.playerId/);
    assert.match(source, /!multiplayerGameData\.players\.some\(player\s*=>\s*player\.id\s*===\s*localPlayerId\)/);
    assert.match(source, /sessionStorage\.removeItem\('multiplayerGameData'\)/);
    assert.match(source, /sessionStorage\.removeItem\('gameConfig'\)/);
    assert.match(source, /localStorage\.removeItem\('flyingChessGameState'\)/);
    assert.match(source, /window\.location\.replace\('\.\/'\)/);
  }
});

test('leaving online room clears stale game page session cache', () => {
  const managerFiles = [
    path.join(gameDir, 'js', 'multiplayerManager.js'),
    path.join(publicGameDir, 'js', 'multiplayerManager.js')
  ];

  for (const file of managerFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const method = source.match(/leaveRoom\(shouldRedirect\s*=\s*false\)\s*\{([\s\S]*?)\n    showMainMenu\(\)/);
    assert.ok(method, `${path.basename(file)} should define leaveRoom`);
    assert.match(method[1], /sessionStorage\.removeItem\('multiplayerGameData'\)/);
    assert.match(method[1], /sessionStorage\.removeItem\('gameConfig'\)/);
    assert.match(method[1], /sessionStorage\.removeItem\('aeroplaneChess_roomCode'\)/);
    assert.match(method[1], /sessionStorage\.removeItem\('aeroplaneChess_gameSessionId'\)/);
    assert.match(method[1], /localStorage\.removeItem\('flyingChessGameState'\)/);
  }
});

test('aeroplane chess room chat identifies player colors, spectators, and custom game names', () => {
  const homeFiles = [
    path.join(gameDir, 'index.html'),
    path.join(publicGameDir, 'index.html')
  ];
  const managerFiles = [
    path.join(gameDir, 'js', 'multiplayerManager.js'),
    path.join(publicGameDir, 'js', 'multiplayerManager.js')
  ];
  const styleFiles = [
    path.join(gameDir, 'css', 'style.css'),
    path.join(publicGameDir, 'css', 'style.css')
  ];

  for (const file of homeFiles) {
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /id="lobbyNicknameInput"/);
    assert.match(html, /placeholder="设置昵称"/);
  }

  for (const file of managerFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /getLobbyNickname\(\)/);
    assert.match(source, /getPreferredNickname\(\)/);
    assert.match(source, /nickname:\s*nickname/);
    assert.doesNotMatch(source, /name:\s*this\.getCreateRoomName\(\)/);
    assert.match(source, /isSpectator/);
    assert.match(source, /\$\{safeName\}\(观众\)：/);
    assert.match(source, /room-chat-spectator-name/);
    assert.match(source, /getRoomChatNameColorClass\(item\.playerNumber, item\.isSpectator\)/);
  }

  for (const file of styleFiles) {
    const css = fs.readFileSync(file, 'utf8');
    assert.match(css, /\.player-1-name/);
    assert.match(css, /\.player-2-name/);
    assert.match(css, /\.player-3-name/);
    assert.match(css, /\.player-4-name/);
    assert.match(css, /\.room-chat-spectator-name/);
  }
});

test('aeroplane chess lobby nickname is mobile friendly and cached while typing', () => {
  const managerFiles = [
    path.join(gameDir, 'js', 'multiplayerManager.js'),
    path.join(publicGameDir, 'js', 'multiplayerManager.js')
  ];
  const styleFiles = [
    path.join(gameDir, 'css', 'style.css'),
    path.join(publicGameDir, 'css', 'style.css')
  ];

  for (const file of managerFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /bindLobbyNicknamePersistence\(\)/);
    assert.match(source, /this\.bindLobbyNicknamePersistence\(\)/);
    assert.match(source, /document\.getElementById\('lobbyNicknameInput'\)/);
    assert.match(source, /addEventListener\('input'/);
    assert.match(source, /window\.playerIdManager\.saveNickname\(nickname\)/);
    assert.match(source, /this\.applyLobbyNicknameToRoomInput\(\)/);
  }

  for (const file of styleFiles) {
    const css = fs.readFileSync(file, 'utf8');
    assert.match(css, /\.lobby-nickname-setting\s*\{[\s\S]*width:\s*min\(360px,\s*calc\(100%\s*-\s*24px\)\)/);
    assert.match(css, /\.lobby-nickname-input\s*\{[\s\S]*box-sizing:\s*border-box/);
    assert.match(css, /\.lobby-nickname-input\s*\{[\s\S]*font-size:\s*16px/);
    assert.match(css, /@media\s*\(max-width:\s*520px\)\s*\{[\s\S]*\.lobby-nickname-setting\s*\{[\s\S]*width:\s*100%/);
    assert.match(css, /@media\s*\(max-width:\s*520px\)\s*\{[\s\S]*\.lobby-nickname-input\s*\{[\s\S]*height:\s*42px/);
  }
});

test('online ai takeover lets the local player resume manual control on their own turn', () => {
  const managerFiles = [
    path.join(gameDir, 'js', 'multiplayerGameManager.js'),
    path.join(publicGameDir, 'js', 'multiplayerGameManager.js')
  ];
  const eventHandlerFiles = [
    path.join(gameDir, 'js', 'eventHandler.js'),
    path.join(publicGameDir, 'js', 'eventHandler.js')
  ];
  const uiFiles = [
    path.join(gameDir, 'js', 'uiUpdater.js'),
    path.join(publicGameDir, 'js', 'uiUpdater.js')
  ];

  for (const file of managerFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /clearLocalAITakeoverForManualAction\(/);
    assert.match(source, /reason:\s*reason\s*\|\|\s*'manual_action'/);
    assert.match(source, /applyRemoteTakeoverState\(false\)/);
  }

  for (const file of eventHandlerFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /clearLocalAITakeoverForManualAction\('manual_dice_click'\)/);
    assert.match(source, /clearLocalAITakeoverForManualAction\('manual_chess_click'\)/);
  }

  for (const file of uiFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /const isActualBotPlayer = gameState\.isBotPlayer\(currentPlayer\)/);
    assert.match(source, /\(isActualBotPlayer && !isCurrentPlayerLocal\)/);
    assert.doesNotMatch(source, /const shouldDisable = gamePhase !== 'rolling' \|\| isRolling \|\| isBot \|\| !canControl/);
  }
});

test('manual online ai takeover resume cancels stale timers and bot processing locks', () => {
  const managerFiles = [
    path.join(gameDir, 'js', 'multiplayerGameManager.js'),
    path.join(publicGameDir, 'js', 'multiplayerGameManager.js')
  ];

  for (const file of managerFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const match = source.match(/clearLocalAITakeoverForManualAction\(reason = 'manual_action'\) \{[\s\S]*?\n    \}/);
    assert.ok(match, `${file} should define clearLocalAITakeoverForManualAction`);
    const method = match[0];

    assert.match(method, /clearThinkingTimer\(\)/);
    assert.match(method, /setAIDecisionInProgress\(false\)/);
    assert.match(method, /window\.botController\.isProcessing\s*=\s*false/);
    assert.match(method, /window\.botController\.lastProcessedPlayer\s*=\s*null/);
    assert.match(method, /window\.botController\.lastProcessedPhase\s*=\s*null/);
    assert.match(method, /window\.uiUpdater\.stopThinkingProgressBar\(\)/);
  }
});

test('online thinking timeout never falls back to local global ai takeover', () => {
  const gameStateFiles = [
    path.join(gameDir, 'js', 'gameState.js'),
    path.join(publicGameDir, 'js', 'gameState.js')
  ];

  for (const file of gameStateFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const match = source.match(/handleThinkingTimeout\(\) \{[\s\S]*?\n    \}/);
    assert.ok(match, `${file} should define handleThinkingTimeout`);
    const method = match[0];
    const onlineBlockIndex = method.indexOf('if (this.isOnlineMultiplayer)');
    const localTakeoverIndex = method.indexOf("import('./aiTakeoverManager.js')");

    assert.notEqual(onlineBlockIndex, -1);
    assert.notEqual(localTakeoverIndex, -1);
    assert.ok(onlineBlockIndex < localTakeoverIndex, `${file} should handle online timeout before local takeover fallback`);
    assert.match(method, /reason:\s*'thinking_timeout'/);
    assert.match(method, /不要回退到本地全局托管/);
    assert.match(method, /shouldStartNewTimer:\s*false/);
  }
});

test('toolbox admin integrates aeroplane chess management page and api routes', () => {
  const serverSource = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');
  const adminHtml = fs.readFileSync(
    path.join(rootDir, 'public', 'function', '_ops', 'console-7a9', 'internal', 'admin.html'),
    'utf8'
  );
  const adminScript = fs.readFileSync(path.join(rootDir, 'public', 'function', 'admin-aeroplane-chess-page.js'), 'utf8');

  assert.match(adminHtml, /data-page="aeroplane-chess"/);
  assert.match(adminHtml, />飞行棋管理</);
  assert.match(adminHtml, /id="aeroplaneChessOverview"/);
  assert.match(adminHtml, /admin-aeroplane-chess-page\.js/);

  assert.match(adminScript, /\/api\/admin\/aeroplane-chess\/overview/);
  assert.match(adminScript, /\/api\/admin\/aeroplane-chess\/rooms/);
  assert.match(adminScript, /\/api\/admin\/aeroplane-chess\/history/);
  assert.match(adminScript, /\/api\/admin\/aeroplane-chess\/rooms\/'\s*\+\s*encodeURIComponent\(code\)\s*\+\s*'\/destroy/);
  assert.match(adminScript, /window\.adminAeroplaneChess/);

  assert.match(serverSource, /const aeroplaneChessPollingService\s*=\s*mountAeroplaneChessPollingRoutes/);
  assert.match(serverSource, /app\.get\('\/api\/admin\/aeroplane-chess\/overview'/);
  assert.match(serverSource, /app\.get\('\/api\/admin\/aeroplane-chess\/rooms'/);
  assert.match(serverSource, /app\.get\('\/api\/admin\/aeroplane-chess\/history'/);
  assert.match(serverSource, /app\.post\('\/api\/admin\/aeroplane-chess\/rooms\/:code\/destroy'/);
  assert.match(serverSource, /app\.post\('\/api\/admin\/aeroplane-chess\/cleanup'/);
  assert.match(serverSource, /requireAdmin\(req,\s*res\)/);
});
