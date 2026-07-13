# Mobile Multi-Column UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the selected mobile tool, data, and gift layouts around stable two-column and four-column grids while preserving desktop behavior, calculations, data, themes, and accessibility.

**Architecture:** Keep each page's existing DOM and page-local visual language, then add scoped mobile overrides after the generic `mobile-responsive.css` behavior so approved grids cannot be forced back to one column. Shared gift interaction stays in `gift-data-page.js`; T12 markup and CSS are updated in both the Python generator template and generated HTML, then verified through the Node regeneration command.

**Tech Stack:** Static HTML/CSS, vanilla JavaScript, Python template source for T12 generation, Node.js `node:test`, headless Microsoft Edge.

**Design Spec:** `docs/superpowers/specs/2026-07-13-mobile-multi-column-ui-design.md`

---

## File Map

- `tests/mobile-multi-column-tools.test.js`: static contracts for calculator, hero, gift, rotation, and home-title mobile rules.
- `tests/t12-mobile-layout.test.js`: calculator technology-detail four-column contract.
- `tests/t12-overview-mobile-layout.test.js`: overview four-column and `<=339px` fallback contract.
- `index.html`: normalized tool-title wrappers, stable title area, and out-of-flow dynamic badge placement.
- `public/function/Architecture10.html`: two-column building cards, summaries, and preset controls.
- `public/function/equipment-training-calculator.html`: two-column mobile controls and metrics.
- `public/function/lord-equipment-gem-calculator.html`: two-column controls/metrics with full-width material tables.
- `public/function/refine-crystal-calculator.html`: two-column fields and summaries.
- `public/function/refine-crystal-simulator.html`: two-column fields, commands, and summaries.
- `public/function/expert-calculator.html`: two-column controls and skill cards with narrow fallback.
- `public/function/Zero/hero-data.html`: two-column hero generation cards with narrow fallback.
- `public/function/Zero/regular-gift-data.html`: two-column regular gift selector and full-width details.
- `public/function/Zero/special-gift-data.html`: two-column special gift selector and full-width details.
- `public/function/Zero/gift-data-page.js`: accessible multi-expand state, stable detail IDs, and focus restoration.
- `public/function/Zero/gift-rotation-schedule.html`: responsive restyling of the existing semantic table.
- `scripts/generate-t12-pages.py`: source of truth for T12 detail markup and mobile grid CSS.
- `public/function/T12Calculator.html`: generated calculator output.
- `public/function/T12DataOverview.html`: generated overview output.

---

### Task 1: Add Failing Mobile Layout Contracts

**Files:**
- Create: `tests/mobile-multi-column-tools.test.js`
- Modify: `tests/t12-mobile-layout.test.js`
- Modify: `tests/t12-overview-mobile-layout.test.js`

- [ ] **Step 1: Create shared test helpers and calculator contracts**

