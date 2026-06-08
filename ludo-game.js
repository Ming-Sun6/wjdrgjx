'use strict';

const crypto = require('crypto');

const LUDO_COLORS = ['red', 'yellow', 'blue', 'green'];
const TAKEOFF_MODES = new Set(['six', 'even']);
const PIECES_PER_PLAYER = 4;

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
  const rollDie = typeof opts.rollDie === 'function'
    ? opts.rollDie
    : () => crypto.randomInt(1, 7);

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

  function requirePlayer(room, rawUser) {
    const user = normalizeUser(rawUser);
    const player = room.players.find((item) => Number(item.userId) === user.userId);
    if (!player) throw createLudoError('NOT_PLAYER');
    return player;
  }

  function requireTurnPlayer(room, rawUser) {
    const player = requirePlayer(room, rawUser);
    if (!room.game || room.status !== 'playing') throw createLudoError('GAME_NOT_STARTED');
    if (Number(player.seat) !== Number(room.game.turnSeat)) throw createLudoError('NOT_YOUR_TURN');
    return player;
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

  function setReady(roomId, rawUser, ready) {
    const room = getRoom(roomId);
    if (room.status !== 'waiting') throw createLudoError('GAME_ALREADY_STARTED');
    const player = requirePlayer(room, rawUser);
    player.ready = !!ready;
    room.updatedAt = now().toISOString();
    return room;
  }

  function createInitialPieces(room) {
    const pieces = {};
    room.players.forEach((player) => {
      pieces[player.seat] = Array.from({ length: PIECES_PER_PLAYER }, () => ({
        state: 'base',
        position: null
      }));
    });
    return pieces;
  }

  function orderedPlayers(room) {
    return room.players.slice().sort((a, b) => Number(a.seat) - Number(b.seat));
  }

  function startGame(roomId, rawUser) {
    const room = getRoom(roomId);
    const user = normalizeUser(rawUser);
    if (Number(room.hostUserId) !== user.userId) throw createLudoError('NOT_HOST');
    if (room.status !== 'waiting') throw createLudoError('GAME_ALREADY_STARTED');
    if (room.players.length < 2) throw createLudoError('NOT_ENOUGH_PLAYERS');
    if (room.players.some((player) => !player.ready)) throw createLudoError('NOT_READY');
    const startedAt = now().toISOString();
    room.status = 'playing';
    room.startedAt = startedAt;
    room.updatedAt = startedAt;
    room.game = {
      turnSeat: room.players[0].seat,
      dice: null,
      awaitingMove: false,
      consecutiveSixes: 0,
      round: 1,
      pieces: createInitialPieces(room),
      rankings: []
    };
    return room;
  }

  function advanceTurn(room) {
    const players = orderedPlayers(room).filter((player) => !player.rank);
    if (!players.length) return;
    const currentIndex = players.findIndex((player) => Number(player.seat) === Number(room.game.turnSeat));
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % players.length;
    if (nextIndex === 0) room.game.round += 1;
    room.game.turnSeat = players[nextIndex].seat;
  }

  function canTakeoff(room, dice) {
    const n = Number(dice);
    if (room.takeoffMode === 'even') return n === 2 || n === 4 || n === 6;
    return n === 6;
  }

  function getLegalMoves(roomId, rawUser) {
    const room = getRoom(roomId);
    const player = requireTurnPlayer(room, rawUser);
    const dice = Number(room.game.dice || 0);
    if (!room.game.awaitingMove || dice < 1) return [];
    const pieces = room.game.pieces[player.seat] || [];
    const moves = [];
    pieces.forEach((piece, index) => {
      if (piece.state === 'base') {
        if (canTakeoff(room, dice)) moves.push(index);
        return;
      }
      if (piece.state === 'track') moves.push(index);
    });
    return moves;
  }

  function rollDice(roomId, rawUser) {
    const room = getRoom(roomId);
    requireTurnPlayer(room, rawUser);
    if (room.game.awaitingMove) throw createLudoError('MOVE_REQUIRED');
    const dice = Math.max(1, Math.min(6, Math.floor(Number(rollDie())) || 1));
    room.game.dice = dice;
    room.game.awaitingMove = true;
    room.updatedAt = now().toISOString();
    return { dice, legalMoves: getLegalMoves(roomId, rawUser) };
  }

  function handleCollision(room, movingSeat, movingPiece) {
    if (!movingPiece || movingPiece.state !== 'track') return;
    room.players.forEach((player) => {
      if (Number(player.seat) === Number(movingSeat)) return;
      const pieces = room.game.pieces[player.seat] || [];
      pieces.forEach((piece) => {
        if (piece.state === 'track' && Number(piece.position) === Number(movingPiece.position)) {
          piece.state = 'base';
          piece.position = null;
        }
      });
    });
  }

  function buildHistorySnapshot(room) {
    return {
      roomId: room.id,
      roomName: room.name,
      hostUserId: room.hostUserId,
      takeoffMode: room.takeoffMode,
      winnerUserId: room.game.rankings[0] ? room.game.rankings[0].userId : null,
      playerCount: room.players.length,
      peakSpectatorCount: room.peakSpectatorCount,
      roundCount: room.game.round,
      startedAt: room.startedAt,
      finishedAt: room.finishedAt || now().toISOString(),
      players: room.players.map((player) => ({
        userId: player.userId,
        username: player.username,
        seat: player.seat,
        color: player.color,
        rank: player.rank,
        finished: !!player.rank
      }))
    };
  }

  function updatePlayerRank(room, player) {
    const pieces = room.game.pieces[player.seat] || [];
    const allFinished = pieces.length > 0 && pieces.every((piece) => piece.state === 'finished');
    if (!allFinished || player.rank) return;
    const rank = room.game.rankings.length + 1;
    player.rank = rank;
    room.game.rankings.push({
      userId: player.userId,
      username: player.username,
      seat: player.seat,
      color: player.color,
      rank
    });
    room.historySnapshot = buildHistorySnapshot(room);
  }

  function movePiece(roomId, rawUser, pieceIndex) {
    const room = getRoom(roomId);
    const player = requireTurnPlayer(room, rawUser);
    const legalMoves = getLegalMoves(roomId, rawUser);
    const index = Math.floor(Number(pieceIndex));
    if (!legalMoves.includes(index)) throw createLudoError('INVALID_MOVE');
    const piece = room.game.pieces[player.seat][index];
    const dice = Number(room.game.dice || 0);
    if (piece.state === 'base') {
      piece.state = 'track';
      piece.position = 0;
    } else if (piece.state === 'track') {
      const nextPosition = Number(piece.position || 0) + dice;
      if (nextPosition >= 52) {
        piece.state = 'finished';
        piece.position = null;
      } else {
        piece.position = nextPosition;
      }
    }
    handleCollision(room, player.seat, piece);
    updatePlayerRank(room, player);
    room.game.awaitingMove = false;
    if (dice !== 6 && !player.rank) advanceTurn(room);
    if (player.rank) advanceTurn(room);
    room.game.dice = null;
    room.updatedAt = now().toISOString();
    return room;
  }

  return {
    createRoom,
    getLegalMoves,
    joinRoom,
    getRoom,
    movePiece,
    rollDice,
    setReady,
    startGame
  };
}

module.exports = {
  LUDO_COLORS,
  createLudoManager,
  normalizeTakeoffMode
};
