const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'public', 'function', 'wjdeyj', 'fpgj');
const expectedHashes = {
  'ai.html': '12336f94523049ca57d30e6566c967393851f8267b27ec2ba8ab22f7cd1b0f75',
  'v2.6.html': 'ff2ea1c6193e95eb99f31f2f317b4c933b5992fc7bd5b4c102c86e971e7301c4',
};

const read = (file) => fs.readFileSync(file);
const html = (file) => read(file).toString('utf8');
const hash = (file) => crypto.createHash('sha256').update(read(file)).digest('hex');

test('launcher contains only the requested title and two tool links', () => {
  const launcher = html(path.join(target, 'fpgj.html'));
  const links = [...launcher.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi)]
    .map((match) => ({ href: match[1], label: match[2].trim() }));
  assert.match(launcher, /<h1>脚本&amp;云机分配工具<\/h1>/);
  assert.deepEqual(links, [
    { href: 'v2.6.html', label: '脚本链接' },
    { href: 'ai.html', label: '云机链接' },
  ]);
  assert.doesNotMatch(launcher, /analytics-tracker\.js|备案|隐私声明|隐私政策|关于我们|用户协议|<footer\b/i);
});

test('migrated tools match the source file hashes', () => {
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
