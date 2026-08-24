# Activity Calendar Admin Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the activity-calendar admin editor around understandable schedule structure, optional recurrence, multi-day occurrence duration, and reusable server-side presets.

**Architecture:** Keep the existing canonical calendar tables and compatibility schedule types. Extend normalization so recurrence is determined by supplied recurrence fields, add a small settings-backed preset service to calendar routes, and replace the current admin form/script with a step-based editor plus dedicated stylesheet.

**Tech Stack:** Node.js CommonJS, Express 5, vanilla HTML/CSS/JavaScript, existing `site_settings` JSON storage, Node test runner.

---

### Task 1: Generalize recurring duration

**Files:**
- Modify: `calendar-domain.js`
- Test: `tests/calendar-domain.test.js`

- [ ] Add failing tests for a multi-day recurring ordinary schedule, validation limits, time ranges, and recurrence fields on supported canonical payloads.
- [ ] Run `node --test tests/calendar-domain.test.js` and confirm the new assertions fail.
- [ ] Update `normalizeSchedulePayload` to normalize recurrence whenever valid recurrence fields are present while preserving old `recurring` and composite behavior.
- [ ] Confirm expansion calculates every occurrence end date from the original inclusive duration and preserves non-contiguous `date-list` occurrences.
- [ ] Run the domain tests and confirm they pass.

### Task 2: Add settings-backed schedule presets

**Files:**
- Create: `calendar-presets.js`
- Modify: `calendar-routes.js`
- Modify: `server.js`
- Test: `tests/calendar-presets.test.js`
- Test: `tests/calendar-routes.test.js`

- [ ] Add failing tests for preset normalization, duplicate names, 50-item limit, unique IDs, corrupted settings, stale categories, identity stripping, date-list shifting, save/list/delete, admin authorization, payload validation, and audit actions.
- [ ] Run the preset and route tests and confirm failure.
- [ ] Implement a preset store using the `calendar_schedule_presets` settings key.
- [ ] Inject `getSetting` and `setSetting` into `mountCalendarRoutes`.
- [ ] Add GET, POST-create, and POST-delete routes.
- [ ] Run preset and route tests and confirm they pass.

### Task 3: Rebuild the admin calendar markup and styles

**Files:**
- Create: `public/function/admin-calendar-page.css`
- Modify: `public/function/_ops/console-7a9/internal/admin.html`
- Test: `tests/admin-calendar-page.test.js`

- [ ] Replace old structure assertions with failing tests for the new step cards, ordinary/composite structure selector, continuous/selected-date modes, date chips, duration input, repeat toggle, computed end-date output, date quick actions, color swatches, preset panel, and responsive stylesheet.
- [ ] Run the admin page test and confirm failure.
- [ ] Replace the calendar page markup while preserving existing IDs needed by category and list operations where appropriate.
- [ ] Add the standalone stylesheet and cache-busted references.
- [ ] Ensure no hidden field carries native `required` validation.
- [ ] Run the admin page test and confirm it passes.

### Task 4: Rewrite the admin interaction layer

**Files:**
- Modify: `public/function/admin-calendar-page.js`
- Test: `tests/admin-calendar-page.test.js`

- [ ] Add failing assertions for duration/end-date conversion, today/tomorrow/next-week quick dates, synchronized palette/custom colors, legacy type mapping, repeat visibility, preset load/apply/save/delete, client validation, and CDN-compatible POST calls.
- [ ] Run the admin test and confirm failure.
- [ ] Implement state mapping between the simplified editor and canonical API payloads, including legacy `date-list` round trips.
- [ ] Implement preset actions; applying a preset shifts start date to today and preserves duration.
- [ ] Preserve category edit/reorder/status, schedule edit/copy/status/delete, and all composite child date modes/properties.
- [ ] Bump the script version and run syntax plus admin tests.

### Task 5: Documentation and release verification

**Files:**
- Create: `docs/calendar-admin-redesign-acceptance.md`
- Modify: `index.html`
- Modify: `public/function/_ops/console-7a9/internal/admin.html`
- Test: `tests/calendar-changelog.test.js`

- [ ] Document the new page sections, creation flows, recurrence duration examples, preset behavior, compatibility, and an acceptance checklist.
- [ ] Add a public-facing home changelog item without mentioning internal administration.
- [ ] Add a detailed management changelog item.
- [ ] Run `node --check` on changed JavaScript files.
- [ ] Run all calendar, changelog, tool-management, branding, and relevant server tests.
- [ ] Run `git diff --check` and inspect the final diff for unrelated changes.
