const test = require('node:test');
const assert = require('node:assert/strict');

const { createAeroplaneChessPollingService } = require('../aeroplane-chess-polling');

test('polling service creates rooms in memory and lists them without database writes', async () => {
  const historyWrites = [];
  const service = createAeroplaneChessPollingService({
    recordHistory: async (entry) => historyWrites.push(entry)
  });

  const createResult = await service.handleMessage({
    type: 'createRoom',
    playerId: 'host-1',
    data: { nickname: 'Host', emoji: 'smile' }
  });
  const created = createResult.events.find((event) => event.type === 'roomCreated');

  assert.ok(created);
  assert.equal(created.room.players.length, 1);
  assert.equal(created.room.players[0].nickname, 'Host');
  assert.match(created.room.code, /^[A-Z]{4}$/);

  const listResult = await service.handleMessage({
    type: 'listRooms',
    playerId: 'guest-1'
  });

  assert.equal(listResult.events[0].type, 'roomsList');
  assert.equal(listResult.events[0].rooms.length, 1);
  assert.equal(listResult.events[0].rooms[0].code, created.room.code);
  assert.deepEqual(historyWrites, []);
});

test('polling service queues room events for other players', async () => {
  const service = createAeroplaneChessPollingService();
  const created = (await service.handleMessage({
    type: 'createRoom',
    playerId: 'host-1',
    data: { nickname: 'Host' }
  })).events[0];

  const joinResult = await service.handleMessage({
    type: 'join_room',
    playerId: 'guest-1',
    data: { roomCode: created.room.code, nickname: 'Guest' }
  });

  assert.equal(joinResult.events[0].type, 'roomJoined');
  assert.equal(joinResult.events[0].room.players.length, 2);

  const hostEvents = service.pollEvents({ playerId: 'host-1', since: 0 });
  assert.ok(hostEvents.events.some((event) => event.type === 'playerJoined'));
});

test('polling service starts games and records history only when game ends', async () => {
  const historyWrites = [];
  const service = createAeroplaneChessPollingService({
    recordHistory: async (entry) => historyWrites.push(entry)
  });

  const created = (await service.handleMessage({
    type: 'createRoom',
    playerId: 'host-1',
    data: { nickname: 'Host' }
  })).events[0];

  await service.handleMessage({
    type: 'join_room',
    playerId: 'guest-1',
    data: { roomCode: created.room.code, nickname: 'Guest' }
  });
  await service.handleMessage({
    type: 'toggle_ready',
    playerId: 'guest-1',
    roomCode: created.room.code,
    data: { isReady: true }
  });

  const startResult = await service.handleMessage({
    type: 'startGame',
    playerId: 'host-1',
    roomCode: created.room.code
  });
  const started = startResult.events.find((event) => event.type === 'gameStarted');

  assert.ok(started);
  assert.equal(started.room.gameState, 'playing');
  assert.match(started.gameSessionId, /^game_/);
  assert.equal(historyWrites.length, 0);

  await service.handleMessage({
    type: 'gameEnd',
    playerId: 'host-1',
    gameSessionId: started.gameSessionId,
    winnerPlayer: 1,
    timestamp: 12345
  });

  assert.equal(historyWrites.length, 1);
  assert.equal(historyWrites[0].roomCode, created.room.code);
  assert.equal(historyWrites[0].winnerPlayer, 1);

  const guestEvents = service.pollEvents({ playerId: 'guest-1', since: 0 });
  assert.ok(guestEvents.events.some((event) => event.type === 'gameStarted'));
  assert.ok(guestEvents.events.some((event) => event.type === 'gameEnd'));
});

test('polling service marks audio loaded when all real players loaded and ignores ai players', async () => {
  const service = createAeroplaneChessPollingService();
  const created = (await service.handleMessage({
    type: 'createRoom',
    playerId: 'host-1',
    data: { nickname: 'Host' }
  })).events[0];

  await service.handleMessage({
    type: 'join_room',
    playerId: 'guest-1',
    data: { roomCode: created.room.code, nickname: 'Guest' }
  });
  await service.handleMessage({
    type: 'add_ai_player',
    playerId: 'host-1',
    roomCode: created.room.code,
    data: { colorIndex: 3, difficulty: 'easy' }
  });
  await service.handleMessage({
    type: 'add_ai_player',
    playerId: 'host-1',
    roomCode: created.room.code,
    data: { colorIndex: 4, difficulty: 'easy' }
  });

  const startResult = await service.handleMessage({
    type: 'startGame',
    playerId: 'host-1',
    roomCode: created.room.code
  });
  const started = startResult.events.find((event) => event.type === 'gameStarted');

  assert.equal(started.players.length, 4);
  assert.equal(started.players.filter((player) => !player.isAI).length, 2);

  await service.handleMessage({
    type: 'audioLoaded',
    playerId: 'host-1',
    roomCode: created.room.code,
    gameSessionId: started.gameSessionId
  });
  const afterHost = service.pollEvents({ playerId: 'guest-1', since: 0 });
  assert.ok(afterHost.events.some((event) => event.type === 'audioLoaded'));
  assert.equal(afterHost.events.some((event) => event.type === 'allAudioLoaded'), false);

  const guestLoaded = await service.handleMessage({
    type: 'audioLoaded',
    playerId: 'guest-1',
    roomCode: created.room.code,
    gameSessionId: started.gameSessionId
  });

  assert.ok(guestLoaded.events.some((event) => event.type === 'allAudioLoaded'));
  assert.equal(guestLoaded.events.find((event) => event.type === 'allAudioLoaded').totalPlayers, 2);

  const hostEvents = service.pollEvents({ playerId: 'host-1', since: 0 });
  assert.ok(hostEvents.events.some((event) => event.type === 'allAudioLoaded'));
});
