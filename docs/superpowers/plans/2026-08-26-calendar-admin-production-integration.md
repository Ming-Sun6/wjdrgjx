# 活动日历管理 V2 正式接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已验收的活动日历管理 V2 原型接入现有生产后台，并保证所有旧日程、循环、组合子任务和预设字段可无损编辑保存。

**Architecture:** 保留现有 API、DOM 字段 ID 和服务端模型，在生产管理页内重排为五步工作台。新增一个无 DOM 依赖的 UMD 表单模型模块，集中完成“服务端日程 ↔ 编辑器状态 ↔ 保存载荷”的转换；浏览器脚本只负责读取/写入控件和请求接口，使旧数据往返可直接用 Node 测试。

**Tech Stack:** 原生 HTML/CSS/JavaScript、CommonJS/UMD、Node.js `node:test`、现有 Express 日历接口。

---

### Task 1: 锁定生产工作台结构

**Files:**
- Modify: `tests/admin-calendar-page.test.js`
- Modify: `public/function/_ops/console-7a9/internal/admin.html`

- [ ] **Step 1: 写失败测试**

在 `tests/admin-calendar-page.test.js` 增加断言：

```js
test('calendar admin production page uses the approved five-step workspace', () => {
  const page = calendarPageHtml();
  for (const step of ['basic', 'date', 'tasks', 'style', 'presets']) {
    assert.match(page, new RegExp(`data-calendar-step="${step}"`));
    assert.match(page, new RegExp(`data-calendar-panel="${step}"`));
  }
  assert.match(page, /id="calendarScheduleNewBtn"/);
  assert.match(page, /data-calendar-structure="normal"/);
  assert.match(page, /data-calendar-structure="composite"/);
});
```

- [ ] **Step 2: 验证测试按预期失败**

Run: `node --test tests/admin-calendar-page.test.js`

Expected: FAIL，因为生产页尚无五步导航和面板标记。

- [ ] **Step 3: 重排生产 HTML**

仅替换 `#page-calendar` 内部结构：加入 V2 标题区、五步按钮、五个面板、结构选择卡片、真实预设区、底部操作区，以及下方分类/已配置日程资料区。所有既有输入和容器 ID 保持不变；表单继续 `novalidate`，步骤按钮全部 `type="button"`。此步先不添加新资源引用。

- [ ] **Step 4: 验证结构测试通过**

Run: `node --test tests/admin-calendar-page.test.js`

Expected: 新结构测试通过，既有控件与接口静态断言仍通过。

### Task 2: 建立可测试的无损表单模型

**Files:**
- Create: `public/function/admin-calendar-model.js`
- Create: `tests/admin-calendar-model.test.js`
- Modify: `public/function/_ops/console-7a9/internal/admin.html`

- [ ] **Step 1: 写父日程往返失败测试**

测试普通连续循环和不连续日期：

```js
const model = require('../public/function/admin-calendar-model.js');
const editor = model.scheduleToEditor(existingSchedule);
editor.name = '只修改名称';
const payload = model.editorToPayload(editor);
assert.equal(payload.name, '只修改名称');
assert.deepEqual(without(payload, ['name']), without(expectedPayload, ['name']));
```

覆盖 `categoryId`、日期、时间、颜色、描述、启用状态及完整循环字段。

- [ ] **Step 2: 验证测试按预期失败**

Run: `node --test tests/admin-calendar-model.test.js`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现最小 UMD 模型**

实现并导出：

```js
scheduleToEditor(schedule, options)
editorToPayload(editor)
parseDateList(value)
parseNumberList(value)
shiftPresetToDate(payload, today)
```

模块不访问 `window`、`document` 或网络；浏览器使用 `window.AdminCalendarModel`，Node 使用 `module.exports`。

- [ ] **Step 4: 写组合子任务四模式失败测试**

分别构造 `all-span`、`relative-range`、`selected-days`、`recurring` 子任务，验证父日程只改名称后完整 `items` 深度相等，并验证身份字段在正式日程编辑中保留。

- [ ] **Step 5: 实现组合子任务无损转换**

保留规格列出的所有子任务公共字段和各日期模式字段；数字列表去重排序，布尔值和 `0` 不得因真假判断丢失。

