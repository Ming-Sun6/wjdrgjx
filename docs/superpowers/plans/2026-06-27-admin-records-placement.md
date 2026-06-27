# Admin Records Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move shop purchase records into the shop admin page and activation redemption records into the activation code admin page.

**Architecture:** This is a markup placement fix in the existing admin console. The record tables, API endpoints, and page-specific JS already exist; implementation should move the existing HTML blocks from the role-management pages into their matching feature pages without changing endpoint contracts.

**Tech Stack:** Static HTML admin console, browser JavaScript modules, Node built-in test runner.

---

### Task 1: Add Placement Regression Tests

**Files:**
- Modify: `tests/shop.test.js`
- Modify: `tests/user-rewards.test.js`

- [ ] **Step 1: Write failing tests**

Add assertions that `shopPurchaseSearchInput` appears inside `section#page-shop` and not inside `section#page-admins`; add assertions that `activationRedemptionSearchInput` appears inside `section#page-activation-codes` and not inside `section#page-moderators`.

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/shop.test.js tests/user-rewards.test.js`
Expected: FAIL because the records blocks are currently under the wrong sections.

### Task 2: Move Existing HTML Blocks

**Files:**
- Modify: `public/function/_ops/console-7a9/internal/admin.html`

- [ ] **Step 1: Move shop purchase records block**

Cut the entire block starting with the page-title text `兑换记录` and ending at `shopPurchaseNextBtn` from `section#page-admins`, then paste it after the shop items table in `section#page-shop`.

- [ ] **Step 2: Move activation redemption records block**

Cut the entire block starting with the page-title text `使用记录` and ending at `activationRedemptionNextBtn` from `section#page-moderators`, then paste it after the activation code list table in `section#page-activation-codes`.

- [ ] **Step 3: Keep ids unchanged**

Do not rename inputs, buttons, tables, or JS functions. Existing scripts already use these ids.

### Task 3: Verify

**Files:**
- Test: `tests/shop.test.js`
- Test: `tests/user-rewards.test.js`
- Test: `public/function/_ops/console-7a9/internal/admin.html`

- [ ] **Step 1: Run targeted tests**

Run: `node --test tests/shop.test.js tests/user-rewards.test.js`
Expected: PASS.

- [ ] **Step 2: Check working diff**

Run: `git diff -- public/function/_ops/console-7a9/internal/admin.html tests/shop.test.js tests/user-rewards.test.js`
Expected: only placement/test changes for records sections.
