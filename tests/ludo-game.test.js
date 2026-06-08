const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createLudoManager,
  normalizeTakeoffMode
} = require('../ludo-game');

function user(id, username) {
  return {
    id,
    login_id: `login${id}`,
    username: username || `玩家${id}`
  };
}

function fixedRandom(value) {
  return () => value;
}

function sequence(values) {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    return value;
  };
}

function twoPlayerRoom(options) {
  const manager = createLudoManager({
    now: () => new Date('2026-06-08T00:00:00Z'),
    randomInt: sequence([666666]),
    rollDie: sequence(options && options.dice ? options.dice : [6])
  });
  const room = manager.createRoom(user(1), { takeoffMode: options && options.takeoffMode });
  manager.joinRoom(room.id, user(2), { joinAs: 'player' });
  return { manager, room };
}

function startedRoom(options) {
  const ctx = twoPlayerRoom(options || {});
  ctx.manager.setReady(ctx.room.id, user(1), true);
  ctx.manager.setReady(ctx.room.id, user(2), true);
  ctx.manager.startGame(ctx.room.id, user(1));
  return ctx;
}

test('normalizeTakeoffMode defaults to six-only takeoff', () => {
  assert.equal(normalizeTakeoffMode(), 'six');
  assert.equal(normalizeTakeoffMode('bad'), 'six');
});

test('creates room with default six-only takeoff', () => {
  const manager = createLudoManager({
    now: () => new Date('2026-06-08T00:00:00Z'),
    randomInt: fixedRandom(123456)
  });

  const room = manager.createRoom(user(1, '房主'), { name: '第一局' });

  assert.equal(room.id, '123456');
  assert.equal(room.name, '第一局');
  assert.equal(room.takeoffMode, 'six');
  assert.equal(room.players.length, 1);
  assert.equal(room.players[0].seat, 0);
  assert.equal(room.players[0].color, 'red');
});

test('allows 2/4/6 takeoff mode', () => {
  const manager = createLudoManager({
    now: () => new Date('2026-06-08T00:00:00Z'),
    randomInt: fixedRandom(222222)
  });

  const room = manager.createRoom(user(1), { takeoffMode: 'even' });

  assert.equal(room.takeoffMode, 'even');
});

test('password room rejects wrong password', () => {
  const manager = createLudoManager({
    now: () => new Date('2026-06-08T00:00:00Z'),
    randomInt: fixedRandom(333333)
  });
  const room = manager.createRoom(user(1), { password: 'abc123' });

  assert.throws(
    () => manager.joinRoom(room.id, user(2), { password: 'bad', joinAs: 'player' }),
    /BAD_PASSWORD/
  );
});

test('spectators do not consume player seats', () => {
  const manager = createLudoManager({
    now: () => new Date('2026-06-08T00:00:00Z'),
    randomInt: fixedRandom(444444)
  });
  const room = manager.createRoom(user(1), {});

  manager.joinRoom(room.id, user(2), { joinAs: 'spectator' });
  manager.joinRoom(room.id, user(3), { joinAs: 'spectator' });

  assert.equal(manager.getRoom(room.id).players.length, 1);
  assert.equal(manager.getRoom(room.id).spectators.length, 2);
});

test('player seats are capped at four', () => {
  const manager = createLudoManager({
    now: () => new Date('2026-06-08T00:00:00Z'),
    randomInt: fixedRandom(555555)
  });
  const room = manager.createRoom(user(1), {});
  manager.joinRoom(room.id, user(2), { joinAs: 'player' });
  manager.joinRoom(room.id, user(3), { joinAs: 'player' });
  manager.joinRoom(room.id, user(4), { joinAs: 'player' });

  assert.throws(
    () => manager.joinRoom(room.id, user(5), { joinAs: 'player' }),
    /ROOM_FULL/
  );
});

test('host starts when two players are ready', () => {
  const { manager, room } = twoPlayerRoom();

  manager.setReady(room.id, user(1), true);
  manager.setReady(room.id, user(2), true);
  manager.startGame(room.id, user(1));

  assert.equal(manager.getRoom(room.id).status, 'playing');
  assert.equal(manager.getRoom(room.id).game.turnSeat, 0);
});

test('six-only takeoff rejects a base piece on dice two', () => {
  const { manager, room } = startedRoom({ takeoffMode: 'six', dice: [2] });

  manager.rollDice(room.id, user(1));

  assert.deepEqual(manager.getLegalMoves(room.id, user(1)), []);
});

test('2/4/6 takeoff allows a base piece on dice two', () => {
  const { manager, room } = startedRoom({ takeoffMode: 'even', dice: [2] });

  manager.rollDice(room.id, user(1));

  assert.deepEqual(manager.getLegalMoves(room.id, user(1)), [0, 1, 2, 3]);
});

test('moving a base piece enters the track', () => {
  const { manager, room } = startedRoom({ takeoffMode: 'even', dice: [2] });

  manager.rollDice(room.id, user(1));
  manager.movePiece(room.id, user(1), 0);

  const piece = manager.getRoom(room.id).game.pieces[0][0];
  assert.equal(piece.state, 'track');
  assert.equal(piece.position, 0);
});

test('landing on enemy piece sends it back to base', () => {
  const { manager, room } = startedRoom({ takeoffMode: 'even', dice: [2, 2, 4] });

  manager.rollDice(room.id, user(1));
  manager.movePiece(room.id, user(1), 0);
  manager.rollDice(room.id, user(2));
  manager.movePiece(room.id, user(2), 0);
  manager.rollDice(room.id, user(1));
  manager.movePiece(room.id, user(1), 0);

  const enemyPiece = manager.getRoom(room.id).game.pieces[1][0];
  assert.equal(enemyPiece.state, 'base');
  assert.equal(enemyPiece.position, null);
});

test('rolling six keeps the same turn after a move', () => {
  const { manager, room } = startedRoom({ takeoffMode: 'six', dice: [6] });

  manager.rollDice(room.id, user(1));
  manager.movePiece(room.id, user(1), 0);

  assert.equal(manager.getRoom(room.id).game.turnSeat, 0);
});

test('non-six move advances to the next player', () => {
  const { manager, room } = startedRoom({ takeoffMode: 'even', dice: [2] });

  manager.rollDice(room.id, user(1));
  manager.movePiece(room.id, user(1), 0);

  assert.equal(manager.getRoom(room.id).game.turnSeat, 1);
});

test('finishing all pieces records first rank and history snapshot', () => {
  const { manager, room } = startedRoom({ takeoffMode: 'even', dice: [2] });
  const game = manager.getRoom(room.id).game;
  game.pieces[0] = [
    { state: 'track', position: 51 },
    { state: 'finished', position: null },
    { state: 'finished', position: null },
    { state: 'finished', position: null }
  ];

  manager.rollDice(room.id, user(1));
  manager.movePiece(room.id, user(1), 0);

  const updated = manager.getRoom(room.id);
  assert.equal(updated.players[0].rank, 1);
  assert.equal(updated.game.rankings[0].userId, 1);
  assert.equal(updated.historySnapshot.players[0].rank, 1);
});