- [ ] **Step 6: 写并实现预设日期平移测试**

验证连续日期、不连续日期间距、循环配置和嵌套子任务保持不变，仅平移父日程绝对日期。

- [ ] **Step 7: 验证模型测试通过**

Run: `node --test tests/admin-calendar-model.test.js tests/calendar-presets.test.js`

Expected: PASS。

### Task 3: 接入五步导航和真实表单转换

**Files:**
- Modify: `public/function/admin-calendar-page.js`
- Modify: `tests/admin-calendar-page.test.js`
- Create: `tests/admin-calendar-page-behavior.test.js`
- Create: `tests/helpers/admin-calendar-fake-dom.js`

- [ ] **Step 1: 建立最小 fake DOM 测试入口**

`tests/helpers/admin-calendar-fake-dom.js` 从生产 `admin.html` 的 `#page-calendar` 提取全部带 ID 的表单控件，创建支持 `value`、`checked`、`hidden`、`disabled`、`classList`、`dataset`、`querySelector(All)`、`closest`、`addEventListener`、`dispatchEvent`、`focus` 和 `scrollIntoView` 的最小元素实现。通过 Node `vm` 依次执行真实 `admin-calendar-model.js` 与 `admin-calendar-page.js`，注入可控的 `apiFetch`、`confirm`、`prompt`，不复制生产表单转换逻辑。

页面脚本提供正式的 `window.AdminCalendarPage` 调试/集成接口：`load`、`fillForm`、`schedulePayload`、`setEditorStep`、`resetScheduleForm`。这不是仅供测试的分支；后台也通过同一 API 调用 `load`。

同时新增独立的生产资源红测，在任何资源引用修改之前断言：

```js
test('calendar admin loads versioned production assets in dependency order', () => {
  const modelAt = html.indexOf('/function/admin-calendar-model.js?v=20260826-1');
  const pageAt = html.indexOf('/function/admin-calendar-page.js?v=20260826-5');
  assert.ok(modelAt > 0 && pageAt > modelAt);
  assert.match(html, /admin-calendar-page\.css\?v=20260826-2/);
});
```

先单独运行该测试并确认因模型引用缺失而失败；到 Step 9 才添加三项正式版本引用并让它转绿。

- [ ] **Step 2: 写真实填充/保存链路失败测试**

使用真实页面脚本依次执行：

```js
page.fillForm(existingComposite, false);
fakeDocument.getElementById('calendarScheduleName').value = '只修改名称';
const saved = page.schedulePayload();
assert.deepEqual(without(saved, ['name']), without(expectedComposite, ['name']));
```

分别覆盖普通连续循环、不连续日期、组合日程和四种子任务模式，证明生产控件映射未遗漏。此测试必须先因 `window.AdminCalendarPage` 或步骤实现缺失而失败。

- [ ] **Step 3: 写状态转换和错误保留失败测试**

可执行测试覆盖：

- 基本信息 → 日期 → 组合任务 → 颜色 → 预设切换后，已填名称、日期、颜色和组合项不变。
- 结构和日期方式切换只隐藏/显示控件，不清空暂存值。
- 新建和取消会清空并回到 `basic`。
- 编辑和套用预设进入 `basic`；套用预设把 `editingId` 清空，后续保存请求使用新增 URL。
- 日程保存或预设保存返回失败时，`#calendarAdminStatus` 显示错误，表单内容、当前步骤和组合项不变。

- [ ] **Step 4: 写步骤交互静态失败测试**

静态约束页面脚本包含 `setEditorStep`、`data-calendar-step`、`hidden` 面板切换，新建/编辑/套用预设均调用第一步；结构卡片同步隐藏的 `#calendarScheduleType`。静态测试只负责结构防退化，行为由前两项 vm 集成测试保证。

- [ ] **Step 5: 验证测试失败**

Run: `node --test tests/admin-calendar-page.test.js tests/admin-calendar-page-behavior.test.js`

Expected: FAIL，步骤控制尚未实现。

- [ ] **Step 6: 实现步骤导航**