Add file-reading and media-block helpers, then assert that each calculator contains a `340-768px` two-column rule and a `<=339px` fallback. The contracts must also reject a generic mobile one-column override for the approved page-specific grids.

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('selected calculators expose two-column phone layouts', () => {
  const pages = [
    'public/function/Architecture10.html',
    'public/function/equipment-training-calculator.html',
    'public/function/lord-equipment-gem-calculator.html',
    'public/function/refine-crystal-calculator.html',
    'public/function/refine-crystal-simulator.html',
    'public/function/expert-calculator.html'
  ];
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /@media\s*\(min-width:\s*340px\)\s*and\s*\(max-width:\s*768px\)/);
    assert.match(html, /repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(html, /@media\s*\(max-width:\s*339px\)/);
  }
});
```

- [ ] **Step 2: Add hero, gift, rotation, and home-title contracts**

Assert two-column hero/gift lists, full-width inline gift details, semantic mobile table labels, consistent title wrappers, and out-of-flow badges.

```js
test('hero and gift lists use two columns with full-width details', () => {
  assert.match(read('public/function/Zero/hero-data.html'), /\.grid\s*\{[^}]*repeat\(2,/s);
  for (const page of ['regular-gift-data.html', 'special-gift-data.html']) {
    const html = read(`public/function/Zero/${page}`);
    assert.match(html, /\.gift-list\s*\{[^}]*repeat\(2,/s);
    assert.match(html, /\.gift-inline-detail\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  }
});

test('gift interactions expose expansion semantics and stable details', () => {
  const js = read('public/function/Zero/gift-data-page.js');
  assert.match(js, /aria-expanded/);
  assert.match(js, /aria-controls/);
  assert.match(js, /role="region"/);
  assert.match(js, /\.focus\(\)/);
});

test('home more-tool titles use one wrapper and badges do not shift text', () => {
  const html = read('index.html');
  assert.match(html, /data-tool-id="pet-data-query"[\s\S]*tool-tile-name-inner/);
  assert.match(html, /data-tool-id="wjti-personality-test"[\s\S]*tool-tile-name-inner/);
  assert.match(html, /\.tool-status-badge\s*\{[^}]*position:\s*absolute/s);
});
```

- [ ] **Step 3: Update T12 contracts**

In `tests/t12-mobile-layout.test.js`, require `.tech-detail-grid` to use four columns at `340-768px` and two columns at `<=339px`. In `tests/t12-overview-mobile-layout.test.js`, replace the existing three-column narrow assertion with four columns at `340px+` and two columns at `<=339px`. Assert the Python template contains the same class names and grid rules.

- [ ] **Step 4: Run the focused tests and verify RED**

Run:

```powershell
node --test tests/mobile-multi-column-tools.test.js tests/t12-mobile-layout.test.js tests/t12-overview-mobile-layout.test.js
```

Expected: FAIL because the new two/four-column contracts, accessible gift details, and exact `339/340px` rules are not implemented.

- [ ] **Step 5: Commit the failing tests**

```powershell
git add tests/mobile-multi-column-tools.test.js tests/t12-mobile-layout.test.js tests/t12-overview-mobile-layout.test.js
git commit -m "test: define mobile multi-column layout contracts"
```

---

### Task 2: Normalize Home More-Tool Titles

**Files:**
- Modify: `index.html`
- Test: `tests/mobile-multi-column-tools.test.js`

- [ ] **Step 1: Wrap every managed compact tool title consistently**

Ensure each `.tool-tile-name` uses exactly one `.tool-tile-name-inner`. Preserve intentional `<wbr>` breaks and dynamic badge insertion.

- [ ] **Step 2: Replace the mobile flex title area with a stable grid**

Implement a three-line minimum title area and center the wrapper consistently.

```css
@media (max-width: 768px) {
  .tool-tile-name {
    display: grid;
    place-items: center;
    min-height: 3.84em;
    line-height: 1.28;
  }
  .tool-tile-name-inner {
    display: block;
    width: 100%;
    text-align: center;
  }
}
```

- [ ] **Step 3: Move dynamic badges out of title flow**

Position `.tool-status-badge` against the card's top-right corner and reserve enough card padding so badges never overlap icons or text.

- [ ] **Step 4: Run the home-title focused test**

Run: `node --test tests/mobile-multi-column-tools.test.js`

Expected: home-title assertions PASS; unrelated page assertions may still FAIL.

- [ ] **Step 5: Commit**

```powershell
git add index.html tests/mobile-multi-column-tools.test.js
git commit -m "style: normalize mobile tool titles"
```

---

### Task 3: Convert Calculator Pages to Two-Column Mobile Layouts

**Files:**
- Modify: `public/function/Architecture10.html`
- Modify: `public/function/equipment-training-calculator.html`
- Modify: `public/function/lord-equipment-gem-calculator.html`
- Modify: `public/function/refine-crystal-calculator.html`
- Modify: `public/function/refine-crystal-simulator.html`
- Modify: `public/function/expert-calculator.html`
- Test: `tests/mobile-multi-column-tools.test.js`

- [ ] **Step 1: Add page-scoped `340-768px` overrides after generic responsive behavior**

Use page-specific selectors and `!important` only where necessary to defeat `mobile-responsive.css`'s generic `.grid` one-column rule. Do not modify the global rule because many unrelated pages rely on it.

```css
@media (min-width: 340px) and (max-width: 768px) {
  .calculator-mobile-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
  .calculator-mobile-grid > * { min-width: 0; }
}
@media (max-width: 339px) {
  .calculator-mobile-grid { grid-template-columns: 1fr !important; }
}
```

Apply equivalent existing selectors rather than adding a class when the page already has a clear unique ID such as `#cards`.

- [ ] **Step 2: Preserve full-width content**

Keep notes, warnings, total blocks, logs, and table wrappers at `grid-column: 1 / -1`. Keep Lord Equipment's `.row2` stacked because each child contains a material table, while its internal controls and `.stats` remain two columns.

- [ ] **Step 3: Keep controls touch-safe and compact**

Set inputs, selects, and command buttons to `min-height: 44px`; use two-column button grids for Fire Crystal presets and Refine Simulator commands. Ensure every child uses `min-width: 0` and text wraps without horizontal scrolling.

- [ ] **Step 4: Keep Expert skill cards two columns at normal phone widths**

Override the current `max-width:980px` one-column collapse for `.skill-grid` in the `340-768px` range; keep `.total-grid` full-width and restore one column at `<=339px`.

- [ ] **Step 5: Run focused tests and verify GREEN for calculator contracts**

Run: `node --test tests/mobile-multi-column-tools.test.js tests/expert-calculator.test.js`

Expected: calculator and expert tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add public/function/Architecture10.html public/function/equipment-training-calculator.html public/function/lord-equipment-gem-calculator.html public/function/refine-crystal-calculator.html public/function/refine-crystal-simulator.html public/function/expert-calculator.html tests/mobile-multi-column-tools.test.js
git commit -m "style: compact calculator mobile layouts"
```

---

### Task 4: Rebuild Hero and Gift Lists

**Files:**
- Modify: `public/function/Zero/hero-data.html`
- Modify: `public/function/Zero/regular-gift-data.html`
- Modify: `public/function/Zero/special-gift-data.html`
- Modify: `public/function/Zero/gift-data-page.js`
- Test: `tests/mobile-multi-column-tools.test.js`
- Test: `tests/gift-pack-data.test.js`

- [ ] **Step 1: Add the hero two-column mobile grid**

At `340-768px`, set `#heroGrid` to `repeat(2, minmax(0, 1fr))`, compact card padding/title sizes, and keep `.empty-state` full width. At `<=339px`, restore one column.

- [ ] **Step 2: Add two-column gift selectors**

In both gift pages, set `.gift-list` to two columns at `340-920px`, set each button to `min-width:0`, and make `.gift-inline-detail` span `1 / -1`. At `<=339px`, use one column.

- [ ] **Step 3: Make inline details accessible without changing multi-expand behavior**

Add a stable ID helper based on the gift name/index. Render buttons with `aria-expanded` and `aria-controls`, and render details with matching `id`, `role="region"`, and `aria-label`. After toggling and rerendering, restore focus to the same gift button. Preserve expanded items through filtering when still visible and preserve URL-selected behavior.

```js
const focusName = nextName;
renderList();
const focusButton = listEl.querySelector(`.gift-item[data-name="${cssEscapedName}"]`);
if (focusButton) focusButton.focus();
```

Use a safe lookup or `CSS.escape` fallback; never interpolate an unescaped selector.

- [ ] **Step 4: Keep result counts and empty state announced**

Add `aria-live="polite"` to the existing count and empty-state containers in both pages.

- [ ] **Step 5: Run focused tests**

Run: `node --test tests/mobile-multi-column-tools.test.js tests/gift-pack-data.test.js tests/hero-data.test.js`

Expected: hero and gift tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add public/function/Zero/hero-data.html public/function/Zero/regular-gift-data.html public/function/Zero/special-gift-data.html public/function/Zero/gift-data-page.js tests/mobile-multi-column-tools.test.js
git commit -m "style: rebuild mobile hero and gift lists"
```

---

### Task 5: Redesign the Gift Rotation Table on Mobile

**Files:**
- Modify: `public/function/Zero/gift-rotation-schedule.html`
- Test: `tests/mobile-multi-column-tools.test.js`

- [ ] **Step 1: Add semantic labels to rendered cells**

Update `render(list)` so each `td` carries `data-label="礼包"`, `data-label="周期"`, or `data-label="说明"`. Keep one table DOM and existing search data.

- [ ] **Step 2: Restyle existing rows at `<=768px`**

Hide the visual table header while keeping it accessible, set `tbody` and `tr` to block/grid presentation, and display each cell as a compact labeled row via `td::before { content: attr(data-label); }`. Emphasize the cycle cell with an existing theme accent and keep the note full width.

- [ ] **Step 3: Handle empty results and focus states**

Ensure the no-result row spans the responsive record width, search controls expose `:focus-visible`, and the count/empty message uses `aria-live="polite"`.

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/mobile-multi-column-tools.test.js`

Expected: rotation schedule assertions PASS.

- [ ] **Step 5: Commit**

```powershell
git add public/function/Zero/gift-rotation-schedule.html tests/mobile-multi-column-tools.test.js
git commit -m "style: redesign mobile gift rotation table"
```

---

### Task 6: Rebuild T12 Technology Details from the Generator Source

**Files:**
- Modify: `scripts/generate-t12-pages.py`
- Modify/generated: `public/function/T12Calculator.html`
- Modify/generated: `public/function/T12DataOverview.html`
- Test: `tests/t12-mobile-layout.test.js`
- Test: `tests/t12-overview-mobile-layout.test.js`

- [ ] **Step 1: Merge calculator result metrics in the Python template**

Replace separate `.result-kpis` and `.resource-grid` blocks in the "科技详情" result markup with one eight-item `.tech-detail-grid`: time, refined crystal, micro crystal, steel, meat, wood, coal, and iron.

- [ ] **Step 2: Add calculator four-column CSS and narrow fallback**

```css
@media (min-width: 340px) and (max-width: 768px) {
  .tech-detail-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
  }
}
@media (max-width: 339px) {
  .tech-detail-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
```

Use at least `10px/1.2` labels and `11px/1.2` values with tabular numerals and safe wrapping.

- [ ] **Step 3: Fix overview exact breakpoints in the Python template**

Keep `.mobile-detail-grid` at four columns through `340-768px`; replace `@media (max-width:360px)` three columns with `@media (max-width:339px)` two columns.

- [ ] **Step 4: Apply equivalent CSS/head changes to generated HTML**

Because `scripts/regenerate-t12-html.js` preserves the existing HTML head while replacing body/script from Python, update the HTML CSS and Python template together before regeneration.

- [ ] **Step 5: Regenerate and prove source/output equivalence**

Run:

```powershell
npm run regenerate:t12
node --test tests/t12-mobile-layout.test.js tests/t12-overview-mobile-layout.test.js
```

Expected: generation succeeds; both T12 test files PASS; regenerated HTML retains `.tech-detail-grid` and exact `339/340px` rules.

- [ ] **Step 6: Commit**

```powershell
git add scripts/generate-t12-pages.py public/function/T12Calculator.html public/function/T12DataOverview.html tests/t12-mobile-layout.test.js tests/t12-overview-mobile-layout.test.js
git commit -m "style: compact T12 mobile detail grids"
```

---

### Task 7: Full Regression and Browser Verification

**Files:**
- Modify only if verification exposes a scoped defect.

- [ ] **Step 1: Run syntax and full automated tests**

```powershell
$tests=(Get-ChildItem tests -Filter '*.test.js').FullName
node --test $tests
git diff --check
```

Expected: all tests PASS, zero failures; `git diff --check` exits `0`.

- [ ] **Step 2: Start a static test server**

Use a local static server that serves the workspace without requiring the production database. Do not alter production configuration.

- [ ] **Step 3: Inspect exact responsive boundaries**

Use headless Edge at widths `339`, `340`, `360`, `390`, `430`, `768`, and `769`. For each target page, assert `document.documentElement.scrollWidth <= document.documentElement.clientWidth` and inspect computed `grid-template-columns`.

- [ ] **Step 4: Capture visual checks in both themes**

At minimum capture `390x844` day/night screenshots for:

- Fire Crystal Building
- Training Station
- Lord Equipment/Gem
- Hero Data
- Refine Calculator and Simulator
- Expert Calculator
- T12 Calculator details
- T12 Overview expanded details
- Regular and Special Gifts with multiple expanded items
- Gift Rotation Schedule
- Home More Tools with Pet Data Query and WJTI, including dynamic badge states

- [ ] **Step 5: Verify keyboard and interaction behavior**

Tab through gift search and gift buttons, expand/collapse with keyboard, verify focus returns to the toggled button, verify `aria-expanded`, and test filtering/empty states. Confirm all inputs/buttons are at least `44px` high.

- [ ] **Step 6: Stop the local server and report deployment limitations**

Confirm no helper process remains. Report that production verification still requires the user's manual server upload, service restart, and CDN refresh.

