const DASHBOARD_MODES = new Set([
  'realtime',
  'day',
  'custom',
  'custom_avg',
  'month',
  'year'
]);

const DASHBOARD_GROUPS = new Set([
  'realtime',
  'recent',
  'day',
  'week',
  'month',
  'year'
]);

const DEFAULT_DASHBOARD_MODE = 'realtime';
const DEFAULT_REFRESH_MS = 30000;
const DEFAULT_SCOPE = 'site';

module.exports = {
  DASHBOARD_MODES,
  DASHBOARD_GROUPS,
  DEFAULT_DASHBOARD_MODE,
  DEFAULT_REFRESH_MS,
  DEFAULT_SCOPE
};