新增 `setEditorStep(step)`：更新按钮 `active`、`aria-selected`、面板 `hidden` 和标题帮助文字。绑定步骤按钮、结构卡片和“新建日程”；`resetScheduleForm`、`editSchedule`、预设套用均回到 `basic`。

- [ ] **Step 7: 用模型模块接管填充和载荷转换**

新增 `readEditorState()` 与 `writeEditorState(state)`，保留现有控件 ID；`schedulePayload()` 调用 `AdminCalendarModel.editorToPayload`，`fillForm()` 调用 `scheduleToEditor`。隐藏步骤或结构切换不得重置暂存值。

- [ ] **Step 8: 保持日期和颜色即时同步**

继续绑定快速日期、持续天数、日期预览、分类色、色板、原生取色器和十六进制输入；跟随分类色时设置 `disabled` 与视觉状态，关闭时恢复手动控制。

- [ ] **Step 9: 接入生产资源并更新加载入口**

在 `admin.html` 中按 CSS → `admin-calendar-model.js?v=20260826-1` → `admin-calendar-page.js?v=20260826-5` 的顺序加载；后台现有页面路由改为调用 `window.AdminCalendarPage.load()`，同时保留 `window.loadAdminCalendar` 兼容入口。此时 Task 3 Step 1 的资源顺序红测转绿。

- [ ] **Step 10: 验证管理脚本测试通过**

Run: `node --check public/function/admin-calendar-page.js && node --test tests/admin-calendar-page.test.js tests/admin-calendar-model.test.js tests/admin-calendar-page-behavior.test.js`

Expected: PASS。

### Task 4: 将验收原型视觉接入生产主题

**Files:**
- Modify: `public/function/admin-calendar-page.css`
- Modify: `tests/admin-calendar-page.test.js`

- [ ] **Step 1: 写响应式失败测试**

断言 CSS 包含宽屏左右工作台、900px 顶部步骤栏、560px 两列步骤按钮、单列表单、底部主按钮跨列，以及至少 40px 的触控高度。

- [ ] **Step 2: 验证测试失败**

Run: `node --test tests/admin-calendar-page.test.js`

Expected: FAIL，现有 CSS 尚无验收原型的工作台规则。

- [ ] **Step 3: 实现暖色 V2 样式**

把原型的圆角、暖色层次、步骤状态、结构选择卡、预览、资料列表和响应式规则映射到后台 CSS 变量；不覆盖后台公共导航和主题。

- [ ] **Step 4: 验证样式资源版本号和测试**

确认 Task 3 锁定的 CSS 查询版本与正式 HTML 一致，运行：

`node --test tests/admin-calendar-page.test.js tests/admin-calendar-model.test.js tests/admin-calendar-page-behavior.test.js`

Expected: PASS。

### Task 5: 回归与视觉验收

**Files:**
- Modify only if tests expose defects in files already listed above.

- [ ] **Step 1: 运行语法检查**

```powershell
node --check public/function/admin-calendar-model.js
node --check public/function/admin-calendar-page.js
```

Expected: exit 0。

- [ ] **Step 2: 运行完整日历回归**

```powershell
node --test tests/admin-calendar-page.test.js tests/admin-calendar-model.test.js tests/admin-calendar-page-behavior.test.js tests/calendar-domain.test.js tests/calendar-routes.test.js tests/calendar-presets.test.js tests/calendar-store.test.js tests/calendar-server-integration.test.js tests/calendar-gantt-ui.test.js tests/home-calendar-lazy-load.test.js tests/calendar-changelog.test.js
```

Expected: 全部 PASS。

- [ ] **Step 3: 运行差异格式检查**

Run: `git diff --check`

Expected: exit 0；允许 Git 的 CRLF 提示，不允许 whitespace error。

- [ ] **Step 4: 桌面和手机视觉验收**

通过本地静态服务器打开真实 `admin.html#calendar`，使用桌面宽度和 390px 手机宽度截图。确认五步完整、无横向溢出、日期与颜色控件可见、底部操作不遮挡内容。由于静态服务器没有管理员会话，真实数据 CRUD 由自动化接口测试验证。

- [ ] **Step 5: 检查变更边界**

确认本轮没有修改服务端、数据库、公开日历或首页；保留工作区中用户已有的其他未提交修改。
