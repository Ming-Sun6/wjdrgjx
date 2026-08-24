# Activity Calendar Gantt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hidden legacy calendar with a warm-toned weekly/monthly Gantt calendar, configurable categories and schedule rules, daily checklist composites, lazy homepage embedding, and administrator-controlled homepage menu visibility.

**Architecture:** Keep recurrence, validation, migration, and layout calculations in testable CommonJS modules instead of adding more logic to `server.js` or inline HTML. The backend mounts a calendar store/service/router around the existing database helpers and preserves the old calendar endpoints; the frontend uses a standalone calendar shell plus focused CSS/JS assets, which the homepage loads in an iframe only after the calendar tab is selected. Homepage menu visibility remains a small `site_settings`-backed module with public/admin projections.

**Tech Stack:** Node.js CommonJS, Express 5, MySQL/PostgreSQL adapters already present in the project, browser JavaScript, HTML/CSS, Node built-in `node:test`.

---

## File structure

- Create `calendar-domain.js`: UTC date arithmetic, validation, recurrence expansion, child-task expansion, daily-card generation, week clipping, stable IDs, and the 2000-render-unit guard.
- Create `calendar-store.js`: cross-database DDL, category seeding, legacy migration, transactional CRUD, and row mapping.
- Create `calendar-routes.js`: public/admin route handlers and legacy endpoint compatibility.
- Create `home-navigation.js`: fixed menu catalog, normalization, public/admin projections, and handler factory.
- Create `public/function/calendar-gantt.js`: range navigation, API loading/cache/cancellation, weekly/monthly rendering, Gantt lanes, daily checklist rendering, and detail dialogs.
- Create `public/function/calendar-gantt.css`: warm rounded responsive visual system and embedded-mode rules.
- Create `public/function/admin-calendar-page.js`: category management and all four schedule editors.
- Create `public/function/admin-home-navigation-page.js`: five-menu visibility editor.
- Modify `server.js`: initialize/mount the new modules, remove the old inline calendar route implementation, export pure helpers needed by tests.
- Modify `postgres-schema.js`: include the three canonical calendar tables and indexes for PostgreSQL startup.
- Modify `public/function/calendar.html`: reduce it to the accessible page shell and load the focused CSS/JS assets.
- Modify `public/function/_ops/console-7a9/internal/admin.html`: replace the legacy calendar form, add homepage-menu controls, load the new scripts, and add an admin changelog entry.
- Modify `index.html`: expose the calendar tab, replace the hidden calendar card with a lazy embed host, and add the homepage changelog entry.
- Modify `public/function/home-app.js`: apply menu settings, choose a visible fallback tab, and create the calendar iframe only on first activation.
- Create/modify tests under `tests/` for each contract before implementation.

### Task 1: Calendar domain primitives and recurrence engine

**Files:**
- Create: `calendar-domain.js`
- Create: `tests/calendar-domain.test.js`

- [ ] **Step 1: Write failing UTC date and ISO-week tests**

Cover `parseDate`, `formatDate`, `addDays`, inclusive day counts, Monday week boundaries, ISO week-year values around New Year, 18-month navigation boundaries, and invalid date rejection.

