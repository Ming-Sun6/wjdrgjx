const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function element(attributes = {}) {
  const classes = new Set();
  return {
    value: attributes.value || '',
    checked: !!attributes.checked,
    hidden: false,
    disabled: false,
    textContent: '',
    style: {},
    classList: {
      toggle(name, active) { if (active) classes.add(name); else classes.delete(name); },
      contains(name) { return classes.has(name); }
    },
    getAttribute(name) { return attributes[name] || null; },
    setAttribute(name, value) { attributes[name] = String(value); },
    querySelectorAll() { return []; }
  };
}

function loadPage(overrides = {}) {
  const fields = {
    calendarEditorHelp: element(),
    calendarScheduleCategory: element({ value: '3' }),
    calendarScheduleName: element({ value: '联盟总动员' }),
    calendarScheduleType: element({ value: 'normal' }),
    calendarDateMode: element({ value: 'range' }),
    calendarStartDate: element({ value: '2026-08-24' }),
    calendarDurationDays: element({ value: '3' }),
    calendarLegacyDates: element(),
    calendarStartTime: element({ value: '08:00' }),
    calendarEndTime: element({ value: '23:00' }),
    calendarUseCategoryColor: element({ checked: false }),
    calendarScheduleColor: element({ value: '#d89974' }),
    calendarScheduleDescription: element({ value: '三天循环活动' }),
    calendarScheduleEnabled: element({ checked: true }),
    calendarRepeatEnabled: element({ checked: true }),
    calendarRecurrenceUnit: element({ value: 'week' }),
    calendarRecurrenceInterval: element({ value: '2' }),
    calendarWeekdays: element({ value: '1,3,5' }),
    calendarMonthDay: element({ value: '24' }),
    calendarRecurrenceEndType: element({ value: 'until' }),
    calendarRecurrenceUntil: element({ value: '2027-01-31' }),
    calendarRecurrenceCount: element({ value: '12' }),
    calendarCompositeLayout: element({ value: 'gantt' }),
    ...overrides
  };
  const buttons = ['basic', 'date', 'tasks', 'style', 'presets'].map((step) => element({ 'data-calendar-step': step }));
  const panels = ['basic', 'date', 'tasks', 'style', 'presets'].map((step) => element({ 'data-calendar-panel': step }));
  const document = {
    getElementById(id) { return fields[id] || null; },
    querySelectorAll(selector) {
      if (selector === '[data-calendar-step]') return buttons;
      if (selector === '[data-calendar-panel]') return panels;
      if (selector === '#calendarCompositeItems .calendar-composite-item') return [];
      return [];
    }
  };
  const window = { AdminCalendarModel: require('../public/function/admin-calendar-model.js') };
  const context = vm.createContext({ window, document, fetch() {}, confirm() { return true; }, prompt() { return null; }, console, Date, JSON, Number, String, Array, Set, Object, Error, encodeURIComponent });
  vm.runInContext(fs.readFileSync(path.join(root, 'public/function/admin-calendar-page.js'), 'utf8'), context);
  return { page: window.AdminCalendarPage, fields, buttons, panels };
}

test('real page step controller changes panels without clearing form values', () => {
  const { page, fields, buttons, panels } = loadPage();

  page.setEditorStep('date');
  page.setEditorStep('style');

  assert.equal(fields.calendarScheduleName.value, '联盟总动员');
  assert.equal(buttons.find((button) => button.getAttribute('data-calendar-step') === 'style').classList.contains('active'), true);
  assert.equal(panels.find((panel) => panel.getAttribute('data-calendar-panel') === 'style').hidden, false);
  assert.equal(panels.find((panel) => panel.getAttribute('data-calendar-panel') === 'date').hidden, true);
});

test('real page schedulePayload maps recurring form controls through the shared model', () => {
  const { page } = loadPage();
  const payload = page.schedulePayload();

  assert.deepEqual(JSON.parse(JSON.stringify(payload)), {
    categoryId: 3,
    name: '联盟总动员',
    scheduleType: 'recurring',
    startDate: '2026-08-24',
    endDate: '2026-08-26',
    startTime: '08:00',
    endTime: '23:00',
    color: '#d89974',
    description: '三天循环活动',
    enabled: true,
    recurrenceUnit: 'week',
    recurrenceInterval: 2,
    weekdays: [1, 3, 5],
    monthDay: 24,
    recurrenceEndType: 'until',
    recurrenceUntil: '2027-01-31',
    recurrenceCount: 12
  });
});
