const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const adminHtml = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'function', '_ops', 'console-7a9', 'internal', 'admin.html'),
  'utf8'
);

test('admin sidebar uses three dropdown groups in order', () => {
  const dataAt = adminHtml.indexOf('>数据</button>');
  const siteAt = adminHtml.indexOf('>网站后台工具</button>');
  const mpAt = adminHtml.indexOf('>小程序后台工具</button>');
  assert.ok(dataAt > 0);
  assert.ok(siteAt > dataAt);
  assert.ok(mpAt > siteAt);
  assert.match(adminHtml, /data-group="data"/);
  assert.match(adminHtml, /data-group="site"/);
  assert.match(adminHtml, /data-group="mp"/);
  assert.match(adminHtml, /side-group-toggle/);
  assert.match(adminHtml, /openSideGroupForPage/);
});

test('mini-program bearpit review sits in the mini-program admin group', () => {
  const mpStart = adminHtml.indexOf('data-group="mp"');
  const mpChunk = adminHtml.slice(mpStart, adminHtml.indexOf('</aside>', mpStart));
  assert.match(mpChunk, /data-page="bearpit-templates"/);
  assert.doesNotMatch(mpChunk, /data-page="bearpit-data"/);
});
