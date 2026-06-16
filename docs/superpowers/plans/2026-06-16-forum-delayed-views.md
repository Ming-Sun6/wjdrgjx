# Forum Delayed Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each forum post detail click count as 1 immediate view plus 9 delayed views that appear after 12-25 minutes.

**Architecture:** Add a focused helper module for delayed view timestamp generation and SQL fragments. Update `server.js` to use helper SQL for visible view counts and to insert one immediate row plus nine delayed rows when `incrementView=1` is present.

**Tech Stack:** Node.js CommonJS, Express, MySQL/PostgreSQL-compatible SQL placeholders, Node built-in test runner.

---

### Task 1: Helper Tests

**Files:**
- Create: `tests/forum-post-views.test.js`
- Create later: `forum-post-views.js`

- [ ] **Step 1: Write the failing test**
Add tests that require `../forum-post-views`, assert `buildForumViewRows(postId, now)` returns 10 rows, first row is immediate, remaining 9 rows are in 3 delayed batches between 1 and 25 minutes, and `FORUM_VISIBLE_VIEW_COUNT_SQL` contains a `created_at <= CURRENT_TIMESTAMP(3)` filter.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test tests/forum-post-views.test.js`
Expected: FAIL because `forum-post-views.js` does not exist yet.

### Task 2: Minimal Helper Implementation

**Files:**
- Create: `forum-post-views.js`

- [ ] **Step 1: Implement helper exports**
Export constants for delayed timing, `buildForumViewRows(postId, now)`, `FORUM_VISIBLE_VIEW_COUNT_SQL`, and `FORUM_VISIBLE_VIEW_COUNT_EXPR`.

- [ ] **Step 2: Run helper test**
Run: `node --test tests/forum-post-views.test.js`
Expected: PASS.

### Task 3: Server Integration

**Files:**
- Modify: `server.js`
- Modify: `tests/forum-post-views.test.js`

- [ ] **Step 1: Add failing integration/source test**
Assert `server.js` imports `forum-post-views`, uses `FORUM_VISIBLE_VIEW_COUNT_EXPR` for view-count subqueries, and inserts rows from `buildForumViewRows`.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test tests/forum-post-views.test.js`
Expected: FAIL because `server.js` still uses raw `COUNT(*)` and single-row insert.

- [ ] **Step 3: Update server**
Import helper exports, replace forum view-count subqueries with the visible-count expression, and replace single insert with a loop over generated rows using row-specific `created_at` values.

- [ ] **Step 4: Run tests**
Run: `node --test tests/forum-post-views.test.js tests/web-issue-fixes.test.js`
Expected: PASS.

