# Calendar Mobile CSS Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every `max-width:760px` mobile media query from the public calendar stylesheet while preserving desktop, horizontal-scroll, and embedded-preview behavior.

**Architecture:** This is a CSS-only behavior removal guarded by a source-level regression test. The UI test will assert the absence of calendar mobile media queries, then the four existing media-query blocks will be deleted without changing base selectors or JavaScript.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js built-in test runner.

---

### Task 1: Replace obsolete mobile layout assertions

**Files:**
- Modify: `tests/calendar-gantt-ui.test.js:66-72`
- Modify: `tests/calendar-gantt-ui.test.js:97-104`

- [ ] **Step 1: Write the failing test**

Rename the general style test so it no longer claims to test mobile behavior and remove its `@media` assertion:

```js
test('calendar styles provide warm rounded gantt grids and horizontal scrolling', () => {
  assert.match(css, /--calendar-cream/);
  assert.match(css, /border-radius/);
  assert.match(css, /\.calendar-category-cell[^}]*position:\s*sticky/s);
  assert.match(css, /grid-template-columns:\s*minmax\([^;]+repeat\(7/s);
  assert.match(css, /overflow-x:\s*auto/);
});
```

Replace the obsolete mobile-layout test with:

```js
test('calendar stylesheet has no viewport-specific mobile rules', () => {
  assert.doesNotMatch(css, /@media[^{]*\(\s*max-width\s*:\s*760px\s*\)/);
});
```

- [ ] **Step 2: Run the UI test and verify RED**

Run:

```powershell
node --test --test-name-pattern="calendar stylesheet has no viewport-specific mobile rules" tests/calendar-gantt-ui.test.js
```

Expected: the new test fails because `calendar-gantt.css` still contains `@media (max-width:760px)`.

- [ ] **Step 3: Commit the test-only RED state only if the repository workflow permits red commits**

Do not create a red commit in this repository; continue directly to Task 2 after recording the expected failure.

### Task 2: Delete mobile-only CSS blocks

**Files:**
- Modify: `public/function/calendar-gantt.css:47-51`
- Modify: `public/function/calendar-gantt.css:87-105`
- Modify: `public/function/calendar-gantt.css:117-130`
- Modify: `public/function/calendar-gantt.css:134-141`

- [ ] **Step 1: Remove all four mobile media-query blocks**

Delete every complete block beginning with:

```css
@media (max-width:760px){
```

Keep all rules outside those blocks, including `.calendar-scroll{overflow-x:auto}`, `.calendar-continuous-timeline`, `.calendar-timeline-week-layout`, and `html.is-embedded`.

- [ ] **Step 2: Verify GREEN for the focused UI test**

Run:

```powershell
node --test --test-name-pattern="calendar stylesheet has no viewport-specific mobile rules" tests/calendar-gantt-ui.test.js
```

Expected: the new no-mobile-media-query test passes. Existing unrelated whitespace-sensitive assertions may still fail and must be reported separately rather than hidden.

- [ ] **Step 3: Confirm the stylesheet contains no targeted media query**

Run:

```powershell
Select-String -Path 'public/function/calendar-gantt.css' -Pattern '@media[^\{]*\(\s*max-width\s*:\s*760px\s*\)'
```

Expected: no matches.

### Task 3: Regression verification and handoff

**Files:**
- Verify: `public/function/calendar-gantt.css`
- Verify: `tests/calendar-gantt-ui.test.js`

- [ ] **Step 1: Run calendar regression tests**

Run:

```powershell
node --test tests/calendar-gantt-ui.test.js tests/calendar-domain.test.js tests/calendar-routes.test.js
```

Expected: domain and route tests pass; any pre-existing whitespace-sensitive UI failures are explicitly identified.

- [ ] **Step 2: Inspect the final diff**

Run: `git diff --check` and `git diff -- public/function/calendar-gantt.css tests/calendar-gantt-ui.test.js`

Expected: only the four media-query blocks and obsolete mobile assertions are removed/replaced; no whitespace errors.

- [ ] **Step 3: Commit the implementation**

```powershell
git add -- public/function/calendar-gantt.css tests/calendar-gantt-ui.test.js
git commit -m "refactor: remove calendar mobile styles"
```

- [ ] **Step 4: Report remaining improvements**

List the already identified follow-up items without implementing them: restore the real 56-day timeline renderer, remove DOM-level deduplication, consolidate remaining CSS overrides, strengthen behavior-based tests, improve dialog and view-toggle accessibility, persist view/date state, and review backend expansion cost.
