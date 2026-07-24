# Gareth Expert Partial-Data Design

## Goal

Add Gareth to the expert calculator using the supplied `加雷斯.xlsx` workbook. Preserve all available skill upgrade costs while presenting unavailable expert-level and effect data as `暂无数据`, never as zero.

## Data Sources

- Keep the existing `public/参考/专家数据表.xlsx` as the source for the original eight experts.
- Copy the supplied workbook into `public/参考/加雷斯.xlsx` so generation is reproducible and does not depend on a WeChat cache path.
- Extend `scripts/build-expert-calculator-data.js` with a dedicated Gareth reader because the workbook is a summary workbook rather than the existing per-expert worksheet layout.
- Add a top-level `sources` array containing both workbook paths. Retain `source` as a display string formed by joining those paths so the existing page contract remains compatible.

## Generated Data Shape

Gareth uses the same expert object contract as existing experts:

- `id`, `name`, and `sheetName` are `加雷斯`.
- `hasExpertLevelData` is `false`; existing experts receive `true`. This flag is the sole UI capability check. An expert marked `true` with empty levels is invalid build output.
- `levels` and `relationMilestones` are empty because the workbook has no expert-level growth data.
- The four normal skills are imported from `技能经验与书明细`, including level, incremental XP, and per-level book cost.
- The talent `重振旗鼓` is imported without XP or book costs.
- Missing requirements and descriptions remain empty and are rendered as unavailable data.

The Gareth reader uses `分技能汇总` to identify exactly four rows whose type is `技能` and exactly one row whose type is `天赋`. For each normal skill, `技能经验与书明细` supplies the skill name (column A), level (B), incremental XP from the previous level (D), and per-level book cost (F). Rows must be numeric, unique, contiguous from level 1 through the maximum declared by the summary, and their totals must equal the summary totals. Zero is valid; blank required numeric cells are rejected. The talent receives levels 1 through its declared maximum with zero costs and empty descriptions because the workbook supplies no talent level effects.

If a future workbook supplies requirements or descriptions, the reader must preserve them. `暂无数据` is only a presentation fallback for genuinely absent fields.

The generated JS remains the only runtime data file. Running the build script must reproduce Gareth rather than relying on a manual edit to generated output.

## Calculator Behavior

When Gareth is selected:

- Expert level controls remain visible for layout consistency but are disabled because no level curve exists.
- Both disabled expert selectors contain a single `暂无数据` option. Switching back to a complete expert rebuilds the normal 1-100 options and re-enables both selectors.
- Expert effect displays `暂无数据`.
- Expert favor and mark totals display `暂无数据`, not `0`.
- Each normal skill retains independent current and target selectors and calculates incremental XP and books with the existing `(current, target]` interval rule.
- Missing skill descriptions display `暂无数据`.
- Talent data is not rendered as a cost card, consistent with the existing calculator.
- Switching back to an original expert re-enables expert level controls and restores normal calculations.
- Reset while Gareth is selected resets only the four skill ranges; expert controls stay unavailable. Selecting any expert initializes that expert's ranges deterministically rather than preserving values from the previous expert.

## Error Handling

The build script fails with a clear error if the Gareth workbook or either required sheet is missing. It rejects a count other than four normal skills and one talent, incomplete or duplicate level sequences, nonnumeric required costs, and summary/detail total mismatches. Optional text fields may remain empty.

## Tests

Tests will verify:

1. The generated dataset contains nine experts and Gareth has four normal skills plus one talent.
2. Representative Gareth level costs and workbook totals match. Because the UI baseline is level 1 and level-1 costs are zero, a level 1 to maximum calculation uses rows 2 through maximum and equals the workbook full total.
3. Gareth has no fabricated expert levels or relation milestones.
4. Page behavior tests execute the partial-data state logic and verify disabled `暂无数据` controls, expert totals/effects, reset behavior, and disable/re-enable behavior across expert switches.
5. Existing expert calculator tests continue to pass, and rebuilding the data is reproducible.
