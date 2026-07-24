# Gareth Expert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Gareth as a ninth, partial-data expert whose four skills calculate normally while unavailable expert-level values render as `暂无数据`.

**Architecture:** Store the supplied Gareth workbook beside the existing source workbook and extend the generator with a strict reader for its summary/detail sheet layout. Mark generated experts with an explicit capability flag and move partial-data UI decisions into a small browser/global core module that can be executed directly by Node tests.

**Tech Stack:** CommonJS Node.js, `xlsx`, browser JavaScript, `node:test`, static HTML/CSS.

---

### Task 1: Import Gareth Into Generated Data

**Files:**
- Create: `public/参考/加雷斯.xlsx`
- Modify: `tests/expert-calculator.test.js`
- Modify: `scripts/build-expert-calculator-data.js`
- Regenerate: `public/function/expert-calculator-data.js`

- [ ] **Step 1: Copy the supplied workbook into the reproducible source directory**

Copy `D:/保留/wechat缓存/xwechat_files/wxid_fgl450u43myg22_5c7e/msg/file/2026-07/加雷斯.xlsx` to `public/参考/加雷斯.xlsx`, preserving the source file.

```powershell
$source = 'D:\保留\wechat缓存\xwechat_files\wxid_fgl450u43myg22_5c7e\msg\file\2026-07\加雷斯.xlsx'
$destination = 'public\参考\加雷斯.xlsx'
Copy-Item -LiteralPath $source -Destination $destination
if (-not (Test-Path -LiteralPath $destination)) { throw 'Gareth workbook copy failed' }
if ((Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $destination).Hash) { throw 'Gareth workbook hash mismatch' }
```

- [ ] **Step 2: Write failing generated-data tests**

Add assertions that the generated dataset has nine experts and includes:

```js
const gareth = data.experts.find(expert => expert.name === '加雷斯');
assert.ok(gareth);
assert.equal(gareth.hasExpertLevelData, false);
assert.equal(gareth.levels.length, 0);
assert.equal(gareth.relationMilestones.length, 0);
assert.deepEqual(
  JSON.parse(JSON.stringify(gareth.skills.map(skill => [skill.name, skill.type, skill.levels.length]))),
  [
    ['铁森林馈赠', 'skill', 10],
    ['铁棘战阵', 'skill', 20],
    ['不败铁军', 'skill', 20],
    ['威名震慑', 'skill', 20],
    ['重振旗鼓', 'talent', 11]
  ]
);
```

Assert full normal-skill totals of `226663800` XP and `1313500` books, and representative `铁森林馈赠` Lv.2 values of `25800` XP and `300` books. Assert all original experts have `hasExpertLevelData === true`, and `data.sources` contains both workbook paths.

Also assert `铁森林馈赠` Lv.3 has `cumulativeBooks === 900`. Unit-test the optional-header reader with a small in-memory worksheet containing `关系要求` and `技能效果`, proving supplied text is retained rather than replaced.

- [ ] **Step 3: Run the targeted test and verify RED**

Run: `node --test tests/expert-calculator.test.js`

Expected: FAIL because the generated data still contains eight experts and no Gareth capability data.

- [ ] **Step 4: Implement the strict Gareth workbook reader**

In `scripts/build-expert-calculator-data.js`:

- Add `garethWorkbookPath` and fail clearly when either source workbook is absent.
- Add a `requiredSheet(workbook, name)` helper.
- Read summary columns A/B/C/D/F and detail columns A/B/D/F exactly as specified.
- Discover optional detail columns by the exact headers `关系要求` and `技能效果`; preserve their text when present and use empty strings only when those headers are absent.
- Require exactly four normal skills and one talent.
- Validate finite numeric values, unique contiguous levels `1..max`, and exact detail/summary XP and book totals.
- Generate normal skill rows as `{ level, books, xp, requirement, cumulativeBooks, description }`. Derive `cumulativeBooks` as the ascending running sum of per-level books, including level 1 (zero in the supplied workbook).
- Generate the talent from level 1 through the maximum declared in the summary, with zero costs and empty descriptions; validate that the supplied fixture declares 11.
- Add `hasExpertLevelData: true` to existing experts and `false` to Gareth.
- Add both paths to `sources`, retain a joined `source` display string, and append Gareth after the original experts.

Keep `build()` as the single generation entry point; do not hand-edit generated expert JSON.

- [ ] **Step 5: Regenerate and verify GREEN**

Run: `node scripts/build-expert-calculator-data.js`

Run: `node --test tests/expert-calculator.test.js`

Expected: generator exits 0 and all targeted tests pass.

- [ ] **Step 6: Commit the data import**

```powershell
git add -- public/参考/加雷斯.xlsx scripts/build-expert-calculator-data.js public/function/expert-calculator-data.js tests/expert-calculator.test.js
git commit -m "feat: import Gareth expert skill data"
```

### Task 2: Add Testable Partial-Data UI State

**Files:**
- Create: `public/function/expert-calculator-core.js`
- Modify: `tests/expert-calculator.test.js`
- Modify: `public/function/expert-calculator.html`

- [ ] **Step 1: Write failing core behavior tests**

Load `expert-calculator-core.js` through `vm` and test wished-for `levelUiState(expert)`, `calculatorViewState(expert)`, and `initialRanges(expert)` APIs:

