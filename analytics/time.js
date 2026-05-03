const {
  DASHBOARD_GROUPS,
  DASHBOARD_MODES,
  DEFAULT_DASHBOARD_MODE,
  DEFAULT_REFRESH_MS,
  DEFAULT_SCOPE
} = require('./constants');

const REALTIME_PRESET_REFRESH_MS = {
  rt_1s: 1000,
  rt_15s: 15000,
  rt_1m: 60000
};

function getTimezoneOffsetMs(timezone) {
  if (timezone === 'Asia/Shanghai') return 8 * 60 * 60 * 1000;
  return 0;
}

function parseDateInput(value, fallback) {
  const date = value ? new Date(value) : null;
  if (date && !Number.isNaN(date.getTime())) return date;
  return fallback instanceof Date ? new Date(fallback.getTime()) : new Date();
}

function parseLocalDateStart(value, timezone) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const offsetMs = getTimezoneOffsetMs(timezone);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0) - offsetMs);
}

function parseWeekStart(value, timezone) {
  const match = String(value || '').match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  const simple = new Date(Date.UTC(year, 0, 1 + ((week - 1) * 7)));
  const dow = simple.getUTCDay() || 7;
  if (dow <= 4) simple.setUTCDate(simple.getUTCDate() - dow + 1);
  else simple.setUTCDate(simple.getUTCDate() + 8 - dow);
  const offsetMs = getTimezoneOffsetMs(timezone);
  return new Date(Date.UTC(simple.getUTCFullYear(), simple.getUTCMonth(), simple.getUTCDate(), 0, 0, 0) - offsetMs);
}

function parseMonthStart(value, timezone) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const offsetMs = getTimezoneOffsetMs(timezone);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1, 0, 0, 0) - offsetMs);
}

function startOfLocalDay(now, timezone) {
  const offsetMs = getTimezoneOffsetMs(timezone);
  const local = new Date(now.getTime() + offsetMs);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 0, 0, 0) - offsetMs);
}

function startOfLocalWeek(now, timezone) {
  const dayStart = startOfLocalDay(now, timezone);
  const offsetMs = getTimezoneOffsetMs(timezone);
  const local = new Date(dayStart.getTime() + offsetMs);
  const dow = local.getUTCDay() || 7;
  local.setUTCDate(local.getUTCDate() - dow + 1);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 0, 0, 0) - offsetMs);
}

function deriveMode(group, preset, rawMode) {
  if (DASHBOARD_MODES.has(String(rawMode || '').trim())) return String(rawMode).trim();
  switch (String(group || '')) {
    case 'realtime':
      return 'realtime';
    case 'recent':
    case 'day':
    case 'week':
    case 'month':
      return 'custom';
    case 'year':
      return 'month';
    default:
      return DEFAULT_DASHBOARD_MODE;
  }
}

function normalizeDashboardQuery(input) {
  const raw = input || {};
  const group = DASHBOARD_GROUPS.has(String(raw.group || '').trim())
    ? String(raw.group).trim()
    : 'realtime';
  const preset = typeof raw.preset === 'string' && raw.preset.trim()
    ? raw.preset.trim()
    : '';
  const value = typeof raw.value === 'string' ? raw.value.trim() : '';
  const mode = deriveMode(group, preset, raw.mode);
  const start = typeof raw.start === 'string' ? raw.start : '';
  const end = typeof raw.end === 'string' ? raw.end : '';
  const timezone = typeof raw.timezone === 'string' && raw.timezone.trim()
    ? raw.timezone.trim()
    : 'Asia/Shanghai';
  const scope = typeof raw.scope === 'string' && raw.scope.trim()
    ? raw.scope.trim()
    : DEFAULT_SCOPE;
  const refreshMs = REALTIME_PRESET_REFRESH_MS[preset] || DEFAULT_REFRESH_MS;

  return {
    mode,
    group,
    preset,
    value,
    start,
    end,
    timezone,
    scope,
    refreshMs
  };
}

function getBucketLabel(mode) {
  switch (String(mode || '')) {
    case 'realtime':
      return 'hour';
    case 'day':
    case 'custom':
    case 'custom_avg':
      return 'day';
    case 'month':
      return 'month';
    case 'year':
      return 'year';
    default:
      return 'hour';
  }
}