```js
test('ISO week uses week-year across New Year', () => {
  assert.deepEqual(domain.getIsoWeek('2027-01-01'), { weekYear: 2026, week: 53 });
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `node --test tests/calendar-domain.test.js`

Expected: FAIL because `calendar-domain.js` does not exist.

- [ ] **Step 3: Implement pure date helpers and validation constants**

Export fixed enums for schedule types, composite layouts, child date modes, recurrence units/end modes, and `MAX_RENDER_UNITS = 2000`. Use UTC-only `Date.UTC` arithmetic; never parse plain dates through browser-local time.

- [ ] **Step 4: Add failing schedule validation tests**

Cover `single`, `continuous`, `date-list`, `recurring`, and `composite`; all child `dateMode` mutual-exclusion rules; disabled-category selection; time constraints; monthly day 1–31; recurrence end modes; and at least one enabled composite child.

- [ ] **Step 5: Implement `normalizeSchedulePayload` and `normalizeItemPayload`**

Return `{ value }` or `{ error }` with the exact errors from the spec (`BAD_ITEM_OFFSET`, `ITEMS_REQUIRED`, `BAD_RECURRENCE`, `BAD_COLOR`, and related field errors).

- [ ] **Step 6: Add failing expansion and ID tests**

Test daily/weekly/monthly recurrence, count/until/never endings, skipped invalid month days, overlapping parent occurrences, child-relative ranges, selected-day segmentation, child recurring windows, `gantt` item IDs, `daily-list` card IDs, first/last card dates, and expansion-limit failure.

- [ ] **Step 7: Implement range expansion**

Expose `expandDefinitions(definitions, { from, to, maxUnits })`. Count ordinary occurrences, parent occurrences, Gantt child occurrences, and daily cards while building the response; throw a typed `EXPANSION_LIMIT` before returning partial data.

- [ ] **Step 8: Run and commit**

Run: `node --test tests/calendar-domain.test.js`

Expected: PASS.

Commit: `git commit -m "feat: add calendar recurrence domain" -- calendar-domain.js tests/calendar-domain.test.js`

### Task 2: Canonical schema, category seeding, and legacy migration

**Files:**
- Create: `calendar-store.js`
- Create: `tests/calendar-store.test.js`
- Modify: `postgres-schema.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing DDL and seeding tests**

Assert that MySQL and PostgreSQL definitions include `calendar_categories`, `calendar_schedule_definitions`, `calendar_schedule_items`, required unique/index constraints, and the five immutable codes:

```js
['regular', 'kingdom', 'leaderboard', 'cross-server', 'limited']
```

- [ ] **Step 2: Implement DDL exports and `ensureCalendarSchema`**

Create tables before migration. Seed missing preset categories by `code` without renaming existing rows. Add the PostgreSQL statements to `POSTGRES_SCHEMA_SQL`; call the shared initializer from both DB startup branches in `server.js`.

- [ ] **Step 3: Write failing legacy migration tests**

Use a fake database adapter. Verify grouping by `original_id`, one-date to `single`, consecutive dates to `continuous`, gaps to `date-list`, default `regular` category lookup by code, `legacy_original_id` idempotency, and preservation of the old table.

- [ ] **Step 4: Implement `migrateLegacyCalendarSchedules`**

Run category initialization first, then migrate each unmigrated legacy group transactionally. Store sorted deduplicated dates and never write new records back to `calendar_schedules`.

- [ ] **Step 5: Add transactional repository tests**

Cover definition/item create, full-replacement PATCH semantics, copy-default-disabled, status changes, category reorder/status, unknown child IDs, foreign child IDs, and rollback on item failure.

- [ ] **Step 6: Implement repository methods**

Expose `listDefinitions`, `getDefinition`, `createDefinition`, `replaceDefinition`, `copyDefinition`, `setDefinitionStatus`, `deleteDefinition`, and category CRUD/reorder/status methods. Parse JSON columns consistently for both databases.

- [ ] **Step 7: Run and commit**

Run: `node --test tests/calendar-store.test.js`

Expected: PASS.

Commit: `git commit -m "feat: add canonical calendar storage" -- calendar-store.js postgres-schema.js server.js tests/calendar-store.test.js`

### Task 3: Public, admin, and legacy calendar APIs

