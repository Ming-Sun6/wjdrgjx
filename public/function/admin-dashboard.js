(function (root, factory) {
  var api = factory(root || {});
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.adminDashboard = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  var hasDom = !!(root && root.document);
  var state = {
    initialized: false,
    mode: 'realtime',
    dashboardTime: null,
    autoRefresh: true,
    refreshMs: 15000,
    timer: 0
  };

  var TIME_GROUP_DEFAULTS = {
    realtime: 'rt_15s',
    recent: 'recent_6h',
    day: 'day_today',
    week: 'week_this',
    month: 'month_this',
    year: function (now) {
      var current = now instanceof Date ? now : new Date();
      return 'year_' + current.getFullYear();
    }
  };

  var REALTIME_REFRESH_MAP = {
    rt_1s: 1000,
    rt_15s: 15000,
    rt_1m: 60000
  };

  var TIME_GROUP_OPTIONS = [
    { value: 'realtime', label: '\u5b9e\u65f6' },
    { value: 'recent', label: '\u8fd1\u671f' },
    { value: 'day', label: '\u4eca\u5929' },
    { value: 'week', label: '\u672c\u5468' },
    { value: 'month', label: '\u672c\u6708' },
    { value: 'year', label: '\u4eca\u5e74' }
  ];

  function resolveDefaultPreset(group, now) {
    var value = TIME_GROUP_DEFAULTS[group] || TIME_GROUP_DEFAULTS.realtime;
    return typeof value === 'function' ? value(now) : value;
  }

  function createDefaultDashboardTimeState(now) {
    return {
      timeGroup: 'realtime',
      timePreset: resolveDefaultPreset('realtime', now),
      customValue: '',
      autoRefresh: true,
      refreshMs: REALTIME_REFRESH_MAP.rt_15s
    };
  }

  function applyTimeGroup(dashboardTimeState, group, now) {
    var nextGroup = String(group || 'realtime');
    var nextPreset = resolveDefaultPreset(nextGroup, now);
    return {
      timeGroup: nextGroup,
      timePreset: nextPreset,
      customValue: '',
      autoRefresh: nextGroup === 'realtime',
      refreshMs: nextGroup === 'realtime'
        ? (REALTIME_REFRESH_MAP[nextPreset] || 15000)
        : 0
    };
  }

  function applyTimePreset(dashboardTimeState, preset) {
    var current = dashboardTimeState || createDefaultDashboardTimeState(new Date());
    var nextPreset = String(preset || current.timePreset || '');
    var nextState = {
      timeGroup: current.timeGroup,
      timePreset: nextPreset,
      customValue: current.customValue || '',
      autoRefresh: current.timeGroup === 'realtime' ? !!current.autoRefresh : false,
      refreshMs: current.timeGroup === 'realtime'
        ? (REALTIME_REFRESH_MAP[nextPreset] || current.refreshMs || 15000)
        : 0
    };
    if (getVisibleCustomInput(nextState) === null) {
      nextState.customValue = '';
    }
    return nextState;
  }

  function getVisibleCustomInput(dashboardTimeState) {
    var preset = String((dashboardTimeState && dashboardTimeState.timePreset) || '');
    if (preset === 'day_custom') return 'day';
    if (preset === 'week_custom') return 'week';
    if (preset === 'month_custom') return 'month';
    return null;
  }

  function buildRecentPreset(hours) {
    return {
      value: 'recent_' + hours + 'h',
      label: hours + '\u5c0f\u65f6'
    };
  }

  function buildYearPresetOptions(now) {
    var current = now instanceof Date ? now : new Date();
    var currentYear = current.getFullYear();
    var options = [];
    for (var year = currentYear; year >= currentYear - 6; year -= 1) {
      options.push({
        value: 'year_' + year,
        label: year + '\u5e74'
      });
    }
    return options;
  }

  function getPresetOptions(group, now) {
    switch (String(group || '')) {
      case 'realtime':
        return [
          { value: 'rt_1s', label: '\u6bcf\u79d2\u5237\u65b0' },
          { value: 'rt_15s', label: '\u6bcf15\u79d2\u5237\u65b0' },
          { value: 'rt_1m', label: '\u6bcf1\u5206\u949f\u5237\u65b0' }
        ];
      case 'recent':
        return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(buildRecentPreset);
      case 'day':
        return [
          { value: 'day_today', label: '\u4eca\u5929' },
          { value: 'day_yesterday', label: '\u6628\u5929' },
          { value: 'day_before_yesterday', label: '\u524d\u5929' },
          { value: 'day_custom', label: '\u81ea\u5b9a\u4e49\u5929' }
        ];
      case 'week':
        return [
          { value: 'week_this', label: '\u672c\u5468' },
          { value: 'week_last', label: '\u4e0a\u5468' },
          { value: 'week_last_2', label: '\u4e0a\u4e0a\u5468' },
          { value: 'week_custom', label: '\u81ea\u5b9a\u4e49\u5468' }
        ];
      case 'month':
        return [
          { value: 'month_this', label: '\u672c\u6708' },
          { value: 'month_last', label: '\u4e0a\u4e2a\u6708' },
          { value: 'month_last_2', label: '\u4e0a\u4e0a\u4e2a\u6708' },
          { value: 'month_custom', label: '\u81ea\u5b9a\u4e49\u6708' }
        ];
      case 'year':
        return buildYearPresetOptions(now);
      default:
        return [];
    }
  }

  function syncLegacyTimeState() {
    if (!state.dashboardTime) state.dashboardTime = createDefaultDashboardTimeState(new Date());
    state.mode = state.dashboardTime.timeGroup;
    state.autoRefresh = !!state.dashboardTime.autoRefresh;
    state.refreshMs = Number(state.dashboardTime.refreshMs || 0);
  }

  syncLegacyTimeState();

  function buildDashboardTimeQuery(dashboardTimeState) {
    var value = dashboardTimeState || {};
    return {
      group: String(value.timeGroup || 'realtime'),
      preset: String(value.timePreset || 'rt_15s'),
      value: String(value.customValue || ''),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
    };
  }

  function buildActiveTimeLabel(dashboardTimeState) {
    var current = dashboardTimeState || {};
    var preset = String(current.timePreset || '');
    if (current.timeGroup === 'realtime') {
      if (preset === 'rt_1s') return '\u5b9e\u65f6 \u00b7 \u6bcf\u79d2\u5237\u65b0';
      if (preset === 'rt_1m') return '\u5b9e\u65f6 \u00b7 \u6bcf1\u5206\u949f\u5237\u65b0';
      return '\u5b9e\u65f6 \u00b7 \u6bcf15\u79d2\u5237\u65b0';
    }
    if (current.timeGroup === 'recent') {
      var hours = String(preset).replace(/[^\d]/g, '') || '6';
      return '\u8fd1\u671f \u00b7 \u6700\u8fd1' + hours + '\u5c0f\u65f6';
    }
    if (current.timeGroup === 'day') {
      if (preset === 'day_today') return '\u4eca\u5929 \u00b7 \u4eca\u5929';
      if (preset === 'day_yesterday') return '\u4eca\u5929 \u00b7 \u6628\u5929';
      if (preset === 'day_before_yesterday') return '\u4eca\u5929 \u00b7 \u524d\u5929';
      return '\u4eca\u5929 \u00b7 ' + String(current.customValue || '\u81ea\u5b9a\u4e49');
    }
    if (current.timeGroup === 'week') {
      if (preset === 'week_this') return '\u672c\u5468 \u00b7 \u672c\u5468';
      if (preset === 'week_last') return '\u672c\u5468 \u00b7 \u4e0a\u5468';
      if (preset === 'week_last_2') return '\u672c\u5468 \u00b7 \u4e0a\u4e0a\u5468';
      return '\u672c\u5468 \u00b7 ' + String(current.customValue || '\u81ea\u5b9a\u4e49');
    }
    if (current.timeGroup === 'month') {
      if (preset === 'month_this') return '\u672c\u6708 \u00b7 \u672c\u6708';
      if (preset === 'month_last') return '\u672c\u6708 \u00b7 \u4e0a\u4e2a\u6708';
      if (preset === 'month_last_2') return '\u672c\u6708 \u00b7 \u4e0a\u4e0a\u4e2a\u6708';
      return '\u672c\u6708 \u00b7 ' + String(current.customValue || '\u81ea\u5b9a\u4e49');
    }
    if (current.timeGroup === 'year') {
      var year = String(preset).replace('year_', '') || String(new Date().getFullYear());
      return '\u4eca\u5e74 \u00b7 ' + year + '\u5e74';
    }
    return '\u5b9e\u65f6';
  }

  function getLayoutApi() {
    return root.adminDashboardLayout || {};
  }

  function getSignalApi() {
    return root.adminDashboardSignals || {};
  }

  function getEl(id) {
    return hasDom ? root.document.getElementById(id) : null;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clearTimer() {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = 0;
    }
  }

  function toIso(value) {
    if (!value) return '';
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }

  function toLocalInputValue(date) {
    var d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return [
      d.getFullYear(),
      '-',
      pad(d.getMonth() + 1),
      '-',
      pad(d.getDate()),
      'T',
      pad(d.getHours()),
      ':',
      pad(d.getMinutes())
    ].join('');
  }

  function formatDateInputValue(date) {
    var d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }

  function formatMonthInputValue(date) {
    var d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function formatWeekInputValue(date) {
    var d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    var local = new Date(d.getTime());
    var day = local.getDay() || 7;
    local.setDate(local.getDate() + 4 - day);
    var yearStart = new Date(local.getFullYear(), 0, 1);
    var week = Math.ceil((((local - yearStart) / 86400000) + 1) / 7);
    return local.getFullYear() + '-W' + String(week).padStart(2, '0');
  }

  function setDefaultCustomValue(dashboardTimeState, now) {
    var next = dashboardTimeState;
    var visible = getVisibleCustomInput(next);
    var current = now instanceof Date ? now : new Date();
    if (!visible || next.customValue) return next;
    if (visible === 'day') next.customValue = formatDateInputValue(current);
    if (visible === 'week') next.customValue = formatWeekInputValue(current);
    if (visible === 'month') next.customValue = formatMonthInputValue(current);
    return next;
  }

  function populateSelectOptions(select, options, selectedValue) {
    if (!select) return;
    select.innerHTML = (options || []).map(function (option) {
      var value = String(option.value);
      var selected = value === String(selectedValue || '') ? ' selected' : '';
      return '<option value="' + escapeHtml(value) + '"' + selected + '>' + escapeHtml(option.label) + '</option>';
    }).join('');
  }

  function syncControlVisibility() {
    var currentState = state.dashboardTime || createDefaultDashboardTimeState(new Date());
    var visible = getVisibleCustomInput(currentState);
    var dayWrap = getEl('dashboardCustomDayWrap');
    var weekWrap = getEl('dashboardCustomWeekWrap');
    var monthWrap = getEl('dashboardCustomMonthWrap');
    var autoRefresh = getEl('dashboardAutoRefresh');
    if (dayWrap) dayWrap.classList.toggle('dashboard-hidden', visible !== 'day');
    if (weekWrap) weekWrap.classList.toggle('dashboard-hidden', visible !== 'week');
    if (monthWrap) monthWrap.classList.toggle('dashboard-hidden', visible !== 'month');
    if (autoRefresh) {
      autoRefresh.disabled = currentState.timeGroup !== 'realtime';
      autoRefresh.checked = currentState.timeGroup === 'realtime' ? !!currentState.autoRefresh : false;
    }
  }

  function syncCustomInputValues() {
    var currentState = state.dashboardTime || createDefaultDashboardTimeState(new Date());
    var dayInput = getEl('dashboardCustomDay');
    var weekInput = getEl('dashboardCustomWeek');
    var monthInput = getEl('dashboardCustomMonth');
    if (dayInput) dayInput.value = getVisibleCustomInput(currentState) === 'day' ? String(currentState.customValue || '') : '';
    if (weekInput) weekInput.value = getVisibleCustomInput(currentState) === 'week' ? String(currentState.customValue || '') : '';
    if (monthInput) monthInput.value = getVisibleCustomInput(currentState) === 'month' ? String(currentState.customValue || '') : '';
  }

  function syncTimeControls() {
    var currentState = state.dashboardTime || createDefaultDashboardTimeState(new Date());
    var groupSelect = getEl('dashboardTimeGroup');
    var presetSelect = getEl('dashboardTimePreset');
    populateSelectOptions(groupSelect, TIME_GROUP_OPTIONS, currentState.timeGroup);
    populateSelectOptions(presetSelect, getPresetOptions(currentState.timeGroup, new Date()), currentState.timePreset);
    syncControlVisibility();
    syncCustomInputValues();
  }

  function getRealtimeLegacyWindow(preset) {
    if (preset === 'rt_1m') return 60 * 60 * 1000;
    if (preset === 'rt_1s') return 15 * 60 * 1000;
    return 60 * 60 * 1000;
  }

  function parseCustomDateValue(value) {
    if (!value) return null;
    var date = new Date(value + 'T00:00:00');
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function startOfWeek(date) {
    var current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var day = current.getDay() || 7;
    current.setDate(current.getDate() - day + 1);
    current.setHours(0, 0, 0, 0);
    return current;
  }

  function parseCustomWeekValue(value) {
    var match = String(value || '').match(/^(\d{4})-W(\d{2})$/);
    if (!match) return null;
    var year = Number(match[1]);
    var week = Number(match[2]);
    var simple = new Date(year, 0, 1 + ((week - 1) * 7));
    var dow = simple.getDay() || 7;
    if (dow <= 4) simple.setDate(simple.getDate() - dow + 1);
    else simple.setDate(simple.getDate() + 8 - dow);
    simple.setHours(0, 0, 0, 0);
    return simple;
  }

  function parseCustomMonthValue(value) {
    var match = String(value || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, 1, 0, 0, 0, 0);
  }

  function buildLegacyQueryFromTimeState(dashboardTimeState, now) {
    var current = dashboardTimeState || createDefaultDashboardTimeState(now);
    var reference = now instanceof Date ? new Date(now.getTime()) : new Date();
    var start;
    var end;
    if (current.timeGroup === 'realtime') {
      end = reference;
      start = new Date(reference.getTime() - getRealtimeLegacyWindow(current.timePreset));
      return { mode: 'realtime', start: start.toISOString(), end: end.toISOString() };
    }
    if (current.timeGroup === 'recent') {
      var hours = Number(String(current.timePreset || '').replace(/[^\d]/g, '') || 6);
      end = reference;
      start = new Date(reference.getTime() - (hours * 60 * 60 * 1000));
      return { mode: 'custom', start: start.toISOString(), end: end.toISOString() };
    }
    if (current.timeGroup === 'day') {
      if (current.timePreset === 'day_today') start = parseCustomDateValue(formatDateInputValue(reference));
      else if (current.timePreset === 'day_yesterday') start = parseCustomDateValue(formatDateInputValue(new Date(reference.getTime() - 86400000)));
      else if (current.timePreset === 'day_before_yesterday') start = parseCustomDateValue(formatDateInputValue(new Date(reference.getTime() - (2 * 86400000))));
      else start = parseCustomDateValue(current.customValue);
      if (start) {
        end = new Date(start.getTime());
        end.setHours(23, 59, 59, 999);
        return { mode: 'custom', start: start.toISOString(), end: end.toISOString() };
      }
    }
    if (current.timeGroup === 'week') {
      if (current.timePreset === 'week_this') start = startOfWeek(reference);
      else if (current.timePreset === 'week_last') start = new Date(startOfWeek(reference).getTime() - (7 * 86400000));
      else if (current.timePreset === 'week_last_2') start = new Date(startOfWeek(reference).getTime() - (14 * 86400000));
      else start = parseCustomWeekValue(current.customValue);
      if (start) {
        end = new Date(start.getTime() + (7 * 86400000) - 1);
        return { mode: 'custom', start: start.toISOString(), end: end.toISOString() };
      }
    }
    if (current.timeGroup === 'month') {
      if (current.timePreset === 'month_this') start = new Date(reference.getFullYear(), reference.getMonth(), 1);
      else if (current.timePreset === 'month_last') start = new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
      else if (current.timePreset === 'month_last_2') start = new Date(reference.getFullYear(), reference.getMonth() - 2, 1);
      else start = parseCustomMonthValue(current.customValue);
      if (start) {
        end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
        return { mode: 'custom', start: start.toISOString(), end: end.toISOString() };
      }
    }
    if (current.timeGroup === 'year') {
      var year = Number(String(current.timePreset || '').replace('year_', '') || reference.getFullYear());
      start = new Date(year, 0, 1, 0, 0, 0, 0);
      end = new Date(year, 11, 31, 23, 59, 59, 999);
      return { mode: 'month', start: start.toISOString(), end: end.toISOString() };
    }
    return { mode: 'realtime' };
  }

  function buildQueryString() {
    var params = new URLSearchParams();
    var currentState = state.dashboardTime || createDefaultDashboardTimeState(new Date());
    var modernQuery = buildDashboardTimeQuery(currentState);
    var legacyQuery = buildLegacyQueryFromTimeState(currentState, new Date());
    params.set('group', modernQuery.group);
    params.set('preset', modernQuery.preset);
    params.set('timezone', modernQuery.timezone);
    if (modernQuery.value) params.set('value', modernQuery.value);
    params.set('mode', legacyQuery.mode);
    if (legacyQuery.start) params.set('start', legacyQuery.start);
    if (legacyQuery.end) params.set('end', legacyQuery.end);
    syncLegacyTimeState();
    return params.toString();
  }

  async function apiGet(url) {
    var response = await root.apiFetch(url, { method: 'GET' });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || String(response.status));
    return data;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('zh-CN').format(Number(value || 0));
  }

  function modeLabel(mode) {
    var map = {
      realtime: '\u5b9e\u65f6',
      recent: '\u8fd1\u671f',
      day: '\u6309\u5929',
      week: '\u6309\u5468',
      custom: '\u81ea\u5b9a\u4e49\u65f6\u95f4',
      custom_avg: '\u81ea\u5b9a\u4e49\u65f6\u95f4\u5e73\u5747',
      month: '\u6309\u6708',
      year: '\u6309\u5e74'
    };
    return map[String(mode || '')] || '\u5b9e\u65f6';
  }

  function modeDescription(mode) {
    var map = {
      realtime: '\u6301\u7eed\u89c2\u5bdf\u5f53\u524d\u8bbf\u95ee\u4e0e\u6cbb\u7406\u4fe1\u53f7',
      recent: '\u6309\u6eda\u52a8\u65f6\u95f4\u7a97\u89c2\u5bdf\u8fd1\u671f\u53d8\u5316',
      day: '\u6309\u5929\u89c2\u5bdf\u8fd1\u671f\u8fd0\u8425\u8d8b\u52bf',
      week: '\u6309\u81ea\u7136\u5468\u89c2\u5bdf\u8fd0\u8425\u8d8b\u52bf',
      custom: '\u805a\u7126\u9009\u5b9a\u65f6\u95f4\u8303\u56f4\u7684\u5b8c\u6574\u6570\u636e',
      custom_avg: '\u4ee5\u5e73\u5747\u89c6\u89d2\u89c2\u5bdf\u9009\u5b9a\u65f6\u95f4\u6bb5',
      month: '\u6309\u6708\u67e5\u770b\u4e2d\u671f\u8fd0\u8425\u8282\u594f',
      year: '\u6309\u5e74\u89c2\u5bdf\u957f\u671f\u8fd0\u8425\u53d8\u5316'
    };
    return map[String(mode || '')] || '\u6301\u7eed\u89c2\u5bdf\u5f53\u524d\u8bbf\u95ee\u4e0e\u6cbb\u7406\u4fe1\u53f7';
  }

  function formatBucketLabel(bucket) {
    var text = String(bucket || '');
    if (!text) return '-';
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return text.slice(5, 16);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.slice(5);
    return text;
  }

  function formatScopeLabel(value) {
    var key = String(value || '').trim();
    if (!key) return '\u672a\u77e5';
    var mapping = {
      rukou: '\u5165\u53e3\u9996\u9875',
      'function/admin': '\u540e\u53f0\u7ba1\u7406',
      'function/forum': '\u8bba\u575b',
      'function/calendar': '\u6d3b\u52a8\u65e5\u5386',
      'function/duihuan': '\u5151\u6362\u4e2d\u5fc3',
      'function/jisuan': '\u8ba1\u7b97\u5de5\u5177'
    };
    if (mapping[key]) return mapping[key];
    if (key.indexOf('function/') === 0) return '\u529f\u80fd / ' + key.slice('function/'.length);
    if (key.indexOf('admin/') === 0) return '\u540e\u53f0 / ' + key.slice('admin/'.length);
    return key.replace(/\//g, ' / ');
  }

  function splitKpis(summary) {
    var layoutApi = getLayoutApi();
    if (layoutApi.splitKpisForDashboard) return layoutApi.splitKpisForDashboard(summary || {});
    return { hero: [], support: [] };
  }

  function trendMeta() {
    var layoutApi = getLayoutApi();
    return layoutApi.buildTrendPanelMeta ? layoutApi.buildTrendPanelMeta() : { primary: {}, secondary: [] };
  }

  function rankingMeta() {
    var layoutApi = getLayoutApi();
    return layoutApi.buildRankingPanelMeta ? layoutApi.buildRankingPanelMeta() : { rankings: [], status: {} };
  }

  function commandDeckMeta() {
    var layoutApi = getLayoutApi();
    return layoutApi.buildCommandDeckMeta ? layoutApi.buildCommandDeckMeta() : {
      emptySummary: '\u5f53\u524d\u6682\u65e0\u663e\u8457\u5f02\u5e38',
      supportGroups: [],
      actions: []
    };
  }

  function sumByKey(rows, key) {
    return (rows || []).reduce(function (acc, row) {
      return acc + Number(row[key] || 0);
    }, 0);
  }

  function maxByKeys(rows, keys) {
    var max = 0;
    (rows || []).forEach(function (row) {
      (keys || []).forEach(function (key) {
        max = Math.max(max, Number(row[key] || 0));
      });
    });
    return max > 0 ? max : 1;
  }

  function buildSupportGroups(summary, split) {
    var meta = commandDeckMeta();
    return (meta.supportGroups || []).map(function (group) {
      var metrics = (split.support || []).filter(function (item) {
        return group.keys.indexOf(item.key) !== -1;
      });
      return {
        key: group.key,
        title: group.title,
        metrics: metrics,
        total: metrics.reduce(function (acc, item) { return acc + Number(item.value || 0); }, 0),
        summary: metrics.map(function (item) {
          return item.label + ' ' + formatNumber(item.value || 0);
        }).join(' / ')
      };
    });
  }

  function renderHeroBand(summary) {
    var heroHost = getEl('dashboardHeroGrid');
    var supportHost = getEl('dashboardSupportGrid');
    if (!heroHost || !supportHost) return;

    var split = splitKpis(summary || {});
    var heroMax = maxByKeys(split.hero, ['value']);
    var supportGroups = buildSupportGroups(summary, split);

    heroHost.innerHTML = split.hero.map(function (item) {
      var width = Math.max(22, Math.round((Number(item.value || 0) / heroMax) * 100));
      var summaryCopy = item.key === 'pv'
        ? '\u89c2\u5bdf\u6574\u4f53\u8bbf\u95ee\u52a8\u80fd\u662f\u5426\u62ac\u5347'
        : '\u89c2\u5bdf\u72ec\u7acb\u8bbf\u5ba2\u662f\u5426\u540c\u6b65\u589e\u957f';
      return '' +
        '<article class="dashboard-card-shell dashboard-hero-card ' + escapeHtml(item.tone || '') + '">' +
          '<div>' +
            '<div class="dashboard-card-label">' + escapeHtml(item.label) + '</div>' +
            '<div class="dashboard-card-value">' + escapeHtml(formatNumber(item.value || 0)) + '</div>' +
          '</div>' +
          '<div>' +
            '<div class="dashboard-card-summary">' + escapeHtml(summaryCopy) + '</div>' +
            '<div class="dashboard-card-line" style="margin-top:10px;"><span style="--line-width:' + width + '%;"></span></div>' +
          '</div>' +
        '</article>';
    }).join('');

    supportHost.innerHTML = supportGroups.map(function (group) {
      return '' +
        '<article class="dashboard-card-shell dashboard-support-card dashboard-support-group">' +
          '<div class="dashboard-card-label">' + escapeHtml(group.title) + '</div>' +
          '<div class="dashboard-card-value">' + escapeHtml(formatNumber(group.total || 0)) + '</div>' +
          '<div class="dashboard-support-details">' +
            group.metrics.map(function (item) {
              return '' +
                '<div class="dashboard-support-metric">' +
                  '<span>' + escapeHtml(item.label) + '</span>' +
                  '<strong>' + escapeHtml(formatNumber(item.value || 0)) + '</strong>' +
                '</div>';
            }).join('') +
          '</div>' +
          '<div class="dashboard-card-summary">' + escapeHtml(group.summary) + '</div>' +
        '</article>';
    }).join('');
  }

  function buildLegend(configs) {
    return '<div class="dashboard-signal-legend">' + configs.map(function (config) {
      return '' +
        '<div class="dashboard-signal-chip">' +
          '<span class="dashboard-signal-dot dashboard-signal-dot-' + escapeHtml(config.tone) + '" style="background:' + escapeHtml(config.color) + ';"></span>' +
          '<span>' + escapeHtml(config.label) + '</span>' +
        '</div>';
    }).join('') + '</div>';
  }

  function renderLineTrend(hostId, rows, configs, emptyText, maxCells) {
    var host = getEl(hostId);
    if (!host) return;
    var list = (rows || []).slice(-(maxCells || 12));
    if (!list.length) {
      host.innerHTML = '<div class="dashboard-empty">' + escapeHtml(emptyText || '\u6682\u65e0\u6570\u636e') + '</div>';
      return;
    }

    var width = 640;
    var height = 220;
    var padL = 38;
    var padR = 18;
    var padT = 14;
    var padB = 34;
    var plotW = width - padL - padR;
    var plotH = height - padT - padB;
    var max = maxByKeys(list, configs.map(function (config) { return config.key; }));

    function xAt(i) {
      if (list.length <= 1) return padL + plotW / 2;
      return padL + (i / (list.length - 1)) * plotW;
    }
    function yAt(v) {
      var value = Number(v || 0);
      var ratio = value / max;
      return padT + (1 - ratio) * plotH;
    }

    function buildPath(key) {
      var d = '';
      list.forEach(function (row, i) {
        var x = xAt(i);
        var y = yAt(row[key]);
        d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
      });
      return d.trim();
    }

    var yTicks = 4;
    var grid = [];
    for (var t = 0; t <= yTicks; t += 1) {
      var y = padT + (t / yTicks) * plotH;
      var value = Math.round((1 - t / yTicks) * max);
      grid.push(
        '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (padL + plotW) + '" y2="' + y.toFixed(1) + '" stroke="rgba(148,163,184,.18)" stroke-width="1" />' +
        '<text x="' + (padL - 10) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" fill="rgba(148,163,184,.9)" font-size="11">' + escapeHtml(formatNumber(value)) + '</text>'
      );
    }

    var series = configs.map(function (config) {
      var path = buildPath(config.key);
      var points = list.map(function (row, i) {
        var x = xAt(i);
        var y = yAt(row[config.key]);
        var label = formatBucketLabel(row.bucket);
        var val = formatNumber(row[config.key] || 0);
        return '' +
          '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.4" fill="' + escapeHtml(config.color) + '">' +
            '<title>' + escapeHtml(label + '  ' + config.short + ' ' + val) + '</title>' +
          '</circle>';
      }).join('');
      return '' +
        '<path d="' + escapeHtml(path) + '" fill="none" stroke="' + escapeHtml(config.color) + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />' +
        points;
    }).join('');

    var maxXTicks = 6;
    var step = Math.max(1, Math.ceil(list.length / maxXTicks));
    var xLabels = list.map(function (row, i) {
      var isEdge = i === 0 || i === list.length - 1;
      if (!isEdge && (i % step) !== 0) return '';
      var labelFull = formatBucketLabel(row.bucket);
      var label = labelFull.indexOf(' ') >= 0 ? labelFull.split(' ')[1] : labelFull;
      var x = xAt(i);
      return '<text x="' + x.toFixed(1) + '" y="' + (padT + plotH + 22) + '" text-anchor="middle" fill="rgba(148,163,184,.9)" font-size="11">' + escapeHtml(label) + '</text>';
    }).join('');

    host.innerHTML = '' +
      '<div class="dashboard-signal-chart">' +
        buildLegend(configs) +
        '<div style="margin-top:10px;border:1px solid rgba(148,163,184,.16);border-radius:14px;background:rgba(15,23,42,.28);padding:10px;overflow:hidden;">' +
          '<svg viewBox="0 0 ' + width + ' ' + height + '" width="100%" height="auto" role="img" aria-label="趋势折线图">' +
            '<rect x="0" y="0" width="' + width + '" height="' + height + '" fill="transparent" />' +
            grid.join('') +
            series +
            xLabels +
          '</svg>' +
          '<div style="margin-top:8px;color:rgba(148,163,184,.95);font-size:12px;line-height:1.5;">\u63d0\u793a\uff1a\u9f20\u6807\u60ac\u505c\u5728\u70b9\u4f4d\u53ef\u67e5\u770b\u5177\u4f53 PV/UV</div>' +
        '</div>' +
      '</div>';
  }

  function renderSignalChart(hostId, rows, configs, emptyText, maxCells) {
    var host = getEl(hostId);
    if (!host) return;
    var list = (rows || []).slice(-(maxCells || 12));
    if (!list.length) {
      host.innerHTML = '<div class="dashboard-empty">' + escapeHtml(emptyText || '\u6682\u65e0\u6570\u636e') + '</div>';
      return;
    }
    var max = maxByKeys(list, configs.map(function (config) { return config.key; }));
    host.innerHTML = '' +
      '<div class="dashboard-signal-chart">' +
        buildLegend(configs) +
        '<div class="dashboard-signal-grid">' +
          list.map(function (row) {
            return '' +
              '<div class="dashboard-signal-cell">' +
                '<div class="dashboard-signal-stack">' +
                  configs.map(function (config) {
                    var height = Math.max(10, Math.round((Number(row[config.key] || 0) / max) * 100));
                    return '<div class="dashboard-signal-bar ' + escapeHtml(config.tone) + '" style="height:' + height + '%;"></div>';
                  }).join('') +
                '</div>' +
                '<div class="dashboard-signal-caption">' +
                  '<div class="dashboard-signal-label">' + escapeHtml(formatBucketLabel(row.bucket)) + '</div>' +
                  '<div class="dashboard-signal-values">' +
                    configs.map(function (config) {
                      return escapeHtml(config.short + ' ' + formatNumber(row[config.key] || 0));
                    }).join(' / ') +
                  '</div>' +
                '</div>' +
              '</div>';
          }).join('') +
        '</div>' +
      '</div>';
  }

  function renderRankings(rankings) {
    var meta = rankingMeta();
    var panels = [
      { hostId: 'dashboardTopPages', rows: rankings.topPages || [], valueKey: 'pv', meta: meta.rankings[0] || {} },
      { hostId: 'dashboardTopFunctions', rows: rankings.topFunctionPages || [], valueKey: 'pv', meta: meta.rankings[1] || {} },
      { hostId: 'dashboardTopApis', rows: rankings.topApis || [], valueKey: 'hits', meta: meta.rankings[2] || {} }
    ];

    panels.forEach(function (panel) {
      var host = getEl(panel.hostId);
      if (!host) return;
      var rows = Array.isArray(panel.rows) ? panel.rows : [];
      if (!rows.length) {
        host.innerHTML = '<div class="dashboard-empty">\u6682\u65e0\u6392\u884c\u6570\u636e</div>';
        return;
      }
      var max = maxByKeys(rows, [panel.valueKey]);
      host.innerHTML = '<div class="dashboard-list">' + rows.slice(0, 8).map(function (row, index) {
        var width = Math.max(12, Math.round((Number(row[panel.valueKey] || 0) / max) * 100));
        return '' +
          '<div class="dashboard-list-item">' +
            '<div class="dashboard-rank">' + escapeHtml(index + 1) + '</div>' +
            '<div class="dashboard-list-main">' +
              '<div class="dashboard-list-key">' + escapeHtml(formatScopeLabel(row.key || '')) + '</div>' +
              '<div class="dashboard-list-sub">' + escapeHtml(panel.meta.subtitle || '\u70ed\u70b9\u53d8\u5316') + '</div>' +
              '<div class="dashboard-list-meter"><span style="--meter-width:' + width + '%;"></span></div>' +
            '</div>' +
            '<div class="dashboard-list-value">' + escapeHtml(formatNumber(row[panel.valueKey] || 0)) + '</div>' +
          '</div>';
      }).join('') + '</div>';
    });
  }

  function renderOpsStatus(summary) {
    var host = getEl('dashboardOpsStatus');
    if (!host) return;
    var cards = [
      {
        title: '\u5f85\u5ba1\u6838\u538b\u529b',
        value: formatNumber(summary.pendingReview || 0),
        copy: Number(summary.pendingReview || 0) > 0
          ? '\u5f53\u524d\u9700\u8981\u5173\u6ce8\u5ba1\u6838\u961f\u5217\u79ef\u538b'
          : '\u5f53\u524d\u5ba1\u6838\u961f\u5217\u4fdd\u6301\u5e73\u7a33'
      },
      {
        title: '\u5904\u7f5a\u4e2d\u8d26\u53f7',
        value: formatNumber(summary.punishments || 0),
        copy: Number(summary.punishments || 0) > 0
          ? '\u6cbb\u7406\u72b6\u6001\u4ecd\u5728\u6301\u7eed\uff0c\u9700\u8981\u8ddf\u8fdb'
          : '\u76ee\u524d\u672a\u51fa\u73b0\u65b0\u7684\u6cbb\u7406\u79ef\u538b'
      },
      {
        title: '\u89c2\u6d4b\u6a21\u5f0f',
        value: modeLabel(state.mode),
        copy: modeDescription(state.mode)
      },
      {
        title: '\u5237\u65b0\u9891\u7387',
        value: state.mode === 'realtime' && state.autoRefresh ? (state.refreshMs / 1000 + ' \u79d2') : '\u5173\u95ed',
        copy: state.mode === 'realtime' && state.autoRefresh
          ? '\u81ea\u52a8\u8ffd\u8e2a\u5f53\u524d\u5b9e\u65f6\u53d8\u5316'
          : '\u5f53\u524d\u4ee5\u624b\u52a8\u5206\u6790\u4e3a\u4e3b'
      }
    ];
    host.innerHTML = '<div class="dashboard-status-grid">' + cards.map(function (card) {
      return '' +
        '<div class="dashboard-status-card">' +
          '<div class="dashboard-status-title">' + escapeHtml(card.title) + '</div>' +
          '<div class="dashboard-status-value">' + escapeHtml(card.value) + '</div>' +
          '<div class="dashboard-status-copy">' + escapeHtml(card.copy) + '</div>' +
        '</div>';
    }).join('') + '</div>';
  }

  function buildCommandSummaryMarkup(commandSummary) {
    var summary = commandSummary || { tone: 'info', summary: commandDeckMeta().emptySummary };
    return '' +
      '<div class="dashboard-summary-tone dashboard-summary-tone-' + escapeHtml(summary.tone || 'info') + '">' +
        escapeHtml(summary.summary || commandDeckMeta().emptySummary) +
      '</div>';
  }

  function renderSignalBoardMarkup(signals) {
    if (!signals || !signals.length) {
      return '<div class="dashboard-empty">\u5f53\u524d\u6682\u65e0\u663e\u8457\u5f02\u5e38</div>';
    }
    return '<div class="dashboard-signal-board">' + signals.map(function (signal) {
      return '' +
        '<article class="dashboard-alert-card level-' + escapeHtml(signal.level || 'info') + '">' +
          '<div class="dashboard-alert-top">' +
            '<span class="dashboard-alert-level">' + escapeHtml((signal.level || 'info').toUpperCase()) + '</span>' +
            '<div class="dashboard-alert-title">' + escapeHtml(signal.title || '') + '</div>' +
          '</div>' +
          '<div class="dashboard-alert-summary">' + escapeHtml(signal.summary || '') + '</div>' +
          '<div class="dashboard-alert-action">' + escapeHtml(signal.action || '') + '</div>' +
        '</article>';
    }).join('') + '</div>';
  }

  function renderActionZoneMarkup(actions) {
    if (!actions || !actions.length) {
      return '<div class="dashboard-empty">\u6682\u65e0\u53ef\u7528\u5feb\u6377\u52a8\u4f5c</div>';
    }
    return '<div class="dashboard-action-zone">' + actions.map(function (action) {
      return '' +
        '<button class="dashboard-action-card" type="button" data-dashboard-action="' + escapeHtml(action.key || '') + '">' +
          '<span class="dashboard-action-label">' + escapeHtml(action.label || '') + '</span>' +
        '</button>';
    }).join('') + '</div>';
  }

  function setCommandSummary(commandSummary) {
    var host = getEl('dashboardCommandSummary');
    if (!host) return;
    host.innerHTML = buildCommandSummaryMarkup(commandSummary);
  }

  function renderSignalBoard(signals) {
    var host = getEl('dashboardSignalBoard');
    if (!host) return;
    host.innerHTML = renderSignalBoardMarkup(signals);
  }

  function goToDashboardPage(actionKey) {
    var pageMap = {
      review: 'review',
      blackroom: 'blackroom'
    };
    var page = pageMap[actionKey];
    if (!page || !hasDom) return;
    var button = root.document.querySelector('.side-item[data-page="' + page + '"]');
    if (button && typeof button.click === 'function') button.click();
  }

  function bindActionZoneEvents() {
    var host = getEl('dashboardActionZone');
    if (!host) return;
    Array.prototype.forEach.call(host.querySelectorAll('[data-dashboard-action]'), function (button) {
      button.addEventListener('click', function () {
        var actionKey = button.getAttribute('data-dashboard-action');
        if (actionKey === 'refresh') {
          load();
          return;
        }
        goToDashboardPage(actionKey);
      });
    });
  }

  function renderActionZone(actions) {
    var host = getEl('dashboardActionZone');
    if (!host) return;
    host.innerHTML = renderActionZoneMarkup(actions);
    bindActionZoneEvents();
  }

  function buildFallbackSignalState(summary) {
    if (Number(summary.pendingReview || 0) >= 10) {
      return {
        commandSummary: {
          tone: 'high',
          summary: '\u5f53\u524d\u5f85\u5ba1\u6838\u5806\u79ef\u660e\u663e\uff0c\u5efa\u8bae\u4f18\u5148\u5904\u7406\u5ba1\u6838\u961f\u5217'
        },
        signals: [{
          level: 'high',
          title: '\u5f85\u5ba1\u6838\u538b\u529b\u5347\u9ad8',
          summary: '\u5f53\u524d\u9700\u8981\u5173\u6ce8\u5f85\u5ba1\u6838\u5185\u5bb9\u79ef\u538b',
          action: '\u6253\u5f00\u5ba1\u6838\u4e2d\u5fc3\u5feb\u901f\u5904\u7406'
        }]
      };
    }
    return {
      commandSummary: {
        tone: 'info',
        summary: '\u5f53\u524d\u6682\u65e0\u663e\u8457\u5f02\u5e38'
      },
      signals: []
    };
  }

  function renderBlocked(message) {
    renderHeroBand({ pv: 0, uv: 0, newUsers: 0, activeUsers: 0, posts: 0, comments: 0, pendingReview: 0, punishments: 0 });
    setCommandSummary({ tone: 'watch', summary: message });
    renderSignalBoard([]);
    renderActionZone([]);
    ['dashboardTrafficTrend', 'dashboardUsersTrend', 'dashboardContentTrend', 'dashboardTopPages', 'dashboardTopFunctions', 'dashboardTopApis', 'dashboardOpsStatus'].forEach(function (id) {
      var host = getEl(id);
      if (host) host.innerHTML = '<div class="dashboard-empty">' + escapeHtml(message) + '</div>';
    });
    if (typeof root.setStatus === 'function') root.setStatus('dashboardStatus', message);
  }

  function applyTrendMeta(trends) {
    var meta = trendMeta();
    if (getEl('dashboardPrimaryTrendTitle')) getEl('dashboardPrimaryTrendTitle').textContent = meta.primary.title || '\u6d41\u91cf\u4e3b\u8d8b\u52bf';
    if (getEl('dashboardPrimaryTrendSummary')) {
      getEl('dashboardPrimaryTrendSummary').textContent =
        (meta.primary.subtitle || '') + ' 路 PV ' + formatNumber(sumByKey(trends.traffic || [], 'pv')) +
        ' / UV ' + formatNumber(sumByKey(trends.traffic || [], 'uv'));
    }
    if (getEl('dashboardUsersTrendTitle')) getEl('dashboardUsersTrendTitle').textContent = (meta.secondary[0] && meta.secondary[0].title) || '\u7528\u6237\u589e\u957f';
    if (getEl('dashboardUsersTrendSummary')) {
      getEl('dashboardUsersTrendSummary').textContent =
        ((meta.secondary[0] && meta.secondary[0].subtitle) || '\u89c2\u5bdf\u65b0\u589e\u4e0e\u6d3b\u8dc3') +
        ' 路 ' + formatNumber(sumByKey(trends.users || [], 'newUsers'));
    }
    if (getEl('dashboardContentTrendTitle')) getEl('dashboardContentTrendTitle').textContent = (meta.secondary[1] && meta.secondary[1].title) || '\u5185\u5bb9\u589e\u957f';
    if (getEl('dashboardContentTrendSummary')) {
      getEl('dashboardContentTrendSummary').textContent =
        ((meta.secondary[1] && meta.secondary[1].subtitle) || '\u89c2\u5bdf\u53d1\u5e16\u4e0e\u8bc4\u8bba') +
        ' 路 \u53d1\u5e16 ' + formatNumber(sumByKey(trends.content || [], 'posts')) +
        ' / \u8bc4\u8bba ' + formatNumber(sumByKey(trends.content || [], 'comments'));
    }
  }

  async function load() {
    clearTimer();
    if (!hasDom || root.currentPage !== 'operations-dashboard') return;
    if (!root.authUser || !root.authUser.isAdmin) {
      renderBlocked('\u4ec5\u7ba1\u7406\u5458\u53ef\u67e5\u770b\u8fd0\u8425\u603b\u89c8');
      return;
    }
    try {
      if (typeof root.setStatus === 'function') root.setStatus('dashboardStatus', '\u6b63\u5728\u52a0\u8f7d\u6307\u6325\u8231\u6570\u636e...');
      var currentTimeState = state.dashboardTime || createDefaultDashboardTimeState(new Date());
      var query = buildQueryString();
      var requests = [
        apiGet('/api/admin/dashboard/summary?' + query),
        apiGet('/api/admin/dashboard/trends?' + query),
        apiGet('/api/admin/dashboard/rankings?' + query)
      ];
      if (currentTimeState.timeGroup === 'realtime') requests.push(apiGet('/api/admin/dashboard/realtime?' + query));
      var results = await Promise.all(requests);
      var summary = results[0].summary || {};
      var trends = results[1].trends || {};
      var rankings = results[2].rankings || {};
      var realtime = results[3] ? (results[3].realtime || {}) : {};
      var signalApi = getSignalApi();
      var signalState = signalApi.buildDashboardSignals
        ? signalApi.buildDashboardSignals({
          summary: summary,
          trends: trends,
          rankings: rankings,
          realtime: realtime
        })
        : buildFallbackSignalState(summary);
      var activeTimeLabel = buildActiveTimeLabel(currentTimeState);

      renderHeroBand(summary);
      setCommandSummary({
        tone: signalState.commandSummary.tone,
        summary: activeTimeLabel + ' \u00b7 ' + signalState.commandSummary.summary
      });
      renderSignalBoard(signalState.signals);
      applyTrendMeta(trends);
      renderLineTrend('dashboardTrafficTrend', trends.traffic, [
        { key: 'pv', label: 'PV\uff08\u9875\u9762\u8bbf\u95ee\u91cf\uff09', short: 'PV', tone: 'primary', color: '#38bdf8' },
        { key: 'uv', label: 'UV\uff08\u72ec\u7acb\u8bbf\u5ba2\uff09', short: 'UV', tone: 'secondary', color: '#f59e0b' }
      ], '\u6682\u65e0\u6d41\u91cf\u8d8b\u52bf\u6570\u636e', 12);
      renderSignalChart('dashboardUsersTrend', trends.users, [
        { key: 'newUsers', label: '\u65b0\u589e\u7528\u6237', short: '\u65b0\u589e', tone: 'tertiary', color: '#10b981' }
      ], '\u6682\u65e0\u7528\u6237\u589e\u957f\u6570\u636e', 8);
      renderSignalChart('dashboardContentTrend', trends.content, [
        { key: 'posts', label: '\u53d1\u5e16', short: '\u53d1\u5e16', tone: 'primary', color: '#38bdf8' },
        { key: 'comments', label: '\u8bc4\u8bba', short: '\u8bc4\u8bba', tone: 'quaternary', color: '#8b5cf6' }
      ], '\u6682\u65e0\u5185\u5bb9\u6d3b\u8dc3\u6570\u636e', 8);
      renderRankings(rankings);
      renderOpsStatus({
        pendingReview: summary.pendingReview,
        punishments: summary.punishments
      });
      renderActionZone(commandDeckMeta().actions || []);

      if (typeof root.setStatus === 'function') {
        root.setStatus(
          'dashboardStatus',
          activeTimeLabel + ' \u00b7 \u5df2\u4e8e ' + new Date().toLocaleString('zh-CN') + ' \u66f4\u65b0'
        );
      }
    } catch (error) {
      renderBlocked('\u52a0\u8f7d\u6307\u6325\u8231\u6570\u636e\u5931\u8d25\uff1a' + (error && error.message ? error.message : '\u672a\u77e5\u9519\u8bef'));
    } finally {
      schedule();
    }
  }

  function schedule() {
    if (!hasDom || root.currentPage !== 'operations-dashboard') return;
    if (!root.authUser || !root.authUser.isAdmin) return;
    if (!state.autoRefresh || state.mode !== 'realtime') return;
    clearTimer();
    state.timer = setTimeout(load, state.refreshMs);
  }

  function pause() {
    clearTimer();
  }

  function commitDashboardTimeState(nextState) {
    state.dashboardTime = setDefaultCustomValue(nextState, new Date());
    syncLegacyTimeState();
    syncTimeControls();
  }

  function handleTimeGroupChange(nextGroup) {
    commitDashboardTimeState(applyTimeGroup(state.dashboardTime, nextGroup, new Date()));
  }

  function handleTimePresetChange(nextPreset) {
    commitDashboardTimeState(applyTimePreset(state.dashboardTime, nextPreset));
  }

  function handleCustomValueChange(value) {
    var nextState = {
      timeGroup: state.dashboardTime.timeGroup,
      timePreset: state.dashboardTime.timePreset,
      customValue: String(value || ''),
      autoRefresh: state.dashboardTime.autoRefresh,
      refreshMs: state.dashboardTime.refreshMs
    };
    commitDashboardTimeState(nextState);
  }

  function toggleFullscreen() {
    if (!hasDom) return;
    root.document.documentElement.classList.toggle('dashboard-fullscreen');
    root.document.body.classList.toggle('dashboard-fullscreen');
  }

  function bind() {
    if (!hasDom || state.initialized) return;
    state.initialized = true;
    var groupSelect = getEl('dashboardTimeGroup');
    var presetSelect = getEl('dashboardTimePreset');
    var customDayInput = getEl('dashboardCustomDay');
    var customWeekInput = getEl('dashboardCustomWeek');
    var customMonthInput = getEl('dashboardCustomMonth');
    var autoRefresh = getEl('dashboardAutoRefresh');
    var refreshBtn = getEl('dashboardRefreshBtn');
    var fullscreenBtn = getEl('dashboardFullscreenBtn');

    commitDashboardTimeState(state.dashboardTime || createDefaultDashboardTimeState(new Date()));

    if (groupSelect) {
      groupSelect.addEventListener('change', function () {
        handleTimeGroupChange(groupSelect.value);
        load();
      });
    }
    if (presetSelect) {
      presetSelect.addEventListener('change', function () {
        handleTimePresetChange(presetSelect.value);
        load();
      });
    }
    if (customDayInput) {
      customDayInput.addEventListener('change', function () {
        handleCustomValueChange(customDayInput.value);
        load();
      });
    }
    if (customWeekInput) {
      customWeekInput.addEventListener('change', function () {
        handleCustomValueChange(customWeekInput.value);
        load();
      });
    }
    if (customMonthInput) {
      customMonthInput.addEventListener('change', function () {
        handleCustomValueChange(customMonthInput.value);
        load();
      });
    }
    if (autoRefresh) {
      autoRefresh.checked = state.autoRefresh;
      autoRefresh.addEventListener('change', function () {
        var nextState = {
          timeGroup: state.dashboardTime.timeGroup,
          timePreset: state.dashboardTime.timePreset,
          customValue: state.dashboardTime.customValue,
          autoRefresh: state.dashboardTime.timeGroup === 'realtime' ? !!autoRefresh.checked : false,
          refreshMs: state.dashboardTime.refreshMs
        };
        commitDashboardTimeState(nextState);
        if (!state.autoRefresh) pause();
        else load();
      });
    }
    if (refreshBtn) refreshBtn.addEventListener('click', load);
    if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);
  }

  if (hasDom) {
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', bind);
    } else {
      bind();
    }
  }

  return {
    init: bind,
    load: load,
    pause: pause,
    __test__: {
      createDefaultDashboardTimeState: createDefaultDashboardTimeState,
      applyTimeGroup: applyTimeGroup,
      applyTimePreset: applyTimePreset,
      getVisibleCustomInput: getVisibleCustomInput,
      buildDashboardTimeQuery: buildDashboardTimeQuery,
      buildActiveTimeLabel: buildActiveTimeLabel,
      buildCommandSummaryMarkup: buildCommandSummaryMarkup,
      renderSignalBoardMarkup: renderSignalBoardMarkup,
      renderActionZoneMarkup: renderActionZoneMarkup
    }
  };
});