function getRangeForQuery(query, nowInput) {
  const now = nowInput instanceof Date ? new Date(nowInput.getTime()) : new Date();
  const group = String(query?.group || '');
  const preset = String(query?.preset || '');
  const timezone = String(query?.timezone || 'Asia/Shanghai');
  const offsetMs = getTimezoneOffsetMs(timezone);

  if (group === 'realtime') {
    return {
      start: new Date(now.getTime() - (60 * 60 * 1000)),
      end: now,
      bucket: 'minute'
    };
  }

  if (group === 'recent') {
    const hours = Number(preset.replace(/[^\d]/g, '') || 6);
    return {
      start: new Date(now.getTime() - (hours * 60 * 60 * 1000)),
      end: now,
      bucket: 'hour'
    };
  }

  if (group === 'day') {
    let start = null;
    if (preset === 'day_today') start = startOfLocalDay(now, timezone);
    else if (preset === 'day_yesterday') start = new Date(startOfLocalDay(now, timezone).getTime() - 86400000);
    else if (preset === 'day_before_yesterday') start = new Date(startOfLocalDay(now, timezone).getTime() - (2 * 86400000));
    else if (preset === 'day_custom') start = parseLocalDateStart(query?.value, timezone);
    if (start) {
      return {
        start,
        end: new Date(start.getTime() + 86400000 - 1),
        bucket: 'hour'
      };
    }
  }

  if (group === 'week') {
    let start = null;
    if (preset === 'week_this') start = startOfLocalWeek(now, timezone);
    else if (preset === 'week_last') start = new Date(startOfLocalWeek(now, timezone).getTime() - (7 * 86400000));
    else if (preset === 'week_last_2') start = new Date(startOfLocalWeek(now, timezone).getTime() - (14 * 86400000));
    else if (preset === 'week_custom') start = parseWeekStart(query?.value, timezone);
    if (start) {
      return {
        start,
        end: new Date(start.getTime() + (7 * 86400000) - 1),
        bucket: 'day'
      };
    }
  }

  if (group === 'month') {
    let start = null;
    const localNow = new Date(now.getTime() + offsetMs);
    if (preset === 'month_this') start = parseMonthStart(localNow.getUTCFullYear() + '-' + String(localNow.getUTCMonth() + 1).padStart(2, '0'), timezone);
    else if (preset === 'month_last') start = parseMonthStart(new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth() - 1, 1)).getUTCFullYear() + '-' + String(new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth() - 1, 1)).getUTCMonth() + 1).padStart(2, '0'), timezone);
    else if (preset === 'month_last_2') start = parseMonthStart(new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth() - 2, 1)).getUTCFullYear() + '-' + String(new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth() - 2, 1)).getUTCMonth() + 1).padStart(2, '0'), timezone);
    else if (preset === 'month_custom') start = parseMonthStart(query?.value, timezone);
    if (start) {
      const localStart = new Date(start.getTime() + offsetMs);
      const localEnd = new Date(Date.UTC(localStart.getUTCFullYear(), localStart.getUTCMonth() + 1, 1) - 1 - offsetMs);
      return { start, end: localEnd, bucket: 'day' };
    }
  }

  if (group === 'year') {
    const year = Number(preset.replace(/[^\d]/g, '') || now.getUTCFullYear());
    const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0) - 1);
    return { start, end, bucket: 'month' };
  }

  const mode = String(query?.mode || DEFAULT_DASHBOARD_MODE);

  if (mode === 'realtime') {
    return {
      start: new Date(now.getTime() - (60 * 60 * 1000)),
      end: now,
      bucket: 'minute'
    };
  }

  const start = parseDateInput(query?.start, new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)));
  const end = parseDateInput(query?.end, now);

  return {
    start,
    end,
    bucket: mode === 'month' ? 'month' : (mode === 'year' ? 'year' : 'day')
  };
}

function getQueryBucketSpec(query, range) {
  const group = String(query?.group || '');
  if (group === 'realtime') {
    return { bucket: 'minute', sqlFormat: '%Y-%m-%d %H:%i:00' };
  }
  if (group === 'recent' || group === 'day') {
    return { bucket: 'hour', sqlFormat: '%Y-%m-%d %H:00:00' };
  }
  if (group === 'week' || group === 'month') {
    return { bucket: 'day', sqlFormat: '%Y-%m-%d' };
  }
  if (group === 'year') {
    return { bucket: 'month', sqlFormat: '%Y-%m' };
  }

  const mode = String(query?.mode || DEFAULT_DASHBOARD_MODE);
  if (mode === 'realtime') {
    return { bucket: 'minute', sqlFormat: '%Y-%m-%d %H:%i:00' };
  }
  if (mode === 'month') {
    return { bucket: 'month', sqlFormat: '%Y-%m' };
  }
  if (mode === 'year') {
    return { bucket: 'year', sqlFormat: '%Y' };
  }

  const spanMs = Math.max(0, Number(range?.end?.getTime?.() || 0) - Number(range?.start?.getTime?.() || 0));
  if (spanMs <= 3 * 24 * 60 * 60 * 1000) {
    return { bucket: 'hour', sqlFormat: '%Y-%m-%d %H:00:00' };
  }
  return { bucket: 'day', sqlFormat: '%Y-%m-%d' };
}

module.exports = {
  normalizeDashboardQuery,
  getBucketLabel,
  getRangeForQuery,
  getQueryBucketSpec
};