**Files:**
- Create: `calendar-routes.js`
- Create: `tests/calendar-routes.test.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing public-handler tests**

Verify inclusive `from/to`, required paired range parameters, 366-day limit, canonical occurrence response, category projection, Gantt `items`, daily-list `cards`, no-card parent omission, and `422 EXPANSION_LIMIT`.

- [ ] **Step 2: Implement `createCalendarHandlers` and mount routes**

Mount `GET /api/calendar/schedules?from&to`, `GET /api/admin/calendar/schedules`, category routes, and new schedule CRUD/copy/status routes. Inject `queryRows`, `queryOne`, `execute`, `runInTransaction`, `requireAdmin`, and `auditAdminAction` so tests do not start the server.

- [ ] **Step 3: Write failing legacy-shape tests**

No-range GET must return the 366-day compatibility window as per-day rows with `rangeDefaulted: true`. Old POST/PATCH/DELETE must map `dates` to canonical definitions and locate rows by `legacy_original_id`/compatible original ID.

- [ ] **Step 4: Implement compatibility handlers and remove old inline routes**

Keep the old paths but delegate to the new service. Do not leave duplicate Express route declarations in `server.js`.

- [ ] **Step 5: Add admin permission/audit/error tests**

Cover `401/403`, category conflicts, disabled category assignment, bad items, copy behavior, stable error JSON, and audit actions for every mutating operation.

- [ ] **Step 6: Run and commit**

Run: `node --test tests/calendar-routes.test.js tests/calendar-domain.test.js tests/calendar-store.test.js`

Expected: PASS.

Commit: `git commit -m "feat: expose calendar management APIs" -- calendar-routes.js server.js tests/calendar-routes.test.js`

### Task 4: Homepage menu visibility API

**Files:**
- Create: `home-navigation.js`
- Create: `tests/home-navigation.test.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing normalization/projection tests**

Use the fixed catalog and order:

```js
[
  ['all', '全部'],
  ['tools', '工具'],
  ['forum', '交流论坛'],
  ['calendar', '活动日历'],
  ['my', '我的信息']
]
```

Reject unknown IDs, duplicates, missing IDs, non-boolean `visible`, and all-hidden payloads. Read failures fall back to all visible.

- [ ] **Step 2: Implement handler factory and route mounting**

Mount public GET and admin GET/PUT/POST. Persist under `home_navigation`, add `updatedAt/updatedBy`, enforce admin access, and audit `home_navigation.update`.

- [ ] **Step 3: Run and commit**

Run: `node --test tests/home-navigation.test.js tests/tool-management.test.js`

Expected: PASS without changing existing tool management behavior.

Commit: `git commit -m "feat: add homepage navigation settings" -- home-navigation.js server.js tests/home-navigation.test.js`

### Task 5: Calendar page shell and deterministic Gantt renderer

**Files:**
- Create: `public/function/calendar-gantt.js`
- Create: `public/function/calendar-gantt.css`
- Create: `tests/calendar-gantt-ui.test.js`
- Modify: `public/function/calendar.html`

- [ ] **Step 1: Write failing page-structure tests**

Assert only week/month toggles exist, the fixed activity-category column is present, the date/range picker is accessible, loading/error/empty states exist, and `?embed=1` hooks are present.

- [ ] **Step 2: Replace the old inline calendar implementation with a shell**

Keep theme/bootstrap/meta/footer conventions, but move calendar behavior/style to the two new assets. In embedded mode add `html.is-embedded`, hide duplicate header/footer, remove outer margin, and announce load status with `aria-live`.

- [ ] **Step 3: Add failing pure layout tests**

Export testable helpers from `calendar-gantt.js` under CommonJS when available: week clipping, first-fit Gantt lanes, classification grouping, composite stable sorting, daily-card column grouping, and continuation labels.

- [ ] **Step 4: Implement weekly and monthly rendering**

Weekly view is one Monday–Sunday grid. Monthly view renders each natural week as its own date header plus schedule rows. Render category cells independently, adjacent non-overlapping tasks in one lane, overlapping tasks in new lanes, and continuation chips.

- [ ] **Step 5: Implement `gantt` and `daily-list` composite renderers**

Gantt composites use dedicated row groups and nested child lanes. Daily lists render a left category cell spanning a seven-column title row/content area, keep equal column heights, show highlighted markers, and never merge same-name daily cards.

