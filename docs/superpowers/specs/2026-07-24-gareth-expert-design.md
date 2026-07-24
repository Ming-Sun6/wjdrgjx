# Gareth Expert Partial-Data Design

## Goal

Add Gareth to the expert calculator using the supplied `加雷斯.xlsx` workbook. Preserve all available skill upgrade costs while presenting unavailable expert-level and effect data as `暂无数据`, never as zero.

## Data Sources

- Keep the existing `public/参考/专家数据表.xlsx` as the source for the original eight experts.
- Copy the supplied workbook into `public/参考/加雷斯.xlsx` so generation is reproducible and does not depend on a WeChat cache path.
- Extend `scripts/build-expert-calculator-data.js` with a dedicated Gareth reader because the workbook is a summary workbook rather than the existing per-expert worksheet layout.

## Generated Data Shape

Gareth uses the same expert object contract as existing experts:

- `id`, `name`, and `sheetName` are `加雷斯`.
- `levels` and `relationMilestones` are empty because the workbook has no expert-level growth data.
- The four normal skills are imported from `技能经验与书明细`, including level, incremental XP, and per-level book cost.
- The talent `重振旗鼓` is imported without XP or book costs.
- Missing requirements and descriptions remain empty and are rendered as unavailable data.

The generated JS remains the only runtime data file. Running the build script must reproduce Gareth rather than relying on a manual edit to generated output.

## Calculator Behavior

When Gareth is selected:

- Expert level controls remain visible for layout consistency but are disabled because no level curve exists.
- Expert effect displays `暂无数据`.
- Expert favor and mark totals display `暂无数据`, not `0`.
- Each normal skill retains independent current and target selectors and calculates incremental XP and books with the existing `(current, target]` interval rule.
- Missing skill descriptions display `暂无数据`.
- Talent data is not rendered as a cost card, consistent with the existing calculator.
- Switching back to an original expert re-enables expert level controls and restores normal calculations.

## Error Handling

The build script fails with a clear error if the Gareth workbook or required skill-detail sheet is missing. It rejects an empty skill import rather than silently generating an unusable expert. Optional text fields may remain empty.

## Tests

Tests will verify:

1. The generated dataset contains nine experts and Gareth has four normal skills plus one talent.
2. Representative Gareth level costs and full skill totals match the workbook.
3. Gareth has no fabricated expert levels or relation milestones.
4. The page contains explicit partial-data handling that disables expert controls and renders `暂无数据` for unavailable expert totals/effects.
5. Existing expert calculator tests continue to pass, and rebuilding the data is reproducible.

