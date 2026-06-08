# 飞行棋联机小游戏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a login-only, polling-based multiplayer Ludo game with password rooms, spectators, configurable takeoff rules, AI hosting for offline players, a standalone HTML page, a home-page entry, and match history.

**Architecture:** Keep live rooms and active game state in memory through a focused `ludo-game.js` module. Mount `/api/ludo/*` routes from a new `ludo-routes.js` module and persist only completed match history to PostgreSQL/MySQL. Put the full UI in `public/function/ludo.html`; `index.html` only gets a tool entry card.

**Tech Stack:** Node.js CommonJS, Express 5, `node:test`, existing `queryRows/queryOne/execute/requireAuth` helpers, vanilla HTML/CSS/JS, existing cookie auth.

---

## File Structure

- Create: `ludo-game.js`
  - Pure room manager, game state machine, legal move calculation, AI hosting, DTO mapping, and history snapshot generation.
- Create: `ludo-routes.js`
  - Express route mounting, history DDL, history persistence, auth checks, and request/response mapping.
- Create: `tests/ludo-game.test.js`
  - TDD coverage for room rules, takeoff modes, spectators, AI hosting, movement, collisions, ranks, and history snapshots.
- Create: `tests/ludo-routes.test.js`
  - Structure tests for route mounting and page entry.
- Create: `public/function/ludo.html`
  - Standalone Ludo app: lobby, create/join room, spectator/player seat, board, controls, logs, and history.
- Modify: `server.js`
  - Require and mount `ludo-routes.js` after existing feature route mounts.
- Modify: `postgres-schema.js`
  - Add PostgreSQL history table DDL to the shared schema list.
- Modify: `index.html`
  - Add a single tool card linking to `function/ludo.html`.

## Task 1: Core Room And Seat Rules

**Files:**
- Create: `ludo-game.js`
- Test: `tests/ludo-game.test.js`

- [ ] **Step 1: Write failing tests for room creation, takeoff mode, password, player seats, and spectators**

```javascript
test('creates room with default six-only takeoff', () => {
  const manager = createLudoManager({ now: fixedNow, randomInt: fixedRandom(123456) });
  const room = manager.createRoom(user(1, '房主'), { name: '第一局' });
  assert.equal(room.takeoffMode, 'six');
  assert.equal(room.players.length, 1);
});

test('allows 2/4/6 takeoff mode', () => {
  const manager = createLudoManager({ now: fixedNow, randomInt: fixedRandom(222222) });
  const room = manager.createRoom(user(1), { takeoffMode: 'even' });
  assert.equal(room.takeoffMode, 'even');
});

test('password room rejects wrong password', () => {
  const manager = createLudoManager({ now: fixedNow, randomInt: fixedRandom(333333) });
  const room = manager.createRoom(user(1), { password: 'abc123' });
  assert.throws(() => manager.joinRoom(room.id, user(2), { password: 'bad', joinAs: 'player' }), /BAD_PASSWORD/);
});

test('spectators do not consume player seats', () => {
  const manager = createLudoManager({ now: fixedNow, randomInt: fixedRandom(444444) });
  const room = manager.createRoom(user(1), {});
  manager.joinRoom(room.id, user(2), { joinAs: 'spectator' });
  manager.joinRoom(room.id, user(3), { joinAs: 'spectator' });
  assert.equal(manager.getRoom(room.id).players.length, 1);
  assert.equal(manager.getRoom(room.id).spectators.length, 2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/ludo-game.test.js`

Expected: FAIL because `ludo-game.js` does not exist.

- [ ] **Step 3: Implement minimal room manager**

Implement exports:

```javascript
module.exports = {
  createLudoManager,
  normalizeTakeoffMode,
  LUDO_COLORS
};
```

Initial behavior:

