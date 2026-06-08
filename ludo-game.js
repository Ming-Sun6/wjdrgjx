'use strict';

const crypto = require('crypto');

const LUDO_COLORS = ['red', 'yellow', 'blue', 'green'];
const TAKEOFF_MODES = new Set(['six', 'even']);

function normalizeTakeoffMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return TAKEOFF_MODES.has(mode) ? mode : 'six';
}

function createLudoError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function normalizeUser(user) {
  const id = Number(user && user.id);
  if (!Number.isFinite(id) || id <= 0) throw createLudoError('BAD_USER');
  return {
    userId: id,
    loginId: String(user.login_id || user.loginId || ''),
    username: String(user.username || user.login_id || user.loginId || `user${id}`)
  };
}

function hashPassword(password) {
  const text = String(password || '');
  if (!text) return null;
  return crypto.createHash('sha256').update(text).digest('hex');
}

function verifyRoomPassword(room, password) {
  if (!room.passwordHash) return true;
  return hashPassword(password) === room.passwordHash;
}

function makeRoomId(randomInt, rooms) {
  for (let i = 0; i < 20; i += 1) {
    const raw = Number(randomInt(100000, 1000000));
    const id = String(Math.max(0, Math.floor(raw))).padStart(6, '0').slice(-6);
    if (!rooms.has(id)) return id;
  }
  throw createLudoError('ROOM_ID_UNAVAILABLE');
}

function createLudoManager(options) {
  const opts = options || {};
  const rooms = new Map();
  const now = typeof opts.now === 'function' ? opts.now : () => new Date();
  const randomInt = typeof opts.randomInt === 'function'
    ? opts.randomInt
    : (min, max) => crypto.randomInt(min, max);

  function getRoom(roomId) {
    const room = rooms.get(String(roomId || ''));
    if (!room) throw createLudoError('ROOM_NOT_FOUND');
    return room;
  }

  function findParticipant(room, userId) {
    const uid = Number(userId);
    const player = room.players.find((item) => Number(item.userId) === uid);
    if (player) return { type: 'player', entry: player };
    const spectator = room.spectators.find((item) => Number(item.userId) === uid);
    if (spectator) return { type: 'spectator', entry: spectator };
    return null;
  }

  function removeSpectator(room, userId) {
    const uid = Number(userId);
    room.spectators = room.spectators.filter((item) => Number(item.userId) !== uid);
  }

  function nextSeat(room) {
    for (let seat = 0; seat < LUDO_COLORS.length; seat += 1) {
      if (!room.players.some((player) => Number(player.seat) === seat)) return seat;
    }
    return -1;
  }

  function addPlayer(room, rawUser) {
    if (room.status !== 'waiting') throw createLudoError('GAME_ALREADY_STARTED');
    const user = normalizeUser(rawUser);
    const existing = findParticipant(room, user.userId);
    if (existing && existing.type === 'player') return room;
    const seat = nextSeat(room);
    if (seat < 0) throw createLudoError('ROOM_FULL');
    removeSpectator(room, user.userId);
    room.players.push({
      ...user,
      seat,
      color: LUDO_COLORS[seat],
      ready: false,
      online: true,
      lastSeenAt: now().toISOString(),
      managedByAi: false,
      joinedAt: now().toISOString(),
      rank: null
    });
    room.updatedAt = now().toISOString();
    return room;
  }

  function addSpectator(room, rawUser) {
    const user = normalizeUser(rawUser);
    const existing = findParticipant(room, user.userId);
    if (existing && existing.type === 'spectator') return room;
    if (existing && existing.type === 'player') return room;
    room.spectators.push({
      ...user,
      joinedAt: now().toISOString(),
      lastSeenAt: now().toISOString()
    });
    room.peakSpectatorCount = Math.max(room.peakSpectatorCount, room.spectators.length);
    room.updatedAt = now().toISOString();
    return room;
  }

  function createRoom(rawUser, rawOptions) {
    const options = rawOptions || {};
    const user = normalizeUser(rawUser);
    const createdAt = now().toISOString();
    const id = makeRoomId(randomInt, rooms);
    const room = {
      id,
      name: String(options.name || '').trim().slice(0, 40) || `${user.username}的房间`,
      passwordHash: hashPassword(options.password),
      hasPassword: !!String(options.password || ''),
      hostUserId: user.userId,
      status: 'waiting',
      takeoffMode: normalizeTakeoffMode(options.takeoffMode),
      players: [],
      spectators: [],
      game: null,
      createdAt,
      updatedAt: createdAt,
      startedAt: null,
      finishedAt: null,
      peakSpectatorCount: 0,
      offlineTimeoutMs: 60000,
      log: []
    };
    rooms.set(id, room);
    if (String(options.joinAs || 'player') === 'spectator') addSpectator(room, rawUser);
    else addPlayer(room, rawUser);
    return room;
  }

  function joinRoom(roomId, rawUser, rawOptions) {
    const room = getRoom(roomId);
    const options = rawOptions || {};
    if (!verifyRoomPassword(room, options.password)) throw createLudoError('BAD_PASSWORD');
    if (String(options.joinAs || 'player') === 'spectator') return addSpectator(room, rawUser);
    return addPlayer(room, rawUser);
  }

  return {
    createRoom,
    joinRoom,
    getRoom
  };
}

module.exports = {
  LUDO_COLORS,
  createLudoManager,
  normalizeTakeoffMode
};
