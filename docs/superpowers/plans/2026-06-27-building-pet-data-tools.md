# Building Upgrade And Pet Data Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two data-query tools: `1-30级建筑升级` with upgrade totals and full tables, and `宠物数据查询` with pet material/power/breakthrough data.

**Architecture:** Create two standalone static pages under `public/function/`, each owning its embedded dataset and client-side rendering logic. Add two `dataQuery` cards to `index.html` so they appear under `工具 -> 数据查询`. Static regression tests verify routes/cards/data/calculation hooks without touching existing backend code.

**Tech Stack:** Static HTML, vanilla JavaScript, existing `/function/theme.css`, `/function/theme.js`, `/function/analytics-tracker.js`, Node built-in test runner.

---

### Task 1: Add Regression Tests

**Files:**
- Create: `tests/building-pet-data-tools.test.js`

- [ ] **Step 1: Write failing tests**

Test that `public/function/building-upgrade-1-30.html` and `public/function/pet-data-query.html` exist, include key data samples, include calculation/render functions, and that `index.html` links both pages under `data-category="dataQuery"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/building-pet-data-tools.test.js`
Expected: FAIL because pages/cards do not exist yet.

### Task 2: Add Building Upgrade Tool Page

**Files:**
- Create: `public/function/building-upgrade-1-30.html`

- [ ] **Step 1: Create page shell**

Use existing static-tool conventions: title `1-30级建筑升级-冬日工具箱`, analytics/theme scripts, mobile responsive CSS, back link, clear card-based layout.

- [ ] **Step 2: Embed building datasets**

Include data for 熔炉、使馆、射手营、军医所、矛兵营、指挥部、盾兵营. Preserve original display values and add numeric parsing for resources/power/time totals.

- [ ] **Step 3: Implement interactions**

Add building selector, current level, target level, summary cards, level search, and full table rendering. Sum rows from current+1 through target.

### Task 3: Add Pet Data Query Page

**Files:**
- Create: `public/function/pet-data-query.html`

- [ ] **Step 1: Create page shell**

Use title `宠物数据查询-冬日工具箱`, analytics/theme scripts, mobile responsive CSS, back link, and data-source note.

- [ ] **Step 2: Embed pet datasets**

Include grouped material data, full-level power table, and breakthrough score table. Preserve source author `甜甜` and raw-data note.

- [ ] **Step 3: Implement interactions**

Add pet/group search, level filter, material table, max-power table, and breakthrough score table.

### Task 4: Add Home Cards And Verify

**Files:**
- Modify: `index.html`
- Test: `tests/building-pet-data-tools.test.js`

- [ ] **Step 1: Add two dataQuery cards**

Add cards linking to `function/building-upgrade-1-30.html` and `function/pet-data-query.html`, near existing data-query tools.

- [ ] **Step 2: Run targeted tests**

Run: `node --test tests/building-pet-data-tools.test.js`
Expected: PASS.

- [ ] **Step 3: Run syntax/static smoke checks**

Run: `node --check` on any standalone JS if created; for inline HTML JS, run the static test and inspect key snippets.
