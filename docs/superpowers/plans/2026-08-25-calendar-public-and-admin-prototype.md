# Calendar Public View and Admin Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the public calendar entry and mobile seven-day layouts, add explicit portrait/landscape controls, and deliver an isolated admin UI prototype without touching production admin code.

**Architecture:** Keep the homepage iframe lifecycle in `home-app.js`, public calendar controls/rendering in `calendar.html` and `calendar-gantt.js`, and responsive presentation in `calendar-gantt.css`. The admin prototype is a self-contained `file://` HTML document with inline mock state and no production dependencies.

**Tech Stack:** Static HTML/CSS, browser JavaScript, Node.js built-in test runner.

---

### Task 1: Homepage calendar lifecycle

**Files:**
- Modify: `tests/home-calendar-lazy-load.test.js`
- Modify: `public/function/home-app.js`

- [ ] Add a failing test for “calendar -> all -> calendar” and another non-calendar tab: leaving must remove the iframe and reset both loading flags; re-entering must create a new iframe rather than reuse a removed node.
- [ ] Run `node --test tests/home-calendar-lazy-load.test.js` and confirm the new assertion fails because cleanup is absent.
- [ ] Implement cleanup that clears the host and loading flags whenever `setActiveTab` changes away from `calendar`.
- [ ] Re-run the test and confirm it passes.

### Task 2: Calendar preview, theme-button removal, and orientation controls

**Files:**
- Modify: `tests/calendar-gantt-ui.test.js`
- Modify: `public/function/calendar.html`
- Modify: `public/function/calendar-gantt.js`

- [ ] Add failing assertions for the preview banner, full-calendar button, portrait/landscape buttons, and embedded top-navigation with same-frame fallback. Require `?embed=1` to hide the fixed page header.
- [ ] Add failing behavior tests for `wjdr.calendar.viewMode`: read a valid stored choice first, infer the default from initial viewport orientation, fall back to memory when storage throws, and retain the choice across week/month and date navigation.
- [ ] Add failing behavior tests for orientation sequencing and ownership: apply the landscape class synchronously, request fullscreen only on mobile, call `lock('landscape')` only after confirmed `fullscreenchange`, retain layout and show a rotation hint on either failure, unlock on user fullscreen exit without changing view mode, exit only fullscreen opened by this page, and never call fullscreen/lock on desktop.
- [ ] Add a failing device-rotation test: after a manual portrait or landscape selection, dispatch `orientationchange` / `screen.orientation.change` and assert the current class plus `wjdr.calendar.viewMode` remain unchanged; only the rotate-help message may update.
- [ ] Add a failing DOM test that inserts `#themeToggleBtn.wjdr-theme-fab` after calendar initialization and requires it to be removed without a focusable replacement; keep the existing shared-theme tests as the non-calendar regression.
- [ ] Run `node --test tests/calendar-gantt-ui.test.js` and confirm the new assertions fail for missing UI and behavior.
- [ ] Add the semantic controls and preview banner to `calendar.html`.
- [ ] Implement embedded-mode navigation, a MutationObserver for late theme-node removal, persisted view mode with storage fallback, desktop preview switching, the specified mobile fullscreen/lock ordering, failure notice, ownership tracking, and safe unlock/exit behavior in `calendar-gantt.js`; device orientation events may refresh help text but must never overwrite the manually selected layout or stored preference.
- [ ] Re-run the test and confirm it passes.

### Task 3: Seven columns without horizontal scrolling

**Files:**
- Modify: `tests/calendar-gantt-ui.test.js`
- Modify: `public/function/calendar-gantt.css`

- [ ] Replace the old mobile-scrolling expectation with a failing matrix for week/month x portrait/landscape at 320/360/390 widths: seven fractional columns, vertical scrolling only, no calendar/preview overflow, no oversized calendar `min-width`, two-line truncation, and preview button height >=40px.
- [ ] Run `node --test tests/calendar-gantt-ui.test.js` and confirm failure against the current 860px grid.
- [ ] Implement compact portrait and expanded landscape layouts for both week and month views; keep vertical scrolling only.
- [ ] Re-run the UI test and verify green.

### Task 4: Isolated admin prototype

**Files:**
- Create: `docs/prototypes/calendar-admin-v2.html`
- Create: `tests/calendar-admin-prototype.test.js`

- [ ] Add a failing static contract test requiring the prototype file, “验收原型，未接入生产管理端”, five workflow sections, mock schedule/preset controls, inline HTML/CSS/JS/data, and no `fetch`, `XMLHttpRequest`, `WebSocket`, form `action`, `http(s)` URL, external script/link, real admin API/path, or production admin CSS/JS reference.
- [ ] Run `node --test tests/calendar-admin-prototype.test.js` and confirm it fails because the prototype does not exist.
- [ ] Build the self-contained warm-toned responsive prototype with left workflow navigation on desktop and horizontal step tabs on mobile.
- [ ] Add mock-only interactions for structure, duration preview, recurrence, colors, child tasks, presets, and schedule cards.
- [ ] Re-run the prototype contract test and confirm it passes.

### Task 5: Verification and boundary audit

**Files:**
- Verify only; do not modify production admin files.

- [ ] Run `node --check public/function/calendar-gantt.js` and `node --check public/function/home-app.js`.
- [ ] Run `node --test tests/home-calendar-lazy-load.test.js tests/calendar-gantt-ui.test.js tests/calendar-admin-prototype.test.js`.
- [ ] Run related homepage/calendar regressions and `git diff --check`.
- [ ] Compare changed files with the task baseline. The allowed set is `public/function/home-app.js`, `public/function/calendar.html`, `public/function/calendar-gantt.js`, `public/function/calendar-gantt.css`, their relevant tests, this spec/plan, and `docs/prototypes/calendar-admin-v2.html`; preserve pre-existing user changes and confirm this task adds no production admin HTML/script/route/database change.
- [ ] Confirm regression tests retain the public API contract, schedule data shape, week/month controls, date picker/navigation, detail dialog, and 18-month bounds.
- [ ] Open `docs/prototypes/calendar-admin-v2.html` via `file://` for visual review and hand the exact path to the user.
