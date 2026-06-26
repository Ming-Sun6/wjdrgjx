const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'public', 'function', 'migration-prediction.html');

function loadMigrationScriptContext() {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'migration page should contain inline script');

  const elements = new Map();
  const makeElement = (id) => ({
    id,
    value: id === 'serverInput' ? '755' : '',
    hidden: false,
    dataset: {},
    innerHTML: '',
    textContent: '',
    appendChild(child) {
      this.children = this.children || [];
      this.children.push(child);
    },
    addEventListener() {}
  });
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    createElement(tag) {
      return makeElement(tag);
    }
  };
  const context = {
    console,
    window: {},
    document
  };
  vm.createContext(context);
  vm.runInContext(script, context, { filename: 'migration-prediction.html' });
  return context;
}

test('migration prediction defaults to the first forecast whose +1 display day is still upcoming', () => {
  const context = loadMigrationScriptContext();
  const dates = ['2026-05-25', '2026-06-22', '2026-07-20'];
  const todaySerial = context.window.dateStrToSerial('2026-06-26');

  assert.equal(typeof context.window.selectDefaultForecastIndex, 'function');
  assert.equal(context.window.selectDefaultForecastIndex(dates, todaySerial), 2);
});