- [ ] **Step 6: Implement navigation, caching, and cancellation**

Use an `AbortController` per request, cache by `{view,from,to}`, limit selectors to current month plus previous 17 months, use ISO week values, and fetch only after `DOMContentLoaded` of the calendar page (which itself is lazy-created by the homepage).

- [ ] **Step 7: Add responsive and visual-state tests**

Check warm palette variables, rounded cards, sticky category column, desktop seven-column sizing, mobile horizontal scroll, today/weekend/out-of-month styles, and empty/error retry states.

- [ ] **Step 8: Run and commit**

Run: `node --test tests/calendar-gantt-ui.test.js`

Expected: PASS.

Commit: `git commit -m "feat: build responsive calendar gantt view" -- public/function/calendar.html public/function/calendar-gantt.js public/function/calendar-gantt.css tests/calendar-gantt-ui.test.js`

### Task 6: Administrator category and schedule editor

**Files:**
- Create: `public/function/admin-calendar-page.js`
- Create: `tests/admin-calendar-page.test.js`
- Modify: `public/function/_ops/console-7a9/internal/admin.html`

- [ ] **Step 1: Write failing admin markup/wiring tests**

Require category controls, reload/save statuses, four schedule types, recurrence unit/end controls, composite layout selector, repeatable item editor, highlighted toggle, copy/status/delete actions, and the new script include.

- [ ] **Step 2: Replace the legacy calendar admin section**

Keep the existing sidebar `data-page="calendar"` entry, but replace the old date-picking form with category management, schedule list/filter, and a progressive form whose fields appear by schedule type/date mode.

- [ ] **Step 3: Implement category management**

Load all categories, show enabled/disabled state, validate names/colors client-side, support add/edit/reorder/status, and retain stopped categories in existing schedule editors.

- [ ] **Step 4: Implement schedule CRUD and composite items**

Serialize the exact canonical API payload. PATCH submits the complete item array; omitted existing item IDs are intentionally deleted, while retained disabled items remain in the array with `enabled:false`.

- [ ] **Step 5: Implement explicit error/status handling**

Map server errors to Chinese messages, keep form data after failure, require confirmation for delete, and refresh lists only after successful mutations.

- [ ] **Step 6: Run and commit**

Run: `node --test tests/admin-calendar-page.test.js tests/calendar-routes.test.js`

Expected: PASS.

Commit: `git commit -m "feat: add calendar administration UI" -- public/function/admin-calendar-page.js public/function/_ops/console-7a9/internal/admin.html tests/admin-calendar-page.test.js`

### Task 7: Homepage calendar tab and true lazy loading

**Files:**
- Create: `tests/home-calendar-lazy-load.test.js`
- Modify: `index.html`
- Modify: `public/function/home-app.js`
- Modify: `tests/home-tools-mobile-ui.test.js`

- [ ] **Step 1: Write failing desktop/mobile menu tests**

Assert the visible tab order is 全部/工具/交流论坛/活动日历/我的信息, the mobile bottom bar contains the same calendar action, and the old hidden calendar card/link is gone.

- [ ] **Step 2: Add the calendar panel host**

Create a full-width `data-category="calendar"` panel with loading/error placeholders and no initial iframe/source URL in markup.

- [ ] **Step 3: Write failing lazy-load behavior tests**

Verify no calendar iframe is created during startup or while other tabs are selected; first `setHomeTab('calendar')` creates exactly one iframe with `/function/calendar.html?embed=1`; later tab switches reuse it; failure exposes retry.

- [ ] **Step 4: Implement `ensureCalendarEmbed`**

Call it only after a validated calendar tab becomes active. Set iframe `src` at creation time, attach load/error handlers, and keep the iframe mounted for the page session.

- [ ] **Step 5: Run and commit**

Run: `node --test tests/home-calendar-lazy-load.test.js tests/home-tools-mobile-ui.test.js tests/home-tool-management.test.js`

