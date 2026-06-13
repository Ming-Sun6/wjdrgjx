# Expert Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new Whiteout Survival expert calculator from `public/参考/专家数据表.xlsx` with incomplete skill data reserved for later editing.

**Architecture:** Add a static single-page tool under `public/function/` and a companion JS data module generated from the workbook. Keep calculation logic client-side: expert selection, current/target level inputs, favor/stat/mark/relation summaries, and a reserved skill area.

**Tech Stack:** Static HTML/CSS/JavaScript, Node built-in `node:test`, existing `xlsx` package for data extraction.

---

### Task 1: Data Shape Test

**Files:**
- Create: `tests/expert-calculator.test.js`
- Create later: `public/function/expert-calculator-data.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadExpertData() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'function', 'expert-calculator-data.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  return sandbox.window.ExpertCalculatorData;
}

test('expert calculator data includes expert level rows and reserved skills', () => {
  const data = loadExpertData();
  assert.equal(data.experts.length, 8);
  const bald = data.experts.find(expert => expert.name === '巴尔德');
  assert.equal(bald.levels.length, 100);
  assert.equal(bald.levels[0].favor, 1000);
  assert.equal(bald.levels[99].level, 100);
  assert.ok(Array.isArray(bald.skills));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/expert-calculator.test.js`
Expected: FAIL because `expert-calculator-data.js` is missing.

### Task 2: Data Module

**Files:**
- Create: `scripts/build-expert-calculator-data.js`
- Create: `public/function/expert-calculator-data.js`

- [ ] **Step 1: Implement a small workbook extraction script**
- [ ] **Step 2: Generate a browser global `window.ExpertCalculatorData`**
- [ ] **Step 3: Run the data test and verify it passes**

Run: `node scripts/build-expert-calculator-data.js && node --test tests/expert-calculator.test.js`
Expected: PASS.

### Task 3: Calculator Page Test

**Files:**
- Modify: `tests/expert-calculator.test.js`
- Create later: `public/function/expert-calculator.html`
- Modify later: `index.html`

- [ ] **Step 1: Add failing page tests**
- [ ] **Step 2: Run tests to verify they fail because the page/link do not exist**
- [ ] **Step 3: Create calculator page with inputs, summaries, tables, and skill placeholder**
- [ ] **Step 4: Add homepage entry**
- [ ] **Step 5: Run tests to verify they pass**

### Task 4: Final Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run targeted tests**

Run: `node --test tests/expert-calculator.test.js`
Expected: PASS.

- [ ] **Step 2: Run data build idempotency check**

Run: `node scripts/build-expert-calculator-data.js`
Expected: generated data file remains valid.
