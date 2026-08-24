const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const adminPath = path.join(
  __dirname,
  '..',
  'public',
  'function',
  '_ops',
  'console-7a9',
  'internal',
  'admin.html'
);

function readAdmin() {
  return fs.readFileSync(adminPath, 'utf8');
}

test('admin sidebar exposes a tool-management page with refresh and save controls', () => {
  const html = readAdmin();

  assert.match(html, /data-page="tool-management"[^>]*data-admin-only="1"[^>]*>工具管理<\/button>/);
  assert.match(html, /<section[^>]+id="page-tool-management"[^>]+data-page="tool-management"/);
  assert.match(html, /id="toolManagementStatus"/);
  assert.match(html, /id="toolManagementGroups"/);
  assert.match(html, /id="toolManagementReloadBtn"/);
  assert.match(html, /id="toolManagementSaveBtn"[^>]*disabled/);
});

test('tool-management renders API tools by supported group with escaped values', () => {
  const html = readAdmin();
  const page = html.match(/<section[^>]+id="page-tool-management"[\s\S]*?<\/section>/)?.[0] || '';

  assert.match(html, /\['featured','core','extended','miniGames'\]/);
  assert.match(html, /Array\.isArray\(data\.tools\)\s*\?\s*data\.tools\s*:\s*\[\]/);
  assert.match(html, /escapeHtml\(tool\.name/);
  assert.match(html, /escapeAttr\(tool\.id/);
  assert.match(html, /function escapeAttr\(text\)\{[\s\S]{0,180}\.replace\(\/"\/g,'&quot;'\)/);
  assert.match(html, /class="tool-management-visible"[^>]+type="checkbox"/);
  assert.match(html, /class="tool-management-badge"/);
  assert.match(html, /<option value="none"/);
  assert.match(html, /<option value="new"/);
  assert.match(html, /<option value="hot"/);
  assert.doesNotMatch(page, /tool-management-row/);
});

test('tool-management load handles login, permission, and API failures explicitly', () => {
  const html = readAdmin();

  assert.match(html, /apiFetch\('\/api\/admin\/tool-management',\{method:'GET'\}\)/);
  assert.match(html, /if\(!authUser\)[\s\S]{0,240}请先登录管理员账号/);
  assert.match(html, /if\(!authUser\.isAdmin\)[\s\S]{0,240}仅管理员可管理工具/);
  assert.match(html, /r\.status===401[\s\S]{0,180}请先登录管理员账号/);
  assert.match(html, /r\.status===403[\s\S]{0,180}仅管理员可管理工具/);
  assert.match(html, /加载失败/);
  assert.doesNotMatch(html, /TOOL_MANAGEMENT_EXPECTED_COUNT/);
  assert.match(html, /!data\.tools\.length\s*\|\|\s*toolIds\.size!==data\.tools\.length/);
  assert.match(html, /toolManagementLoaded=false/);
  assert.match(html, /toolManagementLoaded=true/);
  assert.match(html, /saveBtn\.disabled=!!busy\s*\|\|\s*!toolManagementLoaded/);
});

test('tool-management saves API-derived rows with PUT and POST compatibility wiring', () => {
  const html = readAdmin();

  assert.match(html, /querySelectorAll\('\.tool-management-row'\)/);
  assert.match(html, /if\(!toolManagementLoaded\)[\s\S]{0,180}请先成功加载工具配置/);
  assert.match(html, /JSON\.stringify\(\{tools:tools\}\)/);
  assert.match(html, /method:'PUT'/);
  assert.match(html, /r\.status===404\s*\|\|\s*r\.status===405/);
  assert.match(html, /method:'POST'/);
  assert.match(html, /currentPage==='tool-management'[\s\S]{0,120}loadToolManagement\(\)/);
  assert.match(html, /toolManagementReloadBtn'[\s\S]{0,160}addEventListener\('click',loadToolManagement\)/);
  assert.match(html, /toolManagementSaveBtn'[\s\S]{0,160}addEventListener\('click',saveToolManagement\)/);
});