Expected: PASS.

Commit: `git commit -m "feat: lazy load calendar from homepage" -- index.html public/function/home-app.js tests/home-calendar-lazy-load.test.js tests/home-tools-mobile-ui.test.js`

### Task 8: Homepage menu settings UI and runtime application

**Files:**
- Create: `public/function/admin-home-navigation-page.js`
- Create: `tests/admin-home-navigation-page.test.js`
- Modify: `public/function/_ops/console-7a9/internal/admin.html`
- Modify: `public/function/home-app.js`
- Modify: `tests/home-calendar-lazy-load.test.js`

- [ ] **Step 1: Write failing admin UI tests**

Require a new admin sidebar/page, five fixed checkbox rows, refresh/save controls, authentication states, and GET plus PUT/POST compatibility calls.

- [ ] **Step 2: Implement the admin page**

Load the API-derived list, escape labels, prevent client-side all-hidden submissions, disable save until a successful load, and show server errors without losing selections.

- [ ] **Step 3: Write failing homepage application tests**

Verify `/api/home-navigation` is fetched, desktop/mobile controls with `visible:false` are hidden, active hidden tabs fall back to the first visible item, query parameters are corrected, and hidden calendar does not lazy-load.

- [ ] **Step 4: Implement runtime visibility**

Apply settings to every `[data-home-nav-id]` control, dispatch `homenavigationchange`, recompute valid tabs, and preserve all-visible defaults on fetch failure.

- [ ] **Step 5: Run and commit**

Run: `node --test tests/home-navigation.test.js tests/admin-home-navigation-page.test.js tests/home-calendar-lazy-load.test.js`

Expected: PASS.

Commit: `git commit -m "feat: manage homepage menu visibility" -- public/function/admin-home-navigation-page.js public/function/_ops/console-7a9/internal/admin.html public/function/home-app.js tests/admin-home-navigation-page.test.js tests/home-calendar-lazy-load.test.js`

### Task 9: Compatibility, changelogs, and full verification

**Files:**
- Modify: `index.html`
- Modify: `public/function/_ops/console-7a9/internal/admin.html`
- Modify: relevant existing tests only where contracts intentionally changed

- [ ] **Step 1: Add dated changelog entries**

Homepage wording must describe only user-visible calendar/menu improvements and must not mention backend/admin implementation. Admin changelog may document schema migration, category/schedule management, lazy homepage integration, and homepage-menu visibility controls.

- [ ] **Step 2: Run calendar/navigation suites**

Run:

```powershell
node --test tests/calendar-domain.test.js tests/calendar-store.test.js tests/calendar-routes.test.js tests/calendar-gantt-ui.test.js tests/admin-calendar-page.test.js tests/home-navigation.test.js tests/admin-home-navigation-page.test.js tests/home-calendar-lazy-load.test.js
```

Expected: all PASS.

- [ ] **Step 3: Run existing regression suites**

Run:

```powershell
node --test tests/tool-management.test.js tests/admin-tool-management.test.js tests/home-tool-management.test.js tests/home-tools-mobile-ui.test.js tests/home-index-modularization.test.js tests/share-meta.test.js
```

Expected: all PASS.

- [ ] **Step 4: Run the complete test suite**

Run: `node --test tests/*.test.js`

Expected: all PASS; no unhandled rejection or server listener starts during imports.

- [ ] **Step 5: Perform browser smoke checks**

Check desktop and mobile widths for homepage tab ordering, hidden-menu fallback, first-click iframe creation, standalone/embed calendar modes, week/month navigation, Gantt lane packing, daily checklist cards, category stickiness, admin category/schedule CRUD, and menu visibility persistence.

- [ ] **Step 6: Inspect the final diff and commit**

Run: `git diff --check` and `git status --short`.

Do not stage unrelated existing user changes. Commit only files touched by this feature:

`git commit -m "feat: launch configurable activity calendar" -- <calendar and navigation files>`

