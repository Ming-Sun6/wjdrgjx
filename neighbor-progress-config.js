const DEFAULT_NEIGHBOR_PROGRESS_INTERVAL_DAYS = 14;
const DEFAULT_NEIGHBOR_PROGRESS_STAGES = [
  { key: 'FC5', name: '\u706b\u6676\u4e94', anchorDate: '2024-09-02' },
  { key: 'Hero4', name: '4\u4ee3\u82f1\u96c4', anchorDate: '2024-10-14' },
  { key: 'WarAcad', name: '\u6218\u4e89\u5b66\u9662', anchorDate: '2024-11-11' },
  { key: 'Hero5', name: '5\u4ee3\u82f1\u96c4', anchorDate: '2025-01-06' },
  { key: 'FC8', name: '\u706b\u6676\u516b', anchorDate: '2025-03-03' },
  { key: 'Hero6', name: '6\u4ee3\u82f1\u96c4', anchorDate: '2025-05-05' },
  { key: 'Hero7', name: '7\u4ee3\u82f1\u96c4', anchorDate: '2025-07-28' },
  { key: 'FC10', name: '\u706b\u6676\u5341', anchorDate: '2025-09-08' },
  { key: 'Hero8', name: '8\u4ee3\u82f1\u96c4', anchorDate: '2025-10-20' },
  { key: 'Hero9', name: '9\u4ee3\u82f1\u96c4', anchorDate: '2026-01-05' },
  { key: 'Hero10', name: '10\u4ee3\u82f1\u96c4', anchorDate: '2026-04-27' },
  { key: 'Hero11', name: '11\u4ee3\u82f1\u96c4', anchorDate: '2026-05-25' },
  { key: 'Hero12', name: '12\u4ee3\u82f1\u96c4', anchorDate: '2026-08-17' }
];
const DEFAULT_NEIGHBOR_PROGRESS_RANGES = [
  '1~13','14~73','74~163','164~250','251~328','329~416','417~522','523~636','637~742','743~830',
  '831~918','919~1040','1041~1180','1181~1334','1335~1469','1470~1579','1580~1702','1703~1833',
  '1834~1925','1926~2021','2022~2138','2139~2285','2286~2441','2442~2511','2512~2577','2578~2647',
  '2648~2731','2732~2790','2791~2858','2859~2913','2914~2982','2983~3075','3076~3176','3177~3236',
  '3237~3311','3312~3383','3384~3442','3443~3483','3484~3509','3510~3556','3557~3591','3592~3627',
  '3628~3671','3672~3716','3717~3755','3756~3799'
];

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function generateStageDates(anchorDate, rangeCount = DEFAULT_NEIGHBOR_PROGRESS_RANGES.length, intervalDays = DEFAULT_NEIGHBOR_PROGRESS_INTERVAL_DAYS) {
  if (!isIsoDate(anchorDate)) return [];
  const count = Math.max(1, Math.min(200, Number(rangeCount) || DEFAULT_NEIGHBOR_PROGRESS_RANGES.length));
  const interval = Math.max(1, Math.min(60, Number(intervalDays) || DEFAULT_NEIGHBOR_PROGRESS_INTERVAL_DAYS));
  return Array.from({ length: count }, (_, index) => addDays(anchorDate, index * interval));
}

function normalizeNeighborProgressConfig(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const intervalDays = Math.max(1, Math.min(60, Math.round(Number(raw.intervalDays) || DEFAULT_NEIGHBOR_PROGRESS_INTERVAL_DAYS)));
  const ranges = Array.isArray(raw.ranges) && raw.ranges.length
    ? raw.ranges.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 200)
    : DEFAULT_NEIGHBOR_PROGRESS_RANGES.slice();
  const sourceStages = Array.isArray(raw.stages) ? raw.stages.slice(0, 50) : [];
  const stages = [];
  const seen = new Set();
  for (const source of sourceStages) {
    if (!source || typeof source !== 'object') continue;
    const key = String(source.key || '').trim();
    const name = String(source.name || '').trim();
    if (!/^[A-Za-z][A-Za-z0-9_-]{1,31}$/.test(key) || !name || name.length > 40 || seen.has(key)) continue;
    const explicitDates = Array.isArray(source.dates) ? source.dates : [];
    const anchorDate = isIsoDate(source.anchorDate) ? source.anchorDate : (isIsoDate(explicitDates[0]) ? explicitDates[0] : '');
    if (!anchorDate) continue;
    const generatedDates = generateStageDates(anchorDate, ranges.length, intervalDays);
    const dates = generatedDates.map((fallback, index) => isIsoDate(explicitDates[index]) ? explicitDates[index] : fallback);
    stages.push({ key, name, anchorDate, enabled: source.enabled !== false, dates });
    seen.add(key);
  }
  return { version: 1, intervalDays, ranges, stages };
}

// Keep the default configuration aligned with the stages shown on the public page.
function defaultNeighborProgressConfig() {
  return normalizeNeighborProgressConfig({
    stages: DEFAULT_NEIGHBOR_PROGRESS_STAGES
  });
}

module.exports = {
  DEFAULT_NEIGHBOR_PROGRESS_INTERVAL_DAYS,
  DEFAULT_NEIGHBOR_PROGRESS_STAGES,
  DEFAULT_NEIGHBOR_PROGRESS_RANGES,
  defaultNeighborProgressConfig,
  generateStageDates,
  isIsoDate,
  normalizeNeighborProgressConfig
};
