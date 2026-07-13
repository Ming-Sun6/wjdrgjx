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
- `scripts/generate-t12-pages.py`
- `scripts/regenerate-t12-html.js` (verification workflow; no behavior change expected)
- `public/function/Zero/regular-gift-data.html`
- `public/function/Zero/special-gift-data.html`
- `public/function/Zero/gift-data-page.js`
- `public/function/Zero/gift-rotation-schedule.html`
- `index.html`

No calculator formulas, source data, API contracts, theme behavior, or desktop layout are intentionally changed.

## Responsive Rules

### Breakpoints

- Desktop/tablet layout remains unchanged above `768px` unless an existing page already uses a wider breakpoint.
- From `340px` through `768px` inclusive, eligible controls, buttons, cards, and metrics use two columns.
- T12 detail metrics use four columns from `340px` through `768px` inclusive.
- At `339px` and below, ordinary two-column regions fall back to one column and T12 four-column details fall back to two columns.
- Long descriptions, notices, totals, and wide tables may span the full grid width at every breakpoint.

### Shared Quality Constraints

- Every grid child uses `min-width: 0` so content cannot force horizontal overflow.
- Four-column labels use at least `10px/1.2` typography and values use at least `11px/1.2`; labels are limited to two lines.
- Long numeric values use tabular numerals, `overflow-wrap: anywhere`, and may shrink within their grid cell without increasing the grid width.
- Text and controls retain the existing theme contrast variables in both day and night modes.
- Inputs and command buttons retain at least a `44px` touch target.
- Font sizes are fixed by breakpoint and do not scale with viewport width.
- Day and night theme variables remain the source of colors.
- Page-specific mobile overrides are scoped after, or made more specific than, `mobile-responsive.css`; its generic `.grid { grid-template-columns: 1fr !important; }` rule must not force these approved grids back to one column.

## Page Designs

### Calculators

- **Fire Crystal Building:** keep building cards in two columns; keep summary metrics in two columns instead of collapsing to one; arrange preset buttons in two columns. Long notes and the source table remain full width.
- **Training Station:** preserve two-column controls and result metrics; compact resource/result cards into two columns. Mode-dependent or long explanatory rows span both columns.
- **Lord Equipment and Gem:** keep field pairs and summary metrics in two columns. Material tables remain full width inside their section; the major equipment and gem sections may stack because two side-by-side tables are not readable at phone width.
- **Refine Calculator and Simulator:** controls, action buttons, and metrics use two columns. Warning text, probability explanations, and history/table areas span both columns.
- **Expert Calculator:** controls and action buttons use two columns; skill cards use a two-column list on normal phones with compact internal spacing. Totals and long effect descriptions span both columns. Below `340px`, skill cards return to one column.

### Data Pages

- **Hero Data:** generation/hero entry cards use two columns on normal phones and one column below `340px`. Card titles and short metadata are compact; long descriptions remain readable.
- **T12 Calculator:** the existing two-tech-card mobile layout remains. In the "科技详情" result section, the three KPI values and five resource values are rendered as one eight-item `.tech-detail-grid`, producing two rows of four metrics. At `339px` and below it uses two columns. The generated HTML and `scripts/generate-t12-pages.py` template must stay equivalent.
- **T12 Data Overview:** filter/statistic regions remain two columns. Every expanded level detail uses four compact metric columns at `340-768px` and two at `<=339px`; the existing three-column-at-360 behavior and test are replaced. A level row should not consume card-sized vertical space for each metric. The generated HTML and Python template must stay equivalent.

### Gift Pages

- **Regular and Special Gifts:** the mobile gift selector/list uses two columns. Existing multi-expand behavior is retained: each button exposes its own associated full-width detail region and multiple gifts may remain open. Expanded names survive filtering when still present and survive resize; a URL-selected gift becomes the sole initially expanded mobile item. Buttons expose `aria-expanded` and `aria-controls`, detail regions have stable IDs, rerendering restores focus to the toggled button, and the existing result count/empty state remains visible to assistive technology. At `<=339px`, the list uses one column.
- **Gift Rotation Schedule:** desktop keeps its semantic table. Mobile restyles the same `table`/`tr`/`td` DOM into compact three-part records, so there is one data source and no duplicate accessibility tree. Each cell retains an accessible visible label for gift name, cycle, and note; document reading order remains name -> cycle -> note. Search and empty-result behavior remain equivalent, and interactive search controls retain `:focus-visible` styling. Rows use restrained borders and alternating states instead of oversized floating cards.

### Home Page Tool Titles

- Every managed tool title uses the same `.tool-tile-name-inner` wrapper.
- Mobile titles use a stable centered grid area with a minimum three-line title height, equal line-height, and centered vertical alignment for one-, two-, and three-line names.
- Long names wrap naturally to two or more lines without rotation, baseline drift, clipping, or different anonymous flex-item behavior.
- Dynamic `new` and `hot` badges are absolutely positioned in a reserved top-right card area and must not participate in title layout or shift the title off-center.
- Pet Data Query and WJTI Personality Test are explicitly checked with no badge, `new`, and `hot` states.

## Error and Empty States

- Existing empty, loading, and API error messages remain full width.
- A two-column list with one item leaves the last item aligned to the first column; it is not stretched into a misleading full-width result unless it is a detail or error region.
- Hidden sections remain hidden and do not leave empty grid tracks.

## Testing

- Add static contract tests for each target page's mobile grid rules before implementation. Update the existing T12 overview test that currently expects three columns at `360px`.
- Preserve existing calculator/data tests and run the full Node test suite.
- Update the Python T12 template and generated HTML together, run `npm run regenerate:t12`, and verify the regeneration produces no loss of the new markup or CSS.
- Run the full suite with `$tests=(Get-ChildItem tests -Filter '*.test.js').FullName; node --test $tests`, then run `git diff --check`.
- Use computed-layout checks and headless Edge at widths `339`, `340`, `360`, `390`, `430`, `768`, and `769` in day and night themes. Assert expected column counts, `scrollWidth <= clientWidth`, and `44px` interactive targets.
- Verify keyboard gift expansion, focus restoration, `aria-expanded`, search counts/empty states, and rotation-table reading order.
- Verify T12 detail grids use four columns at `340-768px` and two columns at `<=339px`.
