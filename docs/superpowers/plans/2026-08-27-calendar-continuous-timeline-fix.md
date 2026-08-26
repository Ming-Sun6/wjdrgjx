# Calendar Continuous Timeline Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the default calendar view to the existing continuous 56-day timeline with horizontal dragging and scrolling.

**Architecture:** Add a source-level regression assertion that the timeline render branch invokes `renderTimeline(range)`, then replace the accidental one-week `renderWeek()` call with the existing continuous renderer. Bump the script cache version so deployed browsers request the corrected JavaScript.

**Tech Stack:** Static HTML/CSS/JavaScript and Node.js built-in test runner.

---

### Task 1: Add the timeline branch regression test

**Files:**
- Modify: `tests/calendar-gantt-ui.test.js:32-44`

- [ ] **Step 1: Add a branch-level assertion**

Inside `calendar defaults to a horizontally scrollable timeline`, add:

```js
assert.match(js, /if\s*\(state\.view\s*===\s*["']timeline["']\)\s*\{[\s\S]*?appendChild\(renderTimeline\(range\)\)/);
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
node --test --test-name-pattern="calendar defaults to a horizontally scrollable timeline" tests/calendar-gantt-ui.test.js
```

Expected: FAIL because the branch currently calls `renderWeek(week)`.

### Task 2: Restore the continuous renderer and cache version

**Files:**
- Modify: `public/function/calendar-gantt.js:765-768`
- Modify: `public/function/calendar.html:68`

- [ ] **Step 1: Restore the timeline renderer**

Replace the timeline branch body with:

```js
if (state.view === "timeline") {
  els.root.appendChild(renderTimeline(range));
  return;
}
```

- [ ] **Step 2: Bump the browser cache key**

Change the script URL from `calendar-gantt.js?v=20260826-5` to `calendar-gantt.js?v=20260827-1`.

- [ ] **Step 3: Verify GREEN**

Run the focused test from Task 1. Expected: PASS.

### Task 3: Verify and commit

**Files:**
- Verify: `public/function/calendar-gantt.js`
- Verify: `public/function/calendar.html`
- Verify: `tests/calendar-gantt-ui.test.js`

- [ ] **Step 1: Run related regression tests**

```powershell
node --test tests/calendar-gantt-ui.test.js tests/calendar-domain.test.js tests/calendar-routes.test.js
```

Expected: 32/32 pass.

- [ ] **Step 2: Check the final diff**

Run `git diff --check` and confirm only the renderer branch, cache key, and regression assertion changed.

- [ ] **Step 3: Commit**

```powershell
git add -- public/function/calendar-gantt.js public/function/calendar.html tests/calendar-gantt-ui.test.js
git commit -m "fix: restore continuous calendar timeline"
```