- `createRoom(user, options)`
- `joinRoom(roomId, user, options)`
- `getRoom(roomId)`
- `toPublicRoom(room, viewerUserId)`
- deterministic password hashing with `crypto.createHash('sha256')`
- seats 0-3 with colors `red`, `yellow`, `blue`, `green`

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/ludo-game.test.js`

Expected: PASS for new room/seat tests.

- [ ] **Step 5: Commit**

```bash
git add ludo-game.js tests/ludo-game.test.js
git commit -m "feat: add ludo room manager"
```

## Task 2: Game Start, Dice, Movement, And Ranking

**Files:**
- Modify: `ludo-game.js`
- Modify: `tests/ludo-game.test.js`

- [ ] **Step 1: Write failing tests for ready/start and takeoff behavior**

```javascript
test('host starts when 2 players are ready', () => {
  const manager = seededGame();
  const room = twoPlayerReadyRoom(manager);
  manager.startGame(room.id, user(1));
  assert.equal(manager.getRoom(room.id).status, 'playing');
});

test('six-only takeoff rejects a base piece on dice two', () => {
  const manager = seededGame({ dice: [2] });
  const room = startedRoom(manager, { takeoffMode: 'six' });
  manager.rollDice(room.id, user(1));
  assert.deepEqual(manager.getLegalMoves(room.id, user(1)), []);
});

