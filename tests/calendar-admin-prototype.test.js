const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'docs', 'prototypes', 'calendar-admin-v2.html');

test('calendar admin prototype is a self-contained unconnected review artifact', () => {
  assert.equal(fs.existsSync(file), true, 'prototype HTML should exist');
  const html = fs.readFileSync(file, 'utf8');
  assert.match(html, /验收原型，未接入生产管理端/);
  for (const step of ['基本信息', '日期与重复', '组合任务', '颜色与说明', '预设']) assert.match(html, new RegExp(step));
  assert.match(html, /id="prototypeScheduleList"/);
  assert.match(html, /id="prototypePresetList"/);
  assert.match(html, /id="prototypeAddTask"/);
  assert.match(html, /<style>[\s\S]+<\/style>/);
  assert.match(html, /<script>[\s\S]+<\/script>/);
  assert.doesNotMatch(html, /\bfetch\s*\(/i);
  assert.doesNotMatch(html, /XMLHttpRequest|WebSocket/i);
  assert.doesNotMatch(html, /<form[^>]+action\s*=/i);
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=/i);
  assert.doesNotMatch(html, /\/api\/|console-7a9|admin-calendar-page|admin-dashboard/i);
});
