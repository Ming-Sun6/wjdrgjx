# Cloud Device Allocation Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a two-link launcher at `/function/wjdeyj/fpgj/fpgj.html` and preserve the two source allocation tools as directly accessible static pages.

**Architecture:** Add one focused static launcher and two byte-for-byte copies of the source tool pages under Express's existing `public` static root. A Node test verifies route layout, link targets, source fidelity, exclusions, CDN dependencies, and inline JavaScript syntax without changing server routing.

**Tech Stack:** Static HTML, existing Express static middleware, Node.js built-in test/assert/fs/crypto/vm modules.

---

## File Map

- Create `public/function/wjdeyj/fpgj/fpgj.html`: launcher containing exactly two relative tool links.
- Create `public/function/wjdeyj/fpgj/ai.html`: byte-for-byte copy of `C:\Users\34502\Desktop\云机分配系统\Ai云手机分配系统.html`.
- Create `public/function/wjdeyj/fpgj/v2.6.html`: byte-for-byte copy of `C:\Users\34502\Desktop\云机分配系统\V2.6最强冬日卡密分配工具.html`.
- Create `tests/cloud-device-allocation-migration.test.js`: automated migration and static-page contract checks.

### Task 1: Add the migration contract test

**Files:**
- Create: `tests/cloud-device-allocation-migration.test.js`

- [ ] **Step 1: Write the failing test**

Use `node:test` to assert all of the following:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'public', 'function', 'wjdeyj', 'fpgj');
const read = (file) => fs.readFileSync(file);
const hash = (file) => crypto.createHash('sha256').update(read(file)).digest('hex');
const html = (file) => read(file).toString('utf8');
const expectedHashes = {
  'ai.html': '12336f94523049ca57d30e6566c967393851f8267b27ec2ba8ab22f7cd1b0f75',
  'v2.6.html': 'ff2ea1c6193e95eb99f31f2f317b4c933b5992fc7bd5b4c102c86e971e7301c4',
};

test('launcher exposes exactly the two migrated tools', () => {
  const launcher = html(path.join(target, 'fpgj.html'));
  const hrefs = [...launcher.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)]
    .map((match) => match[1]);
  assert.deepEqual(hrefs, ['ai.html', 'v2.6.html']);
});

test('migrated tools are byte-for-byte copies of their sources', () => {
  for (const [name, expected] of Object.entries(expectedHashes)) {
    assert.equal(hash(path.join(target, name)), expected);
  }
});

test('duplicate and iframe aggregate pages are excluded', () => {
  assert.deepEqual(fs.readdirSync(target).sort(), ['ai.html', 'fpgj.html', 'v2.6.html']);
});

test('tool dependencies and inline JavaScript remain valid', () => {
  for (const name of ['ai.html', 'v2.6.html']) {
    const page = html(path.join(target, name));
    assert.match(page, /cdn\.tailwindcss\.com/);
    assert.match(page, /xlsx(?:\.full)?\.min\.js/);
    for (const match of page.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
      assert.doesNotThrow(() => new vm.Script(match[1], { filename: name }));
    }
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/cloud-device-allocation-migration.test.js`

Expected: FAIL because `public/function/wjdeyj/fpgj/fpgj.html` and the migrated tools do not exist.

- [ ] **Step 3: Commit the failing test**

```powershell
git add -- tests/cloud-device-allocation-migration.test.js
git commit -m "test: define cloud allocation migration contract"
```

### Task 2: Migrate the two tools and add the launcher

**Files:**
- Create: `public/function/wjdeyj/fpgj/fpgj.html`
- Create: `public/function/wjdeyj/fpgj/ai.html`
- Create: `public/function/wjdeyj/fpgj/v2.6.html`

- [ ] **Step 1: Copy the source tools without transforming their bytes**

Create the target directory, then copy `Ai云手机分配系统.html` to `ai.html` and `V2.6最强冬日卡密分配工具.html` to `v2.6.html`. Do not copy the duplicate or `合并网站.html`.

- [ ] **Step 2: Record source and destination SHA-256 values**

Run `Get-FileHash -Algorithm SHA256` for both source/destination pairs. Confirm the values also match the portable constants recorded in the test:

- `ai.html`: `12336F94523049CA57D30E6566C967393851F8267B27EC2BA8AB22F7CD1B0F75`
- `v2.6.html`: `FF2EA1C6193E95EB99F31F2F317B4C933B5992FC7BD5B4C102C86E971E7301C4`

Expected: each destination hash exactly matches its corresponding source hash.

- [ ] **Step 3: Create the launcher**

Create a UTF-8 static HTML page titled `云机分配工具` with exactly two `<a>` elements in this order:

```html
<a href="ai.html">AI云手机分配系统</a>
<a href="v2.6.html">最强冬日卡密分配工具</a>
```

Use responsive, self-contained CSS only. Do not use JavaScript, iframe, new-tab behavior, or additional navigation links.

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/cloud-device-allocation-migration.test.js`

Expected: 4 tests pass, 0 fail.

- [ ] **Step 5: Commit the migrated pages**

```powershell
git add -- public/function/wjdeyj/fpgj
git commit -m "feat: add cloud allocation tool launcher"
```

### Task 3: Verify the published static behavior

**Files:**
- Verify: `public/function/wjdeyj/fpgj/fpgj.html`
- Verify: `public/function/wjdeyj/fpgj/ai.html`
- Verify: `public/function/wjdeyj/fpgj/v2.6.html`

- [ ] **Step 1: Run repository and focused checks**

Run:

```powershell
node --test tests/*.test.js
git diff --check
git status --short
```

Expected: all tests pass, no whitespace errors, and no uncommitted implementation files.

- [ ] **Step 2: Start the existing server and check static URLs**

Start the existing server with `node server.js`, then request:

```text
http://localhost:3000/function/wjdeyj/fpgj/fpgj.html
http://localhost:3000/function/wjdeyj/fpgj/ai.html
http://localhost:3000/function/wjdeyj/fpgj/v2.6.html
```

Expected: HTTP 200 and HTML content for all three URLs. Stop the server with Ctrl+C after the checks.

- [ ] **Step 3: Perform browser smoke checks**

Open the launcher at desktop and mobile widths. Confirm each entry navigates in the current tab to the correct tool. In each tool, import a small valid Excel workbook and exercise its available export/download action; confirm no new console error or failed download is introduced by the migrated path.

- [ ] **Step 4: Report deployment boundary**

Confirm that local repository integration is complete. Do not claim the public `wjgl.store` URL is live unless these committed files have also been deployed to the production host/CDN and checked there.
