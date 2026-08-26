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

- [ ] Replace the obsolete `88px` assertion with an assertion requiring the effective declaration immediately before the mobile media query to be `.calendar-continuous-timeline{--timeline-day-width:134.4px}`; retain the existing mobile `100cqw` assertion.
- [ ] Run `node --test --test-name-pattern="calendar defaults to a horizontally scrollable timeline" tests/calendar-gantt-ui.test.js` and confirm failure.
- [ ] Change the effective desktop override from `112px` to `134.4px` and bump the CSS cache key from `20260827-3` to `20260827-4`.
- [ ] Run the focused test and all calendar UI/domain/route tests.
- [ ] Run `git diff --check` and commit the change.
