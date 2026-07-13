# Mobile Multi-Column UI Redesign

## Goal

Increase information density on mobile without reducing legibility or changing calculator behavior. The redesign covers selected calculators, data pages, gift pages, and the home page's "more tools" title alignment.

## Scope

- `public/function/Architecture10.html`
- `public/function/equipment-training-calculator.html`
- `public/function/lord-equipment-gem-calculator.html`
- `public/function/Zero/hero-data.html`
- `public/function/refine-crystal-calculator.html`
- `public/function/refine-crystal-simulator.html`
- `public/function/expert-calculator.html`
- `public/function/T12Calculator.html`
- `public/function/T12DataOverview.html`
- `public/function/Zero/regular-gift-data.html`
- `public/function/Zero/special-gift-data.html`
- `public/function/Zero/gift-rotation-schedule.html`
- `index.html`

No calculator formulas, source data, API contracts, theme behavior, or desktop layout are intentionally changed.

## Responsive Rules

### Breakpoints

- Desktop/tablet layout remains unchanged above `768px` unless an existing page already uses a wider breakpoint.
- From `360px` through `768px`, eligible controls, buttons, cards, and metrics use two columns.
- T12 detail metrics use four columns from `340px` upward.
- Below `340px`, ordinary two-column regions may fall back to one column and T12 four-column details fall back to two columns.
- Long descriptions, notices, totals, and wide tables may span the full grid width at every breakpoint.

### Shared Quality Constraints

- Every grid child uses `min-width: 0` so content cannot force horizontal overflow.
- Numeric values may wrap only at safe boundaries; labels may wrap to two lines.
- Inputs and command buttons retain at least a 42px touch target.
- Font sizes are fixed by breakpoint and do not scale with viewport width.
- Day and night theme variables remain the source of colors.

## Page Designs

### Calculators

- **Fire Crystal Building:** keep building cards in two columns; keep summary metrics in two columns instead of collapsing to one; arrange preset buttons in two columns. Long notes and the source table remain full width.
- **Training Station:** preserve two-column controls and result metrics; compact resource/result cards into two columns. Mode-dependent or long explanatory rows span both columns.
- **Lord Equipment and Gem:** keep field pairs and summary metrics in two columns. Material tables remain full width inside their section; the major equipment and gem sections may stack because two side-by-side tables are not readable at phone width.
- **Refine Calculator and Simulator:** controls, action buttons, and metrics use two columns. Warning text, probability explanations, and history/table areas span both columns.
- **Expert Calculator:** controls and action buttons use two columns; skill cards use a two-column list on normal phones with compact internal spacing. Totals and long effect descriptions span both columns. Below `340px`, skill cards return to one column.

### Data Pages

- **Hero Data:** generation/hero entry cards use two columns on normal phones and one column below `340px`. Card titles and short metadata are compact; long descriptions remain readable.
- **T12 Calculator:** the existing two-tech-card mobile layout remains. Each expanded technology detail uses a four-column metric grid; labels and values are compact and do not create horizontal scrolling. Below `340px`, details use two columns.
- **T12 Data Overview:** filter/statistic regions remain two columns. Every expanded level detail uses four compact metric columns; below `340px`, it uses two columns. A level row should not consume card-sized vertical space for each metric.

### Gift Pages

- **Regular and Special Gifts:** the mobile gift selector/list uses two columns. The active gift's detail spans both columns and appears directly after the selected item so context remains clear. Below `340px`, the list may use one column.
- **Gift Rotation Schedule:** desktop keeps a semantic table. Mobile presents each record as a compact three-part row/card: gift name, emphasized cycle, and a wrapping note. Search behavior and source data remain unchanged. Rows use restrained borders and alternating/hover states instead of oversized floating cards.

### Home Page Tool Titles

- Every managed tool title uses the same `.tool-tile-name-inner` wrapper.
- Mobile titles use a stable centered grid area with equal line-height and vertical alignment.
- Long names wrap naturally to two or more lines without rotation, baseline drift, clipping, or different anonymous flex-item behavior.
- Dynamic `new` and `hot` badges continue to render and must not shift the title off-center.

## Error and Empty States

- Existing empty, loading, and API error messages remain full width.
- A two-column list with one item leaves the last item aligned to the first column; it is not stretched into a misleading full-width result unless it is a detail or error region.
- Hidden sections remain hidden and do not leave empty grid tracks.

## Testing

- Add static contract tests for each target page's mobile grid rules before implementation.
- Preserve existing calculator/data tests and run the full Node test suite.
- Run `node --check` for any changed JavaScript-bearing server file when applicable and `git diff --check` for all edits.
- Use headless Edge at `390x844` and `360x800` in day and night themes to inspect horizontal overflow, clipped text, touch targets, and grid density.
- Verify T12 detail grids at four columns and the `<340px` fallback at two columns.
- Verify regular/special gift active details span both list columns and the rotation schedule remains searchable.

