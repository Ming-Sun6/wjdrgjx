const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('public and admin changelogs record the calendar release separately', () => {
  const home = read('index.html');
  const admin = read('public/function/_ops/console-7a9/internal/admin.html');
  const homeEntry = home.slice(home.indexOf('<h4>V0.9.39'), home.indexOf('<h4>V0.9.38'));
  const adminStart = admin.indexOf('id="page-admin-log"');
  const adminEntry = admin.slice(admin.indexOf('V0.9.40', adminStart), admin.indexOf('V0.9.39', adminStart));

  assert.match(home, /版本 V0\.9\.39/);
  assert.match(homeEntry, /活动日历/);
  assert.match(homeEntry, /周视图/);
  assert.match(homeEntry, /月视图/);
  assert.match(homeEntry, /最近 18 个月/);
  assert.match(homeEntry, /点击后加载/);
  assert.doesNotMatch(homeEntry, /后台|管理员|管理端|接口|数据库/);

  assert.match(admin, /admin-version[^>]*>V0\.9\.43</);
  assert.match(adminEntry, /活动日历五步工作台/);
  assert.match(adminEntry, /旧日程无损编辑/);
  assert.doesNotMatch(homeEntry, /活动日历五步工作台|旧日程无损编辑/);
});
