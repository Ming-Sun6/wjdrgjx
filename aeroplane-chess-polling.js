const express = require('express');

const ROOM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const HISTORY_LIMIT = 300;

function defaultPlayerName(playerId) {
  const suffix = String(playerId || '').slice(-4) || Math.random().toString(36).slice(2, 6);
  return `玩家_${suffix}`;
}

function makeRoomCode(existingCodes) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    let code = '';
    for (let i = 0; i < 4; i += 1) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
    if (!existingCodes.has(code)) return code;
  }
  throw new Error('ROOM_CODE_EXHAUSTED');
}

function normalizeTakeoffRule(rule) {
  return String(rule || '').toLowerCase() === 'six' ? 'six' : 'even';
}

function publicPlayer(player) {
  return {
    id: player.id,
    nickname: player.nickname,
    emoji: player.emoji,
    color: player.color,
    isHost: !!player.isHost,
    isReady: !!player.isReady,
    isConnected: player.isConnected !== false,
    isAI: !!player.isAI,
    difficulty: player.difficulty
  };
}

function createAeroplaneChessPollingService(options = {}) {
  const rooms = new Map();
  const playerRooms = new Map();
  const playerSpectatingRooms = new Map();
  const spectatorProfiles = new Map();
  const playerEvents = new Map();
  const gameSessions = new Map();
  const recordHistory = typeof options.recordHistory === 'function' ? options.recordHistory : async () => {};
  let sequence = 0;

  function nextSequence() {
    sequence += 1;
    return sequence;
  }

  function eventForPlayer(playerId, event) {
    if (!playerId) return;
    const list = playerEvents.get(playerId) || [];
    list.push({ ...event, seq: nextSequence() });
    while (list.length > HISTORY_LIMIT) list.shift();
    playerEvents.set(playerId, list);
  }

  function toRoomJSON(room) {
    return {
      code: room.code,
      name: room.name,
      host: room.hostId ? publicPlayer(room.players.get(room.hostId) || { id: room.hostId }) : null,
      players: Array.from(room.players.values()).map(publicPlayer),
      spectators: Array.from(room.spectators),
      settings: {
        pieceCount: room.settings.pieceCount,
        takeoffRule: normalizeTakeoffRule(room.settings.takeoffRule),
        skillMode: !!room.settings.skillMode,
        aiPlayers: room.settings.aiPlayers.map(publicPlayer)
      },
      isPrivate: !!room.isPrivate,
      gameState: room.gameState,
      gameSessionId: room.gameSessionId,
      createdAt: room.createdAt
    };
  }

  function listPublicRooms() {
    return Array.from(rooms.values())
      .filter((room) => !room.isPrivate)
      .map((room) => {
        const playerCount = room.players.size + room.settings.aiPlayers.length;
        return {
          code: room.code,
          name: room.name,
          pieceCount: room.settings.pieceCount,
          takeoffRule: normalizeTakeoffRule(room.settings.takeoffRule),
          skillMode: !!room.settings.skillMode,
          playerCount,
          maxPlayers: 4,
          gameState: room.gameState,
          createdAt: room.createdAt
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  function getRoomForMessage(message) {
    const data = message.data || {};
    const roomCode = String(data.roomCode || message.roomCode || '').toUpperCase();
    if (roomCode && rooms.has(roomCode)) return rooms.get(roomCode);
    const sessionId = data.gameSessionId || message.gameSessionId;
    if (sessionId && gameSessions.has(sessionId)) {
      const session = gameSessions.get(sessionId);
      return rooms.get(session.roomCode) || null;
    }
    const ownRoomCode = playerRooms.get(message.playerId) || playerSpectatingRooms.get(message.playerId);
    return ownRoomCode ? rooms.get(ownRoomCode) || null : null;
  }

  function broadcastRoom(room, event, exceptPlayerId = null) {
    const recipients = [
      ...Array.from(room.players.keys()),
      ...Array.from(room.spectators)
    ];
    for (const playerId of recipients) {
      if (playerId !== exceptPlayerId) eventForPlayer(playerId, event);
    }
  }

  function getRealPlayerIdsForSession(session, room) {
    if (session) {
      return session.players.filter((player) => !player.isAI).map((player) => player.id);
    }
    return Array.from(room.players.values()).filter((player) => !player.isAI).map((player) => player.id);
  }

  function buildAllAudioLoadedEvent(session, room) {
    const realPlayerIds = getRealPlayerIdsForSession(session, room);
    return {
      type: 'allAudioLoaded',
      roomCode: room.code,
      gameSessionId: session ? session.gameSessionId : room.gameSessionId,
      audioLoadedPlayers: session ? Array.from(session.audioLoadedPlayers) : realPlayerIds,
      totalPlayers: realPlayerIds.length,
      timestamp: Date.now()
    };
  }

  function findPollingSessionForPlayer(playerId) {
    const roomCode = playerRooms.get(playerId) || playerSpectatingRooms.get(playerId);
    if (!roomCode) return { room: null, session: null };
    const room = rooms.get(roomCode) || null;
    if (!room || !room.gameSessionId) return { room, session: null };
    return { room, session: gameSessions.get(room.gameSessionId) || null };
  }

  function clearRoomMappings(room) {
    for (const id of room.players.keys()) {
      playerRooms.delete(id);
    }
    for (const id of room.spectators) {
      playerSpectatingRooms.delete(id);
      spectatorProfiles.delete(id);
    }
  }

  function isSessionAudioComplete(session, room) {
    if (!session || !session.allAudioLoadedSent) return false;
    const realPlayerIds = getRealPlayerIdsForSession(session, room);
    return realPlayerIds.length > 0 && realPlayerIds.every((id) => session.audioLoadedPlayers.has(id));
  }

  function upsertPlayer(room, playerId, data = {}, isHost = false) {
    const existing = room.players.get(playerId) || {};
    const usedColors = new Set([
      ...Array.from(room.players.values()).filter((p) => p.id !== playerId).map((p) => p.color),
      ...room.settings.aiPlayers.map((p) => p.color)
    ]);
    let color = existing.color;
    if (!color) {
      for (let i = 1; i <= 4; i += 1) {
        if (!usedColors.has(i)) {
          color = i;
          break;
        }
      }
    }
    const player = {
      id: playerId,
      nickname: String(data.nickname || existing.nickname || defaultPlayerName(playerId)).trim(),
      emoji: data.emoji || existing.emoji || 'smile',
      color,
      isHost: isHost || !!existing.isHost,
      isReady: isHost ? true : !!existing.isReady,
      isConnected: true
    };
    room.players.set(playerId, player);
    playerRooms.set(playerId, room.code);
    return player;
  }

  function normalizeChatMessage(room, playerId, message, data) {
    const player = room.players.get(playerId) || null;
    const isSpectator = room.spectators.has(playerId) && !player;
    const spectator = spectatorProfiles.get(playerId) || {};
    const baseName = player
      ? player.nickname
      : String(data.playerName || data.senderName || spectator.nickname || defaultPlayerName(playerId)).trim();
    return {
      ...message,
      ...data,
      type: 'chatMessage',
      playerId,
      roomCode: room.code,
      message: String(data.message || message.message || '').trim(),
      playerName: baseName,
      playerNumber: player ? player.color : null,
      isSpectator,
      timestamp: message.timestamp || data.timestamp || Date.now()
    };
  }

  async function handleMessage(rawMessage) {
    const message = rawMessage || {};
    const type = message.type;
    const playerId = message.playerId || message.data?.playerId;
    const data = message.data || {};
    const events = [];

    const send = (event) => events.push(event);
    const error = (text) => send({ type: 'error', message: text || '操作失败' });

    if (!playerId && type !== 'listRooms') {
      error('缺少玩家ID');
      return { events };
    }

    if (type === 'ping') {
      send({ type: 'pong', timestamp: Date.now() });
      return { events };
    }

    if (type === 'identify' || type === 'getReconnectInfo') {
      const roomCode = playerRooms.get(playerId) || playerSpectatingRooms.get(playerId) || null;
      send({ type: type === 'identify' ? 'connected' : 'reconnectInfo', roomCode });
      return { events };
    }

    if (type === 'listRooms') {
      send({ type: 'roomsList', rooms: listPublicRooms() });
      return { events };
    }

    if (type === 'createRoom') {
      const code = makeRoomCode(rooms);
      const room = {
        code,
        name: String(data.name || data.roomName || '').trim(),
        hostId: playerId,
        players: new Map(),
        spectators: new Set(),
        settings: {
          pieceCount: Number(data.pieceCount || 4),
          takeoffRule: normalizeTakeoffRule(data.takeoffRule),
          skillMode: !!data.skillMode,
          aiPlayers: []
        },
        isPrivate: !!data.isPrivate,
        gameState: 'waiting',
        gameSessionId: null,
        createdAt: Date.now()
      };
      const host = upsertPlayer(room, playerId, data, true);
      if (!room.name) room.name = `${host.nickname}的房间`;
      rooms.set(code, room);
      send({ type: 'roomCreated', room: toRoomJSON(room) });
      return { events };
    }

    const room = getRoomForMessage(message);
    if (!room) {
      error('房间不存在或已被销毁');
      return { events };
    }

    if (type === 'join_room' || type === 'rejoinRoom' || type === 'rejoinGameSession') {
      if (!room.players.has(playerId) && room.gameState === 'playing') {
        error('游戏正在进行中，无法加入新玩家');
        return { events };
      }
      if (!room.players.has(playerId) && room.players.size + room.settings.aiPlayers.length >= 4) {
        error('房间已满');
        return { events };
      }
      const player = upsertPlayer(room, playerId, data, false);
      const roomPayload = toRoomJSON(room);
      send({ type: type === 'rejoinRoom' ? 'roomRejoined' : 'roomJoined', room: roomPayload });
      broadcastRoom(room, {
        type: 'playerJoined',
        player: publicPlayer(player),
        room: roomPayload
      }, playerId);
      return { events };
    }

    if (type === 'spectate_room') {
      room.spectators.add(playerId);
      playerSpectatingRooms.set(playerId, room.code);
      spectatorProfiles.set(playerId, {
        nickname: String(data.nickname || message.nickname || defaultPlayerName(playerId)).trim()
      });
      const session = room.gameSessionId ? gameSessions.get(room.gameSessionId) : null;
      send({
        type: 'spectateJoined',
        room: toRoomJSON(room),
        gameSessionId: room.gameSessionId,
        gameSession: session || null,
        gameData: session ? session.gameData : null
      });
      return { events };
    }

    if (type === 'kickPlayer' || type === 'kick_player') {
      if (room.hostId !== playerId) {
        error('只有房主可以踢出玩家');
        return { events };
      }
      const targetPlayerId = data.playerId || data.targetPlayerId || message.targetPlayerId;
      if (!targetPlayerId || targetPlayerId === playerId || targetPlayerId === room.hostId) {
        error('无法踢出该玩家');
        return { events };
      }
      const targetPlayer = room.players.get(targetPlayerId);
      if (!targetPlayer) {
        error('玩家不在房间中');
        return { events };
      }

      room.players.delete(targetPlayerId);
      playerRooms.delete(targetPlayerId);
      const roomPayload = toRoomJSON(room);
      eventForPlayer(targetPlayerId, {
        type: 'kicked',
        roomCode: room.code,
        playerId: targetPlayerId,
        reason: 'host_kicked',
        timestamp: Date.now()
      });
      const event = {
        type: 'playerKicked',
        playerId: targetPlayerId,
        player: publicPlayer(targetPlayer),
        room: roomPayload,
        timestamp: Date.now()
      };
      broadcastRoom(room, event);
      send(event);
      return { events };
    }

    if (type === 'leave_room' || type === 'leaveRoom') {
      const wasPlayer = room.players.delete(playerId);
      room.spectators.delete(playerId);
      playerRooms.delete(playerId);
      playerSpectatingRooms.delete(playerId);
      spectatorProfiles.delete(playerId);
      send({ type: 'roomLeft', roomCode: room.code });
      if (wasPlayer) {
        if (room.hostId === playerId) {
          const nextHost = Array.from(room.players.values())[0] || null;
          room.hostId = nextHost ? nextHost.id : null;
          if (nextHost) nextHost.isHost = true;
        }
        broadcastRoom(room, { type: 'playerLeft', playerId, room: toRoomJSON(room) });
      }
      if (room.players.size === 0 && room.gameState !== 'playing') rooms.delete(room.code);
      return { events };
    }

    if (type === 'select_color') {
      const player = room.players.get(playerId);
      const color = Number(data.colorIndex || message.colorIndex);
      const used = new Set([
        ...Array.from(room.players.values()).filter((p) => p.id !== playerId).map((p) => p.color),
        ...room.settings.aiPlayers.map((p) => p.color)
      ]);
      if (player && color >= 1 && color <= 4 && !used.has(color)) player.color = color;
      broadcastRoom(room, { type: 'playerUpdated', player: publicPlayer(player), room: toRoomJSON(room) });
      send({ type: 'playerUpdated', player: publicPlayer(player), room: toRoomJSON(room) });
      return { events };
    }

    if (type === 'update_nickname' || type === 'nicknameChange') {
      const player = room.players.get(playerId);
      if (player) player.nickname = String(data.nickname || message.nickname || player.nickname).trim() || player.nickname;
      const event = { type: 'playerUpdated', player: publicPlayer(player), room: toRoomJSON(room) };
      broadcastRoom(room, event);
      send(event);
      return { events };
    }

    if (type === 'update_emoji') {
      const player = room.players.get(playerId);
      if (player) player.emoji = data.emoji || message.emoji || player.emoji;
      const event = { type: 'playerUpdated', player: publicPlayer(player), room: toRoomJSON(room) };
      broadcastRoom(room, event);
      send(event);
      return { events };
    }

    if (type === 'update_room_name') {
      room.name = String(data.name || message.name || '').trim();
      const event = { type: 'roomNameUpdated', name: room.name, room: toRoomJSON(room) };
      broadcastRoom(room, event);
      send(event);
      return { events };
    }

    if (type === 'update_room_privacy') {
      room.isPrivate = !!(data.isPrivate ?? message.isPrivate);
      const event = { type: 'roomPrivacyUpdated', isPrivate: room.isPrivate, room: toRoomJSON(room) };
      broadcastRoom(room, event);
      send(event);
      return { events };
    }

    if (type === 'updateSettings') {
      Object.assign(room.settings, data.settings || data);
      room.settings.takeoffRule = normalizeTakeoffRule(room.settings.takeoffRule);
      const event = { type: 'settingsUpdated', settings: room.settings, room: toRoomJSON(room) };
      broadcastRoom(room, event);
      send(event);
      return { events };
    }

    if (type === 'configure_piece_count') {
      room.settings.pieceCount = Number(data.pieceCount || message.pieceCount || room.settings.pieceCount || 4);
      const event = { type: 'pieceCountConfigured', pieceCount: room.settings.pieceCount, room: toRoomJSON(room) };
      broadcastRoom(room, event);
      send(event);
      return { events };
    }

    if (type === 'add_ai_player') {
      const color = Number(data.colorIndex || message.colorIndex);
      if (color >= 1 && color <= 4 && !room.settings.aiPlayers.some((ai) => ai.color === color)) {
        room.settings.aiPlayers.push({
          id: `ai_${color}`,
          nickname: `AI玩家${color}`,
          emoji: 'bot',
          color,
          isAI: true,
          isReady: true,
          difficulty: data.difficulty || message.difficulty || 'easy'
        });
      }
      const event = { type: 'aiPlayerAdded', room: toRoomJSON(room), aiPlayer: room.settings.aiPlayers.find((ai) => ai.color === color) };
      broadcastRoom(room, event);
      send(event);
      return { events };
    }

    if (type === 'remove_ai_player') {
      const color = Number(data.colorIndex || message.colorIndex);
      room.settings.aiPlayers = room.settings.aiPlayers.filter((ai) => ai.color !== color);
      const event = { type: 'aiPlayerRemoved', room: toRoomJSON(room), colorIndex: color };
      broadcastRoom(room, event);
      send(event);
      return { events };
    }

    if (type === 'update_ai_difficulty') {
      const color = Number(data.colorIndex || message.colorIndex);
      const ai = room.settings.aiPlayers.find((item) => item.color === color);
      if (ai) ai.difficulty = data.difficulty || message.difficulty || ai.difficulty;
      const event = { type: 'aiDifficultyUpdated', room: toRoomJSON(room), colorIndex: color, difficulty: ai ? ai.difficulty : undefined };
      broadcastRoom(room, event);
      send(event);
      return { events };
    }

    if (type === 'toggle_ready') {
      const player = room.players.get(playerId);
      if (player && !player.isHost) player.isReady = !!(data.isReady ?? message.isReady);
      const event = { type: 'playerReadyStatusChanged', playerId, isReady: player ? player.isReady : false, room: toRoomJSON(room) };
      broadcastRoom(room, event);
      send(event);
      return { events };
    }

    if (type === 'startGame' || type === 'start_game') {
      if (room.hostId !== playerId) {
        error('只有房主可以开始游戏');
        return { events };
      }
      const totalPlayers = room.players.size + room.settings.aiPlayers.length;
      if (totalPlayers < 2) {
        error('至少需要2个玩家才能开始游戏');
        return { events };
      }
      room.gameState = 'playing';
      room.gameSessionId = `game_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const players = [
        ...Array.from(room.players.values()).map(publicPlayer),
        ...room.settings.aiPlayers.map(publicPlayer)
      ].sort((a, b) => a.color - b.color);
      const gameData = {
        gameSessionId: room.gameSessionId,
        roomCode: room.code,
        players,
        pieceCount: room.settings.pieceCount,
        takeoffRule: normalizeTakeoffRule(room.settings.takeoffRule),
        skillMode: !!room.settings.skillMode,
        gameStartTime: Date.now(),
        progressHistory: [],
        currentRound: 1
      };
      gameSessions.set(room.gameSessionId, {
        gameSessionId: room.gameSessionId,
        roomCode: room.code,
        players,
        spectators: Array.from(room.spectators),
        gameData,
        audioLoadedPlayers: new Set(),
        allAudioLoadedSent: false,
        createdAt: Date.now()
      });
      const event = {
        type: 'gameStarted',
        room: toRoomJSON(room),
        gameSessionId: room.gameSessionId,
        gameData,
        players,
        pieceCount: room.settings.pieceCount,
        takeoffRule: normalizeTakeoffRule(room.settings.takeoffRule),
        skillMode: !!room.settings.skillMode
      };
      broadcastRoom(room, event);
      send(event);
      return { events };
    }

    if (type === 'audioLoaded') {
      const sessionId = message.gameSessionId || data.gameSessionId || room.gameSessionId;
      const session = sessionId ? gameSessions.get(sessionId) : null;
      const realPlayerIds = getRealPlayerIdsForSession(session, room);
      if (session && realPlayerIds.includes(playerId)) {
        session.audioLoadedPlayers.add(playerId);
      }

      const loadedIds = session ? Array.from(session.audioLoadedPlayers) : [playerId];
      const loadedEvent = {
        ...message,
        ...data,
        type: 'audioLoaded',
        playerId,
        roomCode: room.code,
        gameSessionId: sessionId,
        audioLoadedPlayers: loadedIds,
        totalPlayers: realPlayerIds.length,
        timestamp: message.timestamp || data.timestamp || Date.now()
      };
      broadcastRoom(room, loadedEvent, playerId);
      send(loadedEvent);

      if (session && !session.allAudioLoadedSent && realPlayerIds.length > 0 && realPlayerIds.every((id) => session.audioLoadedPlayers.has(id))) {
        session.allAudioLoadedSent = true;
        const allLoadedEvent = buildAllAudioLoadedEvent(session, room);
        broadcastRoom(room, allLoadedEvent);
        send(allLoadedEvent);
      }
      return { events };
    }

    if (type === 'gameEnd' || type === 'forceSettlement') {
      const sessionId = message.gameSessionId || data.gameSessionId || room.gameSessionId;
      const session = sessionId ? gameSessions.get(sessionId) : null;
      const event = {
        ...message,
        ...data,
        type,
        playerId,
        gameSessionId: sessionId,
        timestamp: message.timestamp || data.timestamp || Date.now()
      };
      broadcastRoom(room, event);
      send(event);
      room.gameState = 'finished';
      if (room.gameSessionId) gameSessions.delete(room.gameSessionId);
      room.gameSessionId = null;
      await recordHistory({
        roomCode: room.code,
        gameSessionId: sessionId,
        winnerPlayer: message.winnerPlayer ?? data.winnerPlayer,
        rankings: message.rankings ?? data.rankings,
        players: session ? session.players : toRoomJSON(room).players,
        endedAt: event.timestamp
      });
      clearRoomMappings(room);
      rooms.delete(room.code);
      return { events };
    }

    if (type === 'chatMessage') {
      const event = normalizeChatMessage(room, playerId, message, data);
      if (!event.message) return { events };
      broadcastRoom(room, event, playerId);
      send(event);
      return { events };
    }

    const event = {
      ...message,
      ...data,
      type,
      playerId,
      roomCode: room.code,
      timestamp: message.timestamp || data.timestamp || Date.now()
    };
    broadcastRoom(room, event, playerId);
    send(event);
    return { events };
  }

  function pollEvents({ playerId, since }) {
    const minSeq = Number(since || 0);
    const list = playerEvents.get(playerId) || [];
    const events = list.filter((event) => Number(event.seq || 0) > minSeq);
    const { room, session } = findPollingSessionForPlayer(playerId);
    if (
      room &&
      session &&
      isSessionAudioComplete(session, room) &&
      !events.some((event) => event.type === 'allAudioLoaded')
    ) {
      events.push(buildAllAudioLoadedEvent(session, room));
    }
    const nextSeq = events.reduce((maxSeq, event) => {
      const eventSeq = Number(event.seq || 0);
      return Number.isFinite(eventSeq) && eventSeq > maxSeq ? eventSeq : maxSeq;
    }, minSeq);
    return {
      events,
      nextSeq
    };
  }

  return {
    handleMessage,
    pollEvents,
    rooms,
    gameSessions,
    listPublicRooms
  };
}

function mountAeroplaneChessPollingRoutes(app, options = {}) {
  const service = options.service || createAeroplaneChessPollingService(options);
  const router = express.Router();

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      transport: 'polling',
      rooms: service.rooms.size,
      gameSessions: service.gameSessions.size
    });
  });

  router.post('/message', async (req, res) => {
    try {
      const result = await service.handleMessage(req.body || {});
      res.json({ ok: true, events: result.events || [] });
    } catch (err) {
      res.status(500).json({ ok: false, error: err && err.message ? err.message : 'INTERNAL_ERROR' });
    }
  });

  router.get('/events', (req, res) => {
    const playerId = String(req.query.playerId || '');
    if (!playerId) {
      res.status(400).json({ ok: false, error: 'PLAYER_ID_REQUIRED' });
      return;
    }
    const result = service.pollEvents({ playerId, since: req.query.since });
    res.json({ ok: true, ...result });
  });

  app.use('/api/aeroplane-chess', router);
  return service;
}

module.exports = {
  createAeroplaneChessPollingService,
  mountAeroplaneChessPollingRoutes
};
