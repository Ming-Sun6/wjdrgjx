const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function runNavigation(overrides = {}) {
  const listeners = {};
  const calls = [];
  const document = {
    referrer: overrides.referrer || '',
    addEventListener(type, handler, options) {
      listeners[type] = { handler, options };
    }
  };
  const location = {
    href: overrides.href || 'https://wjgl.store/function/T12Calculator.html',
    origin: 'https://wjgl.store',
    pathname: overrides.pathname || '/function/T12Calculator.html',
    assign(target) {
      calls.push(['assign', target]);
    }
  };
  const history = {
    length: overrides.historyLength ?? 2,
    back() {
      calls.push(['back']);
    }
  };
  const window = { document, location, history };
  const context = { window, document, location, history, URL };
  vm.runInNewContext(read('public/function/smart-back.js'), context);
  return { window, listeners, calls };
}

test('smart back uses browser history only for a same-origin referrer', () => {
  const sameOrigin = runNavigation({ referrer: 'https://wjgl.store/?tab=tools&toolTab=calcTools' });
  sameOrigin.window.wjdrSmartBack('/fallback');
  assert.deepEqual(sameOrigin.calls, [['back']]);

  const external = runNavigation({ referrer: 'https://weixin.qq.com/' });
  external.window.wjdrSmartBack('/fallback');
  assert.deepEqual(external.calls, [['assign', '/fallback']]);
});

test('direct-open fallback preserves the current tool category', () => {
  const calc = runNavigation({ pathname: '/function/T12Calculator.html' });
  assert.equal(calc.window.wjdrBackFallback(), '/?tab=tools&toolTab=calcTools');

  const data = runNavigation({ pathname: '/function/pet-data-query.html' });
  assert.equal(data.window.wjdrBackFallback(), '/?tab=tools&toolTab=dataQuery');

  const game = runNavigation({ pathname: '/function/aeroplane-chess/index.html' });
  assert.equal(game.window.wjdrBackFallback(), '/?tab=tools&toolTab=miniGames');

  const forum = runNavigation({ pathname: '/function/forum-post.html' });
  assert.equal(forum.window.wjdrBackFallback(), '/?tab=forum');
});

test('shared bootstrap loads smart navigation on every public page', () => {
  const tracker = read('public/function/analytics-tracker.js');
  assert.match(tracker, /ensureSmartBackScript\(\)/);
  assert.match(tracker, /\/function\/smart-back\.js/);

  const forum = read('public/function/forum-post.html');
  assert.match(forum, /id="backBtn"/);
});

test('smart navigation captures return links without hijacking unrelated controls', () => {
  const page = runNavigation({ pathname: '/function/pet-data-query.html' });
  const link = {
    textContent: '返回首页',
    getAttribute(name) {
      return name === 'href' ? '/' : '';
    }
  };
  const event = {
    button: 0,
    target: { closest(selector) { return selector === 'a' ? link : null; } },
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; }
  };
  assert.equal(page.listeners.click.options, true);
  page.listeners.click.handler(event);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.deepEqual(page.calls, [['assign', '/?tab=tools&toolTab=dataQuery']]);

  const unrelated = {
    button: 0,
    target: { closest() { return null; } },
    preventDefault() { throw new Error('unrelated control was hijacked'); },
    stopImmediatePropagation() {}
  };
  page.listeners.click.handler(unrelated);
});