test('even takeoff allows a base piece on dice two', () => {
  const manager = seededGame({ dice: [2] });
  const room = startedRoom(manager, { takeoffMode: 'even' });
  manager.rollDice(room.id, user(1));
  assert.deepEqual(manager.getLegalMoves(room.id, user(1)), [0, 1, 2, 3]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/ludo-game.test.js`

Expected: FAIL because start/dice/move APIs are missing.

- [ ] **Step 3: Implement start/dice/move state**

Implement:

- `setReady(roomId, user, ready)`
- `startGame(roomId, user)`
- `rollDice(roomId, user)`
- `getLegalMoves(roomId, user)`
- `movePiece(roomId, user, pieceIndex)`

Use a simplified deterministic route length:

- base piece enters track at position `0`
- pieces move from track position `0` through `51`
- exact or greater-than finish moves piece to `finished`
- enemy pieces on same track position return to `base`
- own stacking allowed
- 6 grants another turn unless no action remains; non-6 advances turn

- [ ] **Step 4: Add failing tests for collision, six extra turn, and winner snapshot**

```javascript
test('landing on enemy piece sends it back to base', () => {
  const manager = collisionScenario();
  manager.movePiece('123456', user(1), 0);
  const room = manager.getRoom('123456');
  assert.equal(room.game.pieces[1][0].state, 'base');
});

test('rolling six keeps the same turn after a move', () => {
  const manager = seededGame({ dice: [6] });
  const room = startedRoom(manager);
  manager.rollDice(room.id, user(1));
  manager.movePiece(room.id, user(1), 0);
  assert.equal(manager.getRoom(room.id).game.turnSeat, 0);
});

test('finishing all pieces records first rank and history snapshot', () => {
  const manager = nearFinishScenario();
  manager.rollDice('123456', user(1));
  manager.movePiece('123456', user(1), 3);
  assert.equal(manager.getRoom('123456').players[0].rank, 1);
});
```

- [ ] **Step 5: Implement collision, extra turn, ranking, and history snapshot**

Add:

- `buildHistorySnapshot(room)`
- `finishRoomIfNeeded(room)`
- rank assignment when all 4 pieces finish or player surrenders

- [ ] **Step 6: Run tests**

Run: `node --test tests/ludo-game.test.js`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add ludo-game.js tests/ludo-game.test.js
git commit -m "feat: implement ludo game flow"
```

## Task 3: Offline AI Hosting

**Files:**
- Modify: `ludo-game.js`
- Modify: `tests/ludo-game.test.js`

- [ ] **Step 1: Write failing tests for heartbeat and AI hosting**

```javascript
test('offline player becomes AI managed after timeout', () => {
  const manager = seededGame({ nowMs: 0 });
  const room = startedRoom(manager);
  manager.markHeartbeat(room.id, user(1), 0);
  manager.tick(61000);
  assert.equal(manager.getRoom(room.id).players[0].managedByAi, true);
});

test('AI managed player takes deterministic turn', () => {
  const manager = seededGame({ dice: [2], nowMs: 0 });
  const room = startedRoom(manager, { takeoffMode: 'even' });
  manager.tick(61000);
  manager.runAiTurn(room.id);
  assert.equal(manager.getRoom(room.id).game.pieces[0][0].state, 'track');
});

test('heartbeat restores AI managed player', () => {
  const manager = seededGame({ nowMs: 0 });
  const room = startedRoom(manager);
  manager.tick(61000);
  manager.markHeartbeat(room.id, user(1), 62000);
  assert.equal(manager.getRoom(room.id).players[0].managedByAi, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/ludo-game.test.js`

Expected: FAIL because AI APIs are missing.

- [ ] **Step 3: Implement heartbeat, timeout, and AI strategy**

Add:

- `markHeartbeat(roomId, user, nowMs)`
- `tick(nowMs)`
- `runAiTurn(roomId)`
- AI move choice order: finish, collision, takeoff, farthest track piece

- [ ] **Step 4: Run tests**

Run: `node --test tests/ludo-game.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ludo-game.js tests/ludo-game.test.js
git commit -m "feat: add ludo ai hosting"
```

## Task 4: API Routes And History Persistence

**Files:**
- Create: `ludo-routes.js`
- Create: `tests/ludo-routes.test.js`
- Modify: `server.js`
- Modify: `postgres-schema.js`

- [ ] **Step 1: Write failing route structure tests**

```javascript
test('server mounts ludo routes', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(serverSource, /mountLudoRoutes\(/);
});

test('ludo route module exposes DDL and mount function', () => {
  const ludo = require('../ludo-routes');
  assert.equal(typeof ludo.mountLudoRoutes, 'function');
  assert.match(ludo.LUDO_DDL_MYSQL, /ludo_match_history/);
  assert.match(ludo.LUDO_DDL_PG, /ludo_match_players/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/ludo-routes.test.js`

Expected: FAIL because `ludo-routes.js` does not exist.

- [ ] **Step 3: Implement route module skeleton and DDL**

Export:

```javascript
module.exports = {
  LUDO_DDL_MYSQL,
  LUDO_DDL_PG,
  ensureLudoSchema,
  mountLudoRoutes
};
```

DDL:

- `ludo_match_history`
- `ludo_match_players`
- indexes by `finished_at`, `winner_user_id`, `user_id`, `match_id`

- [ ] **Step 4: Mount routes in server**

Modify `server.js`:

- require `mountLudoRoutes`
- call after `mountShopRoutes`
- pass `app`, `queryRows`, `queryOne`, `execute`, `requireAuth`, `formatSqlDateTime`, `toUserPayload`, `pgDatabase`
- call schema initializer during route mount

Modify `postgres-schema.js`:

- add PostgreSQL history table DDL to `POSTGRES_SCHEMA_SQL`

- [ ] **Step 5: Implement API behavior**

Routes:

- `GET /api/ludo/rooms`
- `POST /api/ludo/rooms`
- `POST /api/ludo/rooms/:id/join`
- `POST /api/ludo/rooms/:id/seat`
- `POST /api/ludo/rooms/:id/ready`
- `POST /api/ludo/rooms/:id/start`
- `GET /api/ludo/rooms/:id`
- `POST /api/ludo/rooms/:id/heartbeat`
- `POST /api/ludo/rooms/:id/roll`
- `POST /api/ludo/rooms/:id/move`
- `POST /api/ludo/rooms/:id/leave`
- `POST /api/ludo/rooms/:id/surrender`
- `GET /api/ludo/history`

On game finish:

- consume `historySnapshot` from manager
- insert into `ludo_match_history`
- insert player rows into `ludo_match_players`
- ensure repeated polling does not duplicate history inserts

- [ ] **Step 6: Run tests**

Run:

```bash
node --test tests/ludo-routes.test.js
node --test tests/ludo-game.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add ludo-routes.js server.js postgres-schema.js tests/ludo-routes.test.js
git commit -m "feat: mount ludo api routes"
```

## Task 5: Standalone Ludo Page

**Files:**
- Create: `public/function/ludo.html`
- Modify: `tests/ludo-routes.test.js`

- [ ] **Step 1: Write failing page structure test**

```javascript
test('standalone ludo page contains core app nodes', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'function', 'ludo.html'), 'utf8');
  assert.match(html, /id="ludoApp"/);
  assert.match(html, /id="ludoRoomList"/);
  assert.match(html, /id="ludoBoard"/);
  assert.match(html, /\/api\/ludo\/rooms/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ludo-routes.test.js`

Expected: FAIL because page does not exist.

- [ ] **Step 3: Create standalone HTML**

Build a self-contained page with:

- auth check using `GET /api/auth/me`
- lobby list
- create room panel
- password join modal/inline prompt
- player/spectator join controls
- room header and player list
- board grid
- dice and action controls
- log panel
- history panel
- polling timers
- heartbeat

Keep CSS local to the file. Use project visual language but make the board readable on desktop and mobile.

- [ ] **Step 4: Wire API calls**

Implement vanilla JS helpers:

- `apiFetch`
- `loadRooms`
- `createRoom`
- `joinRoom`
- `loadRoom`
- `setReady`
- `startGame`
- `rollDice`
- `movePiece`
- `leaveRoom`
- `surrender`
- `loadHistory`
- `startLobbyPolling`
- `startRoomPolling`
- `stopPolling`

- [ ] **Step 5: Run structure test**

Run: `node --test tests/ludo-routes.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/function/ludo.html tests/ludo-routes.test.js
git commit -m "feat: add ludo standalone page"
```

## Task 6: Home Page Entry Only

**Files:**
- Modify: `index.html`
- Modify: `tests/ludo-routes.test.js`

- [ ] **Step 1: Write failing test for entry-only behavior**

```javascript
test('home page links to standalone ludo page without embedding game app', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /function\/ludo\.html/);
  assert.doesNotMatch(html, /id="ludoBoard"/);
  assert.doesNotMatch(html, /\/api\/ludo\/rooms\/:id/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ludo-routes.test.js`

Expected: FAIL because the entry link is missing.

- [ ] **Step 3: Add home card**

Add a `tool-tile-card` in the existing tool warehouse:

- link: `function/ludo.html`
- title: `飞行棋联机对战`
- pill: `ludo.html`
- desc: `开房间、加密码、四人对战、观战席与历史战绩。`
- category: `calcTools`

- [ ] **Step 4: Run test**

Run: `node --test tests/ludo-routes.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/ludo-routes.test.js
git commit -m "feat: add ludo home entry"
```

## Task 7: Full Verification

**Files:**
- All touched files

- [ ] **Step 1: Run all local tests**

Run:

```bash
node --test tests/ludo-game.test.js tests/ludo-routes.test.js
node --test tests/*.test.js
```

Expected: PASS.

- [ ] **Step 2: Start server**

Run: `node server.js`

Expected output includes:

- `Local server started.`
- `Site: http://localhost:3000`

- [ ] **Step 3: Manually verify browser flows**

Open:

- `http://localhost:3000/`
- `http://localhost:3000/function/ludo.html`

Verify:

- home entry opens standalone page
- unauthenticated page prompts login
- logged-in users can create/join rooms
- spectators can join running rooms
- 2/4/6 takeoff works
- leaving a running room starts AI hosting after timeout
- history appears after a match ends

- [ ] **Step 4: Stop server and check status**

Run:

```bash
git status --short
```

Expected: only intended files changed, or clean after final commit.

- [ ] **Step 5: Final commit if verification required fixes**

```bash
git add ludo-game.js ludo-routes.js server.js postgres-schema.js index.html public/function/ludo.html tests/ludo-game.test.js tests/ludo-routes.test.js
git commit -m "feat: add ludo multiplayer game"
```
