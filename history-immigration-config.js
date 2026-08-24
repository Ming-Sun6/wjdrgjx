const DEFAULT_HISTORY_IMMIGRATION_INTERVAL_DAYS = 28;
const DEFAULT_HISTORY_IMMIGRATION_DATES = [
  '2024-11-10','2024-12-08','2025-01-05','2025-02-02','2025-03-30','2025-04-27',
  '2025-06-08','2025-07-06','2025-08-17','2025-09-15','2025-10-12','2025-11-09',
  '2025-12-08','2026-01-04','2026-02-01','2026-03-15','2026-04-26','2026-05-24',
  '2026-07-19','2026-08-16'
];
const DEFAULT_HISTORY_IMMIGRATION_RULES = {
  displayOffsetDays: 1,
  groupMode: 'same-progress',
  mergeContinuousRanges: true,
  showStageDetails: true
};

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function normalizeHistoryImmigrationConfig(input, validRanges = []) {
  const raw = input && typeof input === 'object' ? input : {};
  const intervalDays = Math.max(1, Math.min(90, Math.round(Number(raw.intervalDays) || DEFAULT_HISTORY_IMMIGRATION_INTERVAL_DAYS)));
  const sourceDates = Array.isArray(raw.dates) ? raw.dates : DEFAULT_HISTORY_IMMIGRATION_DATES.map((date) => ({ date, enabled: true, unopened: false, note: '', overrides: {} }));
  const rangeSet = new Set((Array.isArray(validRanges) ? validRanges : []).map((v) => String(v)));
  const seen = new Set();
  const dates = sourceDates.slice(0, 200).map((item) => {
    const value = typeof item === 'string' ? { date: item } : item;
    const date = String(value?.date || '').trim();
    if (!isIsoDate(date) || seen.has(date)) return null;
    seen.add(date);
    const overrides = {};
    if (value.overrides && typeof value.overrides === 'object') {
      Object.keys(value.overrides).slice(0, 500).forEach((key) => {
        if ((!rangeSet.size || rangeSet.has(key)) && /^group-[A-Za-z0-9_-]{1,24}$/.test(String(value.overrides[key] || ''))) overrides[key] = String(value.overrides[key]);
      });
    }
    return { date, enabled: value.enabled !== false, unopened: value.unopened === true, note: String(value.note || '').slice(0, 120), overrides };
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  const rules = raw.rules && typeof raw.rules === 'object' ? raw.rules : {};
  return {
    version: 1,
    intervalDays,
    dates: dates.length ? dates : DEFAULT_HISTORY_IMMIGRATION_DATES.map((date) => ({ date, enabled: true, unopened: false, note: '', overrides: {} })),
    rules: {
      displayOffsetDays: Math.max(0, Math.min(7, Math.round(Number(rules.displayOffsetDays) || DEFAULT_HISTORY_IMMIGRATION_RULES.displayOffsetDays))),
      groupMode: rules.groupMode === 'manual' ? 'manual' : 'same-progress',
      mergeContinuousRanges: rules.mergeContinuousRanges !== false,
      showStageDetails: rules.showStageDetails !== false
    }
  };
}

function generateHistoryImmigrationDates(anchorDate, count = 1, intervalDays = DEFAULT_HISTORY_IMMIGRATION_INTERVAL_DAYS) {
  if (!isIsoDate(anchorDate)) return [];
  const n = Math.max(1, Math.min(200, Number(count) || 1));
  const step = Math.max(1, Math.min(90, Number(intervalDays) || DEFAULT_HISTORY_IMMIGRATION_INTERVAL_DAYS));
  return Array.from({ length: n }, (_, i) => addDays(anchorDate, i * step));
}

function defaultHistoryImmigrationConfig() {
  return normalizeHistoryImmigrationConfig({});
}

module.exports = { DEFAULT_HISTORY_IMMIGRATION_INTERVAL_DAYS, DEFAULT_HISTORY_IMMIGRATION_DATES, defaultHistoryImmigrationConfig, generateHistoryImmigrationDates, normalizeHistoryImmigrationConfig, isIsoDate };
