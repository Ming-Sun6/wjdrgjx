# Calendar Timeline Width Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase the desktop continuous timeline day width by exactly 20% without changing the mobile seven-day layout.

**Architecture:** Update the desktop CSS custom property from `112px` to `134.4px`. Keep the touch-device media-query override unchanged, bump the CSS cache key, and protect both values with source-level UI tests.

**Tech Stack:** CSS, static HTML, Node.js built-in test runner.

---

### Task 1: Increase desktop timeline width

**Files:**
- Modify: `tests/calendar-gantt-ui.test.js`
- Modify: `public/function/calendar-gantt.css`
- Modify: `public/function/calendar.html`

- [ ] Add a failing assertion requiring desktop `--timeline-day-width:134.4px` while retaining the mobile `100cqw` formula.
- [ ] Run `node --test --test-name-pattern="calendar defaults to a horizontally scrollable timeline" tests/calendar-gantt-ui.test.js` and confirm failure.
- [ ] Change the desktop property to `134.4px` and bump the CSS cache key.
- [ ] Run the focused test and all calendar UI/domain/route tests.
- [ ] Run `git diff --check` and commit the change.
