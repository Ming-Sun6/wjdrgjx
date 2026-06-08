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
