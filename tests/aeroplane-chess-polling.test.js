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

test('polling service persists takeoff rule in room settings and game start payload', async () => {
  const service = createAeroplaneChessPollingService();

  const created = (await service.handleMessage({
    type: 'createRoom',
    playerId: 'host-1',
    data: { nickname: 'Host', takeoffRule: 'six' }
  })).events.find((event) => event.type === 'roomCreated');

  assert.equal(created.room.settings.takeoffRule, 'six');

  const listed = (await service.handleMessage({
    type: 'listRooms',
    playerId: 'guest-1'
  })).events.find((event) => event.type === 'roomsList');

  assert.equal(listed.rooms[0].takeoffRule, 'six');

  await service.handleMessage({
    type: 'join_room',
    playerId: 'guest-1',
    data: { roomCode: created.room.code, nickname: 'Guest' }
  });

  const started = (await service.handleMessage({
    type: 'startGame',
    playerId: 'host-1',
    roomCode: created.room.code
  })).events.find((event) => event.type === 'gameStarted');

  assert.equal(started.room.settings.takeoffRule, 'six');
  assert.equal(started.takeoffRule, 'six');
  assert.equal(started.gameData.takeoffRule, 'six');
});

test('polling service decorates player and spectator chat messages', async () => {
  const service = createAeroplaneChessPollingService();
  const created = (await service.handleMessage({
    type: 'createRoom',
    playerId: 'host-1',
    data: { nickname: 'Host', name: '联盟娱乐局' }
  })).events.find((event) => event.type === 'roomCreated');

  assert.equal(created.room.name, '联盟娱乐局');

  const playerChat = (await service.handleMessage({
    type: 'chatMessage',
    playerId: 'host-1',
    roomCode: created.room.code,
    data: { message: '开局啦' }
  })).events.find((event) => event.type === 'chatMessage');

  assert.equal(playerChat.playerName, 'Host');
  assert.equal(playerChat.playerNumber, 1);
  assert.equal(playerChat.isSpectator, false);

  await service.handleMessage({
    type: 'spectate_room',
    playerId: 'spectator-1',
    data: { roomCode: created.room.code, nickname: '小明' }
  });

  const spectatorChat = (await service.handleMessage({
    type: 'chatMessage',
    playerId: 'spectator-1',
    roomCode: created.room.code,
    data: { message: '我来观战' }
  })).events.find((event) => event.type === 'chatMessage');

  assert.equal(spectatorChat.playerName, '小明');
  assert.equal(spectatorChat.playerNumber, null);
  assert.equal(spectatorChat.isSpectator, true);
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

test('polling service lets host kick a real player from the room', async () => {
  const service = createAeroplaneChessPollingService();
  const created = (await service.handleMessage({
    type: 'createRoom',
    playerId: 'host-1',
    data: { nickname: 'Host' }
  })).events.find((event) => event.type === 'roomCreated');

  await service.handleMessage({
    type: 'join_room',
    playerId: 'guest-1',
    data: { roomCode: created.room.code, nickname: 'Guest' }
  });

  const kickResult = await service.handleMessage({
    type: 'kickPlayer',
    playerId: 'host-1',
    roomCode: created.room.code,
    data: { playerId: 'guest-1' }
  });

  const kicked = kickResult.events.find((event) => event.type === 'playerKicked');
  assert.equal(kicked.playerId, 'guest-1');
  assert.equal(kicked.room.players.some((player) => player.id === 'guest-1'), false);

  const guestEvents = service.pollEvents({ playerId: 'guest-1', since: 0 });
  assert.ok(guestEvents.events.some((event) => event.type === 'kicked'));

  const roomsList = (await service.handleMessage({
    type: 'listRooms',
    playerId: 'host-1'
  })).events.find((event) => event.type === 'roomsList');
  assert.equal(roomsList.rooms[0].playerCount, 1);
});

test('polling service rejects ai players on colors occupied by real players', async () => {
  const service = createAeroplaneChessPollingService();
  const created = (await service.handleMessage({
    type: 'createRoom',
    playerId: 'host-1',
    data: { nickname: 'Host' }
  })).events.find((event) => event.type === 'roomCreated');

  const result = await service.handleMessage({
    type: 'add_ai_player',
    playerId: 'host-1',
    roomCode: created.room.code,
    data: { colorIndex: created.room.players[0].color, difficulty: 'easy' }
  });

  assert.equal(result.events[0].type, 'error');
  assert.match(result.events[0].message, /颜色已被玩家占用/);

  const roomsList = (await service.handleMessage({
    type: 'listRooms',
    playerId: 'host-1'
  })).events.find((event) => event.type === 'roomsList');
  assert.equal(roomsList.rooms[0].playerCount, 1);
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

test('polling service starts immediately with one real host and three ai players', async () => {
  const service = createAeroplaneChessPollingService();
  const created = (await service.handleMessage({
    type: 'createRoom',
    playerId: 'host-1',
    data: { nickname: 'Host' }
  })).events.find((event) => event.type === 'roomCreated');

  for (const colorIndex of [2, 3, 4]) {
    const result = await service.handleMessage({
      type: 'add_ai_player',
      playerId: 'host-1',
      roomCode: created.room.code,
      data: { colorIndex, difficulty: 'easy' }
    });
    assert.ok(result.events.some((event) => event.type === 'aiPlayerAdded'));
  }

  const started = (await service.handleMessage({
    type: 'startGame',
    playerId: 'host-1',
    roomCode: created.room.code
  })).events.find((event) => event.type === 'gameStarted');

  assert.ok(started);
  assert.equal(started.players.length, 4);
  assert.equal(started.players.filter((player) => player.isAI).length, 3);
  assert.equal(started.players.filter((player) => !player.isAI).length, 1);
});

test('polling service clears finished rooms from reconnect info after settlement', async () => {
  const service = createAeroplaneChessPollingService();
  const created = (await service.handleMessage({
    type: 'createRoom',
    playerId: 'host-1',
    data: { nickname: 'Host' }
  })).events.find((event) => event.type === 'roomCreated');

  await service.handleMessage({
    type: 'add_ai_player',
    playerId: 'host-1',
    roomCode: created.room.code,
    data: { colorIndex: 2, difficulty: 'easy' }
  });

  const started = (await service.handleMessage({
    type: 'startGame',
    playerId: 'host-1',
    roomCode: created.room.code
  })).events.find((event) => event.type === 'gameStarted');

  assert.ok(started);

  await service.handleMessage({
    type: 'forceSettlement',
    playerId: 'host-1',
    roomCode: created.room.code,
    gameSessionId: started.gameSessionId,
    data: { winnerPlayer: 1, rankings: [] }
  });

  const reconnectInfo = (await service.handleMessage({
    type: 'getReconnectInfo',
    playerId: 'host-1'
  })).events.find((event) => event.type === 'reconnectInfo');

  assert.equal(reconnectInfo.roomCode, null);
  assert.equal(service.rooms.has(created.room.code), false);
});

test('polling service clears reconnect info when game ends by session id only', async () => {
  const service = createAeroplaneChessPollingService();
  const created = (await service.handleMessage({
    type: 'createRoom',
    playerId: 'host-1',
    data: { nickname: 'Host' }
  })).events.find((event) => event.type === 'roomCreated');

  await service.handleMessage({
    type: 'join_room',
    playerId: 'guest-1',
    data: { roomCode: created.room.code, nickname: 'Guest' }
  });

  const started = (await service.handleMessage({
    type: 'startGame',
    playerId: 'host-1',
    roomCode: created.room.code
  })).events.find((event) => event.type === 'gameStarted');

  assert.ok(started);

  await service.handleMessage({
    type: 'forceSettlement',
    playerId: 'host-1',
    gameSessionId: started.gameSessionId,
    data: { rankings: [] }
  });

  const hostReconnectInfo = (await service.handleMessage({
    type: 'getReconnectInfo',
    playerId: 'host-1'
  })).events.find((event) => event.type === 'reconnectInfo');
  const guestReconnectInfo = (await service.handleMessage({
    type: 'getReconnectInfo',
    playerId: 'guest-1'
  })).events.find((event) => event.type === 'reconnectInfo');

  assert.equal(hostReconnectInfo.roomCode, null);
  assert.equal(guestReconnectInfo.roomCode, null);
  assert.equal(service.rooms.has(created.room.code), false);
});

test('polling service clears room ownership when settlement page returns to lobby', async () => {
  const service = createAeroplaneChessPollingService();
  const created = (await service.handleMessage({
    type: 'createRoom',
    playerId: 'host-1',
    data: { nickname: 'Host' }
  })).events.find((event) => event.type === 'roomCreated');

  await service.handleMessage({
    type: 'add_ai_player',
    playerId: 'host-1',
    roomCode: created.room.code,
    data: { colorIndex: 2, difficulty: 'easy' }
  });

  await service.handleMessage({
    type: 'startGame',
    playerId: 'host-1',
    roomCode: created.room.code
  });

  const left = (await service.handleMessage({
    type: 'returnToRoom',
    playerId: 'host-1',
    roomCode: created.room.code
  })).events.find((event) => event.type === 'roomLeft' || event.type === 'roomClosed');

  assert.ok(left);

  const reconnectInfo = (await service.handleMessage({
    type: 'getReconnectInfo',
    playerId: 'host-1'
  })).events.find((event) => event.type === 'reconnectInfo');

  assert.equal(reconnectInfo.roomCode, null);
  assert.equal(service.rooms.has(created.room.code), false);
});

test('polling service replays all audio loaded status to real players that missed the broadcast', async () => {
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

  const started = (await service.handleMessage({
    type: 'startGame',
    playerId: 'host-1',
    roomCode: created.room.code
  })).events.find((event) => event.type === 'gameStarted');

  await service.handleMessage({
    type: 'audioLoaded',
    playerId: 'host-1',
    roomCode: created.room.code,
    gameSessionId: started.gameSessionId
  });
  await service.handleMessage({
    type: 'audioLoaded',
    playerId: 'guest-1',
    roomCode: created.room.code,
    gameSessionId: started.gameSessionId
  });

  service.pollEvents({ playerId: 'guest-1', since: 9999 });
  const replay = service.pollEvents({ playerId: 'guest-1', since: 9999 });

  assert.ok(replay.events.some((event) => event.type === 'allAudioLoaded'));
  assert.equal(replay.events.find((event) => event.type === 'allAudioLoaded').totalPlayers, 2);
});

test('polling service keeps next sequence at latest real event when replaying audio status', async () => {
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

  const started = (await service.handleMessage({
    type: 'startGame',
    playerId: 'host-1',
    roomCode: created.room.code
  })).events.find((event) => event.type === 'gameStarted');

  await service.handleMessage({
    type: 'audioLoaded',
    playerId: 'host-1',
    roomCode: created.room.code,
    gameSessionId: started.gameSessionId
  });
  await service.handleMessage({
    type: 'audioLoaded',
    playerId: 'guest-1',
    roomCode: created.room.code,
    gameSessionId: started.gameSessionId
  });

  const caughtUp = service.pollEvents({ playerId: 'guest-1', since: 0 });

  await service.handleMessage({
    type: 'diceRoll',
    playerId: 'host-1',
    roomCode: created.room.code,
    gameSessionId: started.gameSessionId,
    data: { player: 1, diceValue: 1 }
  });
  await service.handleMessage({
    type: 'noMovableChess',
    playerId: 'host-1',
    roomCode: created.room.code,
    gameSessionId: started.gameSessionId,
    data: { player: 1, diceValue: 1 }
  });

  const replayWithRealEvents = service.pollEvents({ playerId: 'guest-1', since: caughtUp.nextSeq });
  assert.ok(replayWithRealEvents.events.some((event) => event.type === 'diceRoll'));
  assert.ok(replayWithRealEvents.events.some((event) => event.type === 'noMovableChess'));
  assert.ok(replayWithRealEvents.events.some((event) => event.type === 'allAudioLoaded'));
  assert.equal(
    replayWithRealEvents.nextSeq,
    Math.max(...replayWithRealEvents.events.map((event) => Number(event.seq || 0)))
  );

  const afterReplay = service.pollEvents({ playerId: 'guest-1', since: replayWithRealEvents.nextSeq });
  assert.equal(afterReplay.events.some((event) => event.type === 'diceRoll'), false);
  assert.equal(afterReplay.events.some((event) => event.type === 'noMovableChess'), false);
});

test('polling service exposes admin snapshot and room cleanup controls', async () => {
  const service = createAeroplaneChessPollingService();
  const created = (await service.handleMessage({
    type: 'createRoom',
    playerId: 'host-1',
    data: { nickname: 'Host', name: 'League Room', takeoffRule: 'six' }
  })).events.find((event) => event.type === 'roomCreated');

  await service.handleMessage({
    type: 'spectate_room',
    playerId: 'spectator-1',
    data: { roomCode: created.room.code, nickname: 'Watcher' }
  });

  const snapshot = service.getAdminSnapshot();
  assert.equal(snapshot.overview.roomsTotal, 1);
  assert.equal(snapshot.overview.roomsWaiting, 1);
  assert.equal(snapshot.overview.playersReal, 1);
  assert.equal(snapshot.overview.spectators, 1);
  assert.equal(snapshot.rooms[0].code, created.room.code);
  assert.equal(snapshot.rooms[0].name, 'League Room');
  assert.equal(snapshot.rooms[0].settings.takeoffRule, 'six');

  const destroyed = service.destroyRoomForAdmin(created.room.code, 'admin_test');
  assert.equal(destroyed.ok, true);
  assert.equal(service.rooms.size, 0);
  assert.equal(service.getAdminSnapshot().overview.roomsTotal, 0);
});
