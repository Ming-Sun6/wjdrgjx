# 历史移民分组后台配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 新增历史移民日期、分组规则和手动覆盖的后台配置，并让历史移民分组页与移民预测页读取统一配置。

**Architecture:** 新增独立的配置标准化模块，服务端使用 `site_settings` 保存配置并提供公开/管理员 API。历史分组页和移民预测页通过公开 API 获取配置，失败时保留静态默认逻辑；邻邦进度配置作为区间与阶段日期来源。

**Tech Stack:** Node.js/Express、现有 `site_settings`、原生 HTML/CSS/JavaScript、Node test runner。

---

### Task 1: 配置模块与测试

**Files:**
- Create: `history-immigration-config.js`
- Create: `tests/history-immigration-config.test.js`

- [ ] 写失败测试：默认配置、日期排序、重复日期拒绝、规则默认值、手动覆盖校验。
- [ ] 运行 `node --test tests/history-immigration-config.test.js`，确认 RED。
- [ ] 实现 `normalizeHistoryImmigrationConfig`、`defaultHistoryImmigrationConfig` 和日期生成函数。
- [ ] 运行测试确认 PASS。

### Task 2: 服务端公开与管理员接口

**Files:**
- Modify: `server.js`
- Create: `tests/history-immigration-api.test.js`

- [ ] 添加 `history_immigration_config` setting key。
- [ ] 添加 `GET /api/history-immigration`，异常时返回默认配置。
- [ ] 添加管理员 GET/POST/PUT，复用 `requireAdmin`、`getSetting`、`setSetting`、`auditAdminAction`。
- [ ] 写接口 wiring 和鉴权测试，运行测试确认通过。

### Task 3: 后台历史移民分组编辑器

**Files:**
- Modify: `public/function/_ops/console-7a9/internal/admin.html`
- Create: `public/function/admin-history-immigration-page.js`
- Create: `tests/history-immigration-admin.test.js`

- [ ] 增加后台导航和页面入口。
- [ ] 实现日期列表、规则编辑、矩阵预览、单格覆盖、保存/重载。
- [ ] 支持新增日期、修改日期、停用日期、按间隔生成日期和清除覆盖。
- [ ] 接入页面加载分发和脚本引用。
- [ ] 运行后台结构测试与脚本语法检查。

### Task 4: 历史移民分组页联动

**Files:**
- Modify: `public/function/history-immigration-group.html`
- Create/modify: `tests/history-immigration-page.test.js`

- [ ] 加载邻邦进度和历史移民配置。
- [ ] 配置优先、静态数据兜底。
- [ ] 按日期和规则计算分组，手动覆盖优先。
- [ ] 保持原有筛选、表格和移动端展示。
- [ ] 增加 API hook、回退和覆盖逻辑测试。

### Task 5: 移民预测页联动

**Files:**
- Modify: `public/function/migration-prediction.html`
- Create/modify: `tests/migration-prediction-config.test.js`

- [ ] 复用历史移民配置和邻邦进度配置。
- [ ] 用配置中的历史日期生成预测日期。
- [ ] 用统一分组规则重算矩阵、当前区服分组和后续预测。
- [ ] API 失败时保留现有静态计算。
- [ ] 验证日期修改、邻邦阶段修改和手动覆盖能影响预测结果。

### Task 6: 更新日志与完整验证

**Files:**
- Modify: `index.html`
- Modify: `public/function/_ops/console-7a9/internal/admin.html`

- [ ] 首页和后台更新日志加入历史移民分组配置功能。
- [ ] 运行全量测试：`node --test tests/*.test.js`。
- [ ] 运行语法检查：`node --check server.js`、相关前端脚本检查。
- [ ] 运行 `git diff --check`。

## Implementation Contracts

- `history-immigration-config.js` remains a Node-side validator; browser pages consume the JSON APIs and keep small pure adapters locally, avoiding an unserved root module import.
- Public APIs return the normalized config object directly with HTTP 200; administrator validation failures return HTTP 400 with `{ error: "BAD_CONFIG" }`, authentication failures use the existing `requireAdmin` behavior, and unexpected storage errors return HTTP 500 for admin routes or the static default for public routes.
- Dates are strict UTC ISO dates (`YYYY-MM-DD`), generated with UTC calendar arithmetic. New dates are generated from the requested anchor and interval, then de-duplicated and sorted; disabled dates remain stored but are excluded from calculations.
- Override values are limited to `group-<id>` strings; canonical range keys come from the normalized neighbor-progress `ranges` array. Unknown keys are discarded during normalization.
- Save writes one complete normalized JSON value through `setSetting`; failed writes do not alter the previous value. Audit metadata includes date count, rule values, and override count.
- Frontend verification uses structural source tests plus extracted Node-pure configuration tests; browser runtime behavior is covered by API hook, fallback, and override wiring assertions without introducing a new browser test dependency.
