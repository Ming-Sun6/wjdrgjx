# Calendar Continuous Timeline Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the default 56-day timeline and make mobile calendar layouts show all seven days within one viewport.

**Architecture:** Add source-level regression assertions for the timeline render branch and the mobile seven-column contract. Restore the existing continuous renderer, then add one focused mobile media query that compresses the category/date grids while calculating timeline day width as one seventh of the available viewport. Bump static cache keys for both JavaScript and CSS.

**Tech Stack:** Static HTML/CSS/JavaScript and Node.js built-in test runner.

---

### Starting point

Commit `b0bc7ad` already restores `renderTimeline(range)`, bumps the JavaScript cache key, and passes its focused regression test. The remaining work is the responsive seven-day layout.

### Task 1: Add the mobile seven-day regression test

**Files:**
- Modify: `tests/calendar-gantt-ui.test.js`

- [ ] **Step 1: Replace the obsolete no-mobile-media-query test**

Replace it with a test that requires:

```js
test('mobile calendar fits seven days and keeps the timeline scrollable', () => {
  const mobile =
    css.match(/@media\s*\(max-width:\s*760px\)\s*\{([\s\S]*)\}\s*$/)?.[1] || '';

  assert.ok(mobile);
  assert.match(mobile, /--category-width:\s*64px/);
  assert.match(mobile, /\.calendar-scroll\{[^}]*container-type:\s*inline-size[^}]*overflow-x:\s*hidden/);
  assert.match(mobile, /\.calendar-week-block\{[^}]*width:\s*100%[^}]*min-width:\s*0/);
  assert.match(mobile, /grid-template-columns:\s*var\(--category-width\)\s+repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(mobile, /\.calendar-lane\{[^}]*grid-template-columns:\s*repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(mobile, /--timeline-day-width:\s*calc\(\(100cqw\s*-\s*var\(--category-width\)\)\s*\/\s*7\)/);
  assert.match(mobile, /\.calendar-scroll:has\(\.calendar-continuous-timeline\)\{overflow-x:\s*auto\}/);
});
```

- [ ] **Step 2: Verify RED**

Run the focused test. Expected: FAIL because the stylesheet currently has no mobile media query.

### Task 2: Implement the compact mobile layout

**Files:**
- Modify: `public/function/calendar-gantt.css`
- Modify: `public/function/calendar.html`

- [ ] **Step 1: Add one `max-width:760px` block**

The block must set `--category-width:64px`, compact body/shell/toolbar spacing, make `.calendar-scroll` an inline-size container, set week/month grids to `var(--category-width) repeat(7,minmax(0,1fr))`, shrink text/card padding, remove week-grid horizontal overflow, and set timeline day width to `calc((100cqw - var(--category-width))/7)` while retaining timeline horizontal scrolling.

- [ ] **Step 2: Bump the CSS cache key**

Change `calendar-gantt.css?v=20260826-5` to `calendar-gantt.css?v=20260827-1`.

- [ ] **Step 3: Verify GREEN**

Run the focused mobile test. Expected: PASS.

### Task 3: Verify and commit

**Files:**
- Verify: `public/function/calendar-gantt.js`
- Verify: `public/function/calendar-gantt.css`
- Verify: `public/function/calendar.html`
- Verify: `tests/calendar-gantt-ui.test.js`

- [ ] **Step 1: Run related regression tests**

```powershell
node --test tests/calendar-gantt-ui.test.js tests/calendar-domain.test.js tests/calendar-routes.test.js
```

Expected: all related tests pass.

- [ ] **Step 2: Check responsive geometry**

Check standalone and `?embed=1` at 360px and 760px: category plus seven dates must fit. Check at 761px: desktop sizing must remain unchanged. In timeline mode, confirm horizontal scrolling reaches the remaining 49 days.

- [ ] **Step 3: Check the final diff**

Run `git diff --check` and confirm only the renderer branch, responsive CSS, cache keys, and regression assertions changed.

- [ ] **Step 4: Commit**

```powershell
git add -- public/function/calendar-gantt.js public/function/calendar-gantt.css public/function/calendar.html tests/calendar-gantt-ui.test.js
git commit -m "fix: restore responsive calendar timeline"
```