```js
assert.deepEqual(
  JSON.parse(JSON.stringify(core.levelUiState({ hasExpertLevelData: false }))),
  { available: false, disabled: true, values: [], placeholder: '暂无数据' }
);
assert.equal(core.levelUiState({ hasExpertLevelData: true }).available, true);
```

Also test `expertTotals(expert, 1, 100)` returns unavailable values for Gareth rather than numeric zero, while a complete expert returns numeric totals. Test `skillCost()` against Gareth's full `铁森林馈赠` range.

Execute selection, switching, and reset transitions before changing the page:

```js
const garethState = core.calculatorViewState(gareth);
assert.equal(garethState.levels.disabled, true);
assert.equal(garethState.levels.placeholder, '暂无数据');
assert.equal(garethState.expertEffect, '暂无数据');
assert.equal(garethState.totalFavor, '暂无数据');
assert.equal(garethState.totalMarks, '暂无数据');

const completeState = core.calculatorViewState(bald);
assert.equal(completeState.levels.disabled, false);
assert.equal(completeState.levels.values.length, 100);
assert.deepEqual(completeState.levels.values.slice(0, 3), [1, 2, 3]);
assert.deepEqual(completeState.levels.values.slice(-2), [99, 100]);

assert.deepEqual(core.initialRanges(gareth), core.initialRanges(gareth));
assert.equal(core.initialRanges(gareth).skills.length, 4);
assert.deepEqual(core.initialRanges(bald).expert, { from: 1, to: 100 });
```

Consecutive partial and complete calls model switch disable/re-enable behavior. Repeated `initialRanges()` calls model reset and must return fresh, deterministic defaults rather than retained selections.

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `node --test tests/expert-calculator.test.js`

Expected: FAIL because `expert-calculator-core.js` does not exist.

- [ ] **Step 3: Implement the minimal core module**

Create a browser/global module exposing:

```js
window.ExpertCalculatorCore = {
  levelUiState,
  calculatorViewState,
  initialRanges,
  expertTotals,
  skillCost
};
```

`levelUiState()` uses only `hasExpertLevelData`; `calculatorViewState()` supplies the level-control model and unavailable labels; `initialRanges()` produces fresh expert/skill defaults for selection and reset; `expertTotals()` returns `{ available: false, favor: null, marks: null }` for partial experts; and `skillCost()` preserves the existing `(from, to]` interval behavior.

- [ ] **Step 4: Refactor the page to consume the core behavior**

Load `expert-calculator-core.js` after the data module. Replace the inline cost helpers with calls to the core. Render from `calculatorViewState()` and `initialRanges()` so tested state transitions drive the DOM. Add one function that rebuilds expert level selectors on expert change:

- Partial expert: one `暂无数据` option in each selector and both disabled.
- Complete expert: options 1-100, enabled, default 1 to 100.

When totals are unavailable, set expert effect, favor, and marks to `暂无数据`. Skill calculation remains active and missing descriptions use `暂无数据`. Reset rebuilds the selected expert's level state and resets its skill cards.

- [ ] **Step 5: Strengthen the HTML contract assertions**

Assert that the HTML loads `expert-calculator-core.js`, uses the explicit `hasExpertLevelData` state through the core, and contains the `暂无数据` fallback. Remove any obsolete assertion that treats `待补充` as the required missing-data value.

- [ ] **Step 6: Run the targeted test and verify GREEN**

Run: `node --test tests/expert-calculator.test.js`

Expected: all expert calculator tests pass.

- [ ] **Step 7: Commit the UI behavior**

```powershell
git add -- public/function/expert-calculator-core.js public/function/expert-calculator.html tests/expert-calculator.test.js
git commit -m "feat: support experts with partial calculator data"
```

### Task 3: Reproducibility and Regression Verification

**Files:**
- Verify: `public/参考/加雷斯.xlsx`
- Verify: `scripts/build-expert-calculator-data.js`
- Verify: `public/function/expert-calculator-data.js`
- Verify: `public/function/expert-calculator-core.js`
- Verify: `public/function/expert-calculator.html`
- Verify: `tests/expert-calculator.test.js`

- [ ] **Step 1: Verify deterministic regeneration**

Run the generator, record the generated file hash, run it again, and assert the hash is unchanged:

```powershell
node scripts/build-expert-calculator-data.js
$before = (Get-FileHash public/function/expert-calculator-data.js -Algorithm SHA256).Hash
node scripts/build-expert-calculator-data.js
$after = (Get-FileHash public/function/expert-calculator-data.js -Algorithm SHA256).Hash
if ($before -ne $after) { throw 'Expert calculator data generation is not deterministic' }
```

- [ ] **Step 2: Run targeted tests**

Run: `node --test tests/expert-calculator.test.js`

Expected: all targeted tests pass with zero failures.

- [ ] **Step 3: Run the full test suite**

Run: `node --test tests/*.test.js`

Expected: all project tests pass with zero failures.

- [ ] **Step 4: Inspect the final diff and worktree**

Run: `git diff --check`

Run: `git status --short`

Expected: no whitespace errors; only intended feature changes plus the pre-existing unrelated `baidu-submit-urls.txt` entry.

- [ ] **Step 5: Commit any verification-only adjustments**

If verification required tracked fixes, stage only files belonging to this feature and commit them separately. Do not stage `baidu-submit-urls.txt`.
