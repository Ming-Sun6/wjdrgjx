(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WjdrFarthestMigration = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const DAY = 86400000;
  const DEFAULT_INTERVAL_DAYS = 14;
  const DEFAULT_FC5_ANCHOR = "2024-09-02";
  const DEFAULT_HISTORY_INTERVAL_DAYS = 28;
  const DEFAULT_DISPLAY_OFFSET_DAYS = 1;
  const MAX_HOP_PERIODS = 20;
  const FC5_FROM_OPEN_DAYS = 145;
  const FURNACE_OFFSETS = { FC5: 0, FC8: 168, FC10: 336 };
  const PRE_FURNACE = { key: "PRE", name: "未开火五", days: 0 };
  const DEFAULT_HISTORY_DATES = [
    "2024-11-10", "2024-12-08", "2025-01-05", "2025-02-02", "2025-03-30", "2025-04-27",
    "2025-06-08", "2025-07-06", "2025-08-17", "2025-09-15", "2025-10-12", "2025-11-09",
    "2025-12-08", "2026-01-04", "2026-02-01", "2026-03-15", "2026-04-26", "2026-05-24",
    "2026-07-19", "2026-08-16"
  ];
  const DEFAULT_RANGES = [
    "1~13", "14~73", "74~163", "164~250", "251~328", "329~416", "417~522", "523~636", "637~742", "743~830",
    "831~918", "919~1040", "1041~1180", "1181~1334", "1335~1469", "1470~1579", "1580~1702", "1703~1833",
    "1834~1925", "1926~2021", "2022~2138", "2139~2285", "2286~2441", "2442~2511", "2512~2577", "2578~2647",
    "2648~2731", "2732~2790", "2791~2858", "2859~2913", "2914~2982", "2983~3075", "3076~3176", "3177~3236",
    "3237~3311", "3312~3383", "3384~3442", "3443~3483", "3484~3509", "3510~3556", "3557~3591", "3592~3627",
    "3628~3671", "3672~3716", "3717~3755", "3756~3799"
  ];
  const FURNACE_SPANS = [
    { key: "FC5", name: "火五", days: 90 },
    { key: "FC8", name: "火八", days: 120 },
    { key: "FC10", name: "火十", days: 180 }
  ];
  const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
  const DEFAULT_STAGE_DEFS = [
    { key: "FC5", name: "火晶五", offset: 0 },
    { key: "Hero4", name: "4代英雄", offset: 42 },
    { key: "WarAcad", name: "战争学院", offset: 70 },
    { key: "Hero5", name: "5代英雄", offset: 126 },
    { key: "FC8", name: "火晶八", offset: 168 },
    { key: "Hero6", name: "6代英雄", offset: 210 },
    { key: "Hero7", name: "7代英雄", offset: 294 },
    { key: "FC10", name: "火晶十", offset: 336 },
    { key: "Hero8", name: "8代英雄", offset: 378 },
    { key: "Hero9", name: "9代英雄", offset: 462 },
    { key: "Hero10", name: "10代英雄", offset: 546 },
    { key: "Hero11", name: "11代英雄", offset: 630 },
    { key: "Hero12", name: "12代英雄", offset: 714 }
  ];

  function isIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
    const date = new Date(value + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function dateToSerial(value) {
    if (!isIsoDate(value)) return NaN;
    return Date.parse(value + "T00:00:00Z") / DAY;
  }

  function serialToDateStr(serial) {
    if (!Number.isFinite(serial)) return "";
    const date = new Date(Math.round(serial) * DAY);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function addDays(value, days) {
    return serialToDateStr(dateToSerial(value) + Number(days || 0));
  }

  function todayIso() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function parseRangeLabel(label) {
    const text = String(label || "").trim();
    if (/^NB\d+$/i.test(text)) return null;
    const match = text.match(/^(\d+)\s*[~\uFF5E\-\u2013\u2014]\s*(\d+)$/);
    if (!match) return null;
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
    const lo = Math.min(first, second);
    const hi = Math.max(first, second);
    return { label: lo + "~" + hi, lo: lo, hi: hi };
  }

  function theoreticalHops(spanDays, intervalDays) {
    const interval = Math.max(1, Number(intervalDays) || DEFAULT_INTERVAL_DAYS);
    return Number(spanDays) / interval;
  }

  function remainderDays(spanDays, intervalDays) {
    const interval = Math.max(1, Number(intervalDays) || DEFAULT_INTERVAL_DAYS);
    const span = Number(spanDays) || 0;
    return span - Math.floor(span / interval) * interval;
  }

  function formatHops(value) {
    const hops = Number(value);
    if (!Number.isFinite(hops)) return "—";
    return hops.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  }

  function furnaceByKey(key) {
    if (key === PRE_FURNACE.key) return PRE_FURNACE;
    for (let i = 0; i < FURNACE_SPANS.length; i++) {
      if (FURNACE_SPANS[i].key === key) return FURNACE_SPANS[i];
    }
    return PRE_FURNACE;
  }

  function attachDefaultFurnaceSerials(schedule) {
    schedule.furnaceSerials = {};
    FURNACE_SPANS.forEach(function (furnace) {
      const offset = FURNACE_OFFSETS[furnace.key] || 0;
      schedule.furnaceSerials[furnace.key] = schedule.startSerials.map(function (serial) {
        return serial + offset;
      });
    });
    return schedule;
  }

  function findStage(stages, key) {
    const list = Array.isArray(stages) ? stages : [];
    for (let i = 0; i < list.length; i++) {
      const stage = list[i];
      if (stage && stage.key === key && stage.enabled !== false) return stage;
    }
    return null;
  }

  function overlayFurnaceSerials(schedule, neighbor) {
    attachDefaultFurnaceSerials(schedule);
    const stages = neighbor && neighbor.stages;
    FURNACE_SPANS.forEach(function (furnace) {
      const stage = findStage(stages, furnace.key);
      const dates = stage && Array.isArray(stage.dates) ? stage.dates : null;
      if (!dates) return;
      for (let i = 0; i < schedule.ranges.length; i++) {
        if (isIsoDate(dates[i])) schedule.furnaceSerials[furnace.key][i] = dateToSerial(dates[i]);
      }
    });
    attachProgressStages(schedule, neighbor);
    return schedule;
  }

  function isoToExcelSerial(value) {
    if (!isIsoDate(value)) return NaN;
    return Math.round((Date.parse(value + "T00:00:00Z") - EXCEL_EPOCH) / DAY);
  }

  function heroGenerationForStage(stage) {
    if (!stage) return 0;
    const keyMatch = /^Hero(\d+)$/i.exec(String(stage.key || ""));
    if (keyMatch) return Number(keyMatch[1]) || 0;
    const nameMatch = /(\d+)\s*代(?:英雄)?/.exec(String(stage.name || ""));
    return nameMatch ? (Number(nameMatch[1]) || 0) : 0;
  }

  function attachProgressStages(schedule, neighbor) {
    const remoteStages = neighbor && Array.isArray(neighbor.stages) ? neighbor.stages : [];
    const defs = DEFAULT_STAGE_DEFS.map(function (def) { return def; });
    remoteStages.forEach(function (remote) {
      if (!remote || !remote.key || remote.enabled === false) return;
      let found = null;
      for (let i = 0; i < defs.length; i++) {
        if (defs[i].key === remote.key) found = defs[i];
      }
      if (!found) defs.push({ key: remote.key, name: remote.name || remote.key, offset: 0 });
    });
    schedule.progressStages = defs.map(function (def) {
      const remote = findStage(remoteStages, def.key);
      const dates = schedule.ranges.map(function (_range, index) {
        if (remote && remote.dates && isIsoDate(remote.dates[index])) return remote.dates[index];
        const fc5 = schedule.furnaceSerials && schedule.furnaceSerials.FC5
          ? schedule.furnaceSerials.FC5[index]
          : schedule.startSerials[index];
        return serialToDateStr(fc5 + (def.offset || 0));
      });
      return {
        key: def.key,
        name: remote && remote.name ? remote.name : def.name,
        offset: def.offset || 0,
        dates: dates
      };
    });
    return schedule;
  }

  function progressFlagsForRange(schedule, rangeIdx, cutoffExcel) {
    const flags = {};
    const stages = schedule && Array.isArray(schedule.progressStages) ? schedule.progressStages : [];
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      flags[stage.key] = isoToExcelSerial(stage.dates[rangeIdx]) <= cutoffExcel;
    }
    return flags;
  }

  function progressBundleForRange(schedule, rangeIdx, cutoffExcel, periodDate, historyConfig, ignoreOverrides) {
    if (rangeIdx < 0 || !Number.isFinite(cutoffExcel)) {
      return { text: "-", sortKey: -1, bucketKey: "__empty__" };
    }
    const label = schedule.ranges[rangeIdx] && schedule.ranges[rangeIdx].label;
    const dates = historyConfig && Array.isArray(historyConfig.dates) ? historyConfig.dates : [];
    const offset = historyDisplayOffset(historyConfig);
    if (!ignoreOverrides) {
      for (let i = 0; i < dates.length; i++) {
        const item = dates[i];
        if (!item || item.enabled === false || item.date !== periodDate || !item.overrides) continue;
        const override = item.overrides[label];
        if (override) return { text: String(override), sortKey: 999, bucketKey: String(override) };
      }
    }
    const flags = progressFlagsForRange(schedule, rangeIdx, cutoffExcel);
    const stages = schedule.progressStages || [];
    let any = false;
    let nonHero = null;
    let maxHero = 0;
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      if (!flags[stage.key]) continue;
      any = true;
      const hero = heroGenerationForStage(stage);
      if (hero) maxHero = Math.max(maxHero, hero);
      else nonHero = { stage: stage, index: i };
    }
    if (!any) return { text: "-", sortKey: -1, bucketKey: "__empty__" };
    const known = { FC5: "火5", FC8: "火8", FC10: "火10", WarAcad: "战争学院" };
    const left = nonHero ? (known[nonHero.stage.key] || nonHero.stage.name) : "";
    const right = maxHero ? (maxHero + "代") : "";
    const text = left && right ? left + " + " + right : (left || right || "-");
    const sortKey = ((nonHero ? nonHero.index + 1 : 0) * 1000) + maxHero;
    return { text: text, sortKey: sortKey, bucketKey: String(sortKey) };
  }

  function mergeRangeSegments(ranges) {
    const segs = ranges.slice().sort(function (a, b) { return a.lo - b.lo; });
    const merged = [];
    for (let i = 0; i < segs.length; i++) {
      const cur = { lo: segs[i].lo, hi: segs[i].hi };
      if (!merged.length || cur.lo > merged[merged.length - 1].hi + 1) merged.push(cur);
      else merged[merged.length - 1].hi = Math.max(merged[merged.length - 1].hi, cur.hi);
    }
    return merged;
  }

  function predictionGroup(schedule, serverId, periodDate, historyConfig, ignoreOverrides) {
    const originIdx = findRangeIndex(schedule, Number(serverId));
    if (originIdx < 0 || !isIsoDate(periodDate)) return null;
    const cutoff = isoToExcelSerial(periodDate) + historyDisplayOffset(historyConfig);
    const originBundle = progressBundleForRange(schedule, originIdx, cutoff, periodDate, historyConfig, ignoreOverrides);
    const members = [];
    for (let i = 0; i < schedule.ranges.length; i++) {
      const bundle = progressBundleForRange(schedule, i, cutoff, periodDate, historyConfig, ignoreOverrides);
      if (bundle.bucketKey === originBundle.bucketKey) members.push(schedule.ranges[i]);
    }
    const segs = mergeRangeSegments(members);
    let seg = segs[0] || schedule.ranges[originIdx];
    for (let i = 0; i < segs.length; i++) {
      if (serverId >= segs[i].lo && serverId <= segs[i].hi) seg = segs[i];
    }
    return {
      date: periodDate,
      lo: seg.lo,
      hi: seg.hi,
      progressText: originBundle.text,
      bucketKey: originBundle.bucketKey
    };
  }

  function lookupPredictionGroup(schedule, originId, periodDate, historyConfig, ignoreOverrides) {
    const origin = describeServer(schedule, Number(originId));
    const group = predictionGroup(schedule, Number(originId), periodDate, historyConfig, ignoreOverrides);
    if (!origin || !group) return { error: "UNKNOWN_SERVER" };
    const furnace = detectFurnace(schedule, Number(originId), dateToSerial(addDays(periodDate, historyDisplayOffset(historyConfig))));
    return {
      origin: origin,
      furnace: furnace,
      group: group,
      progressText: group.progressText,
      older: { server: group.lo, range: group.lo + "~" + group.hi, daysRounded: 0 },
      newer: { server: group.hi, range: group.lo + "~" + group.hi, daysRounded: 0 }
    };
  }

  function buildSchedule(options) {
    const input = options && typeof options === "object" ? options : {};
    const intervalDays = Math.max(1, Math.min(60, Math.round(Number(input.intervalDays) || DEFAULT_INTERVAL_DAYS)));
    const labels = Array.isArray(input.ranges) && input.ranges.length ? input.ranges : DEFAULT_RANGES;
    const ranges = [];
    for (let i = 0; i < labels.length; i++) {
      const parsed = parseRangeLabel(labels[i]);
      if (parsed) ranges.push(parsed);
    }
    const explicitDates = Array.isArray(input.rangeStartDates) ? input.rangeStartDates : [];
    const anchorDate = isIsoDate(input.anchorDate) ? input.anchorDate : DEFAULT_FC5_ANCHOR;
    const startSerials = ranges.map(function (_range, index) {
      const iso = explicitDates[index];
      if (isIsoDate(iso)) return dateToSerial(iso);
      return dateToSerial(anchorDate) + index * intervalDays;
    });
    return overlayFurnaceSerials({
      intervalDays: intervalDays,
      ranges: ranges,
      startSerials: startSerials,
      anchorDate: anchorDate
    }, input);
  }

  function applyNeighborProgress(payload) {
    const neighbor = payload && typeof payload === "object" ? payload : {};
    const fc5 = findStage(neighbor.stages, "FC5");
    return overlayFurnaceSerials(buildSchedule({
      ranges: neighbor.ranges,
      intervalDays: neighbor.intervalDays,
      rangeStartDates: fc5 && fc5.dates,
      anchorDate: fc5 && (isIsoDate(fc5.anchorDate) ? fc5.anchorDate : fc5.dates && fc5.dates[0])
    }), neighbor);
  }

  function findRangeIndex(schedule, serverId) {
    if (!schedule || !Number.isFinite(serverId)) return -1;
    for (let i = 0; i < schedule.ranges.length; i++) {
      const range = schedule.ranges[i];
      if (serverId >= range.lo && serverId <= range.hi) return i;
    }
    return -1;
  }

  function interpolateSerials(schedule, serverId, serials) {
    const index = findRangeIndex(schedule, serverId);
    if (index < 0 || !serials || !Number.isFinite(serials[index])) return null;
    const range = schedule.ranges[index];
    const start = serials[index];
    let nextLo = range.hi + 1;
    let nextStart = start + schedule.intervalDays;
    if (index + 1 < schedule.ranges.length && Number.isFinite(serials[index + 1])) {
      nextLo = schedule.ranges[index + 1].lo;
      nextStart = serials[index + 1];
    }
    const span = nextLo - range.lo;
    if (span <= 0) return start;
    return start + ((serverId - range.lo) / span) * (nextStart - start);
  }

  function serverFc5Serial(schedule, serverId) {
    if (schedule && schedule.furnaceSerials && schedule.furnaceSerials.FC5) {
      return interpolateSerials(schedule, serverId, schedule.furnaceSerials.FC5);
    }
    return interpolateSerials(schedule, serverId, schedule.startSerials);
  }

  function serverStageSerial(schedule, serverId, key) {
    const serials = schedule && schedule.furnaceSerials && schedule.furnaceSerials[key];
    if (serials) return interpolateSerials(schedule, serverId, serials);
    const fc5 = serverFc5Serial(schedule, serverId);
    if (fc5 == null) return null;
    return fc5 + (FURNACE_OFFSETS[key] || 0);
  }

  function serverOpenSerial(schedule, serverId) {
    const fc5 = serverFc5Serial(schedule, serverId);
    if (fc5 == null) return null;
    return fc5 - FC5_FROM_OPEN_DAYS;
  }

  function describeServer(schedule, serverId) {
    const index = findRangeIndex(schedule, serverId);
    const fc5Serial = serverFc5Serial(schedule, serverId);
    const serial = serverOpenSerial(schedule, serverId);
    if (index < 0 || serial == null) return null;
    return {
      server: serverId,
      rangeIndex: index,
      range: schedule.ranges[index].label,
      serial: serial,
      date: serialToDateStr(serial),
      fc5Serial: fc5Serial,
      fc5Date: serialToDateStr(fc5Serial)
    };
  }

  function detectFurnace(schedule, serverId, asOfSerial) {
    const index = findRangeIndex(schedule, serverId);
    const serial = Number.isFinite(asOfSerial) ? asOfSerial : dateToSerial(todayIso());
    const fc5 = serverStageSerial(schedule, serverId, "FC5");
    const fc8 = serverStageSerial(schedule, serverId, "FC8");
    const fc10 = serverStageSerial(schedule, serverId, "FC10");
    let key = "PRE";
    if (Number.isFinite(fc10) && fc10 <= serial) key = "FC10";
    else if (Number.isFinite(fc8) && fc8 <= serial) key = "FC8";
    else if (Number.isFinite(fc5) && fc5 <= serial) key = "FC5";
    const furnace = furnaceByKey(key);
    return {
      key: furnace.key,
      name: furnace.name,
      days: furnace.days,
      rangeIndex: index,
      asOfSerial: serial,
      asOfDate: serialToDateStr(serial),
      fc5Date: serialToDateStr(fc5),
      openDate: serialToDateStr(serverOpenSerial(schedule, serverId))
    };
  }

  function destCap(schedule, toId, asOfSerial, spanDays) {
    if (!Number.isFinite(asOfSerial)) return spanDays;
    const dest = detectFurnace(schedule, toId, asOfSerial);
    return Math.min(Number(spanDays) || 0, dest.days || 0);
  }

  function canReachByAge(originSerial, toSerial, towardOlder, cap) {
    if (toSerial == null || !Number.isFinite(cap) || cap < 0) return false;
    const delta = towardOlder ? originSerial - toSerial : toSerial - originSerial;
    return delta <= cap;
  }

  function farthestOlder(schedule, originId, originSerial, spanDays, asOfSerial) {
    const originIdx = findRangeIndex(schedule, originId);
    let answer = originId;
    for (let idx = originIdx; idx >= 0; idx--) {
      const range = schedule.ranges[idx];
      const oldestSerial = serverOpenSerial(schedule, range.lo);
      const oldestCap = destCap(schedule, range.lo, asOfSerial, spanDays);
      if (canReachByAge(originSerial, oldestSerial, true, oldestCap)) {
        answer = range.lo;
        continue;
      }
      const high = idx === originIdx ? originId : range.hi;
      let low = range.lo;
      let highBound = high;
      let found = null;
      while (low <= highBound) {
        const mid = (low + highBound) >> 1;
        const serial = serverOpenSerial(schedule, mid);
        const cap = destCap(schedule, mid, asOfSerial, spanDays);
        if (canReachByAge(originSerial, serial, true, cap)) {
          found = mid;
          highBound = mid - 1;
        } else {
          low = mid + 1;
        }
      }
      if (found != null) answer = found;
      break;
    }
    return answer;
  }

  function farthestNewer(schedule, originId, originSerial, spanDays, asOfSerial) {
    const originIdx = findRangeIndex(schedule, originId);
    let answer = originId;
    for (let idx = originIdx; idx < schedule.ranges.length; idx++) {
      const range = schedule.ranges[idx];
      const newestSerial = serverOpenSerial(schedule, range.hi);
      const newestCap = destCap(schedule, range.hi, asOfSerial, spanDays);
      if (canReachByAge(originSerial, newestSerial, false, newestCap)) {
        answer = range.hi;
        continue;
      }
      const lowStart = idx === originIdx ? originId : range.lo;
      let low = lowStart;
      let highBound = range.hi;
      let found = null;
      while (low <= highBound) {
        const mid = (low + highBound) >> 1;
        const serial = serverOpenSerial(schedule, mid);
        const cap = destCap(schedule, mid, asOfSerial, spanDays);
        if (canReachByAge(originSerial, serial, false, cap)) {
          found = mid;
          low = mid + 1;
        } else {
          highBound = mid - 1;
        }
      }
      if (found != null) answer = found;
      break;
    }
    return answer;
  }

  function attachReach(schedule, originSerial, serverId, towardOlder) {
    const described = describeServer(schedule, serverId);
    if (!described) return null;
    const delta = towardOlder ? originSerial - described.serial : described.serial - originSerial;
    described.days = Math.max(0, delta);
    described.daysRounded = Math.round(described.days);
    return described;
  }

  function lookup(schedule, originId, spanDays, asOfDate) {
    const origin = Number(originId);
    const span = Number(spanDays);
    const originSerial = serverOpenSerial(schedule, origin);
    if (originSerial == null || !Number.isFinite(span)) {
      return { error: "UNKNOWN_SERVER" };
    }
    const asOfSerial = isIsoDate(asOfDate) ? dateToSerial(asOfDate) : undefined;
    const olderId = farthestOlder(schedule, origin, originSerial, span, asOfSerial);
    const newerId = farthestNewer(schedule, origin, originSerial, span, asOfSerial);
    return {
      origin: describeServer(schedule, origin),
      hops: theoreticalHops(span, schedule.intervalDays),
      remainderDays: remainderDays(span, schedule.intervalDays),
      older: attachReach(schedule, originSerial, olderId, true),
      newer: attachReach(schedule, originSerial, newerId, false)
    };
  }

  function lookupCurrent(schedule, originId, asOfDate) {
    const asOf = isIsoDate(asOfDate) ? asOfDate : todayIso();
    const furnace = detectFurnace(schedule, Number(originId), dateToSerial(asOf));
    const result = lookup(schedule, originId, furnace.days);
    result.furnace = furnace;
    return result;
  }

  function lookupAll(schedule, originId) {
    return FURNACE_SPANS.map(function (furnace) {
      const result = lookup(schedule, originId, furnace.days);
      result.furnace = furnace;
      return result;
    });
  }

  function compareTarget(schedule, originId, targetId) {
    const origin = describeServer(schedule, Number(originId));
    const target = describeServer(schedule, Number(targetId));
    if (!origin || !target) return { error: "UNKNOWN_SERVER" };
    const delta = target.serial - origin.serial;
    const days = Math.abs(delta);
    const reachable = {};
    FURNACE_SPANS.forEach(function (furnace) {
      reachable[furnace.key] = days <= furnace.days;
    });
    return {
      origin: origin,
      target: target,
      days: days,
      daysRounded: Math.round(days),
      direction: delta < 0 ? "older" : delta > 0 ? "newer" : "same",
      reachable: reachable
    };
  }

  function enabledHistoryDates(historyConfig) {
    const raw = historyConfig && typeof historyConfig === "object" ? historyConfig : {};
    const source = Array.isArray(historyConfig)
      ? historyConfig
      : (Array.isArray(raw.dates) ? raw.dates : DEFAULT_HISTORY_DATES);
    const seen = {};
    const dates = [];
    for (let i = 0; i < source.length; i++) {
      const item = source[i];
      const date = typeof item === "string" ? item : String(item && item.date || "");
      const enabled = typeof item === "string" ? true : item && item.enabled !== false;
      if (!enabled || !isIsoDate(date) || seen[date]) continue;
      seen[date] = true;
      dates.push(date);
    }
    dates.sort();
    return dates.length ? dates : DEFAULT_HISTORY_DATES.slice();
  }

  function historyIntervalDays(historyConfig) {
    const raw = historyConfig && typeof historyConfig === "object" && !Array.isArray(historyConfig)
      ? historyConfig
      : {};
    const interval = Math.round(Number(raw.intervalDays) || DEFAULT_HISTORY_INTERVAL_DAYS);
    return Math.max(1, Math.min(90, interval));
  }

  function historyDisplayOffset(historyConfig) {
    const raw = historyConfig && typeof historyConfig === "object" && !Array.isArray(historyConfig)
      ? historyConfig
      : {};
    const rules = raw.rules && typeof raw.rules === "object" ? raw.rules : {};
    const offset = Math.round(Number(rules.displayOffsetDays));
    if (!Number.isFinite(offset)) return DEFAULT_DISPLAY_OFFSET_DAYS;
    return Math.max(0, Math.min(7, offset));
  }

  function forecastDatesFromHistory(markStrs, count, intervalDays) {
    const dates = Array.isArray(markStrs) ? markStrs.filter(isIsoDate) : [];
    const extra = Math.max(1, Math.min(40, Number(count) || 12));
    const step = Math.max(1, Math.min(90, Math.round(Number(intervalDays) || DEFAULT_HISTORY_INTERVAL_DAYS)));
    if (!dates.length) return { dates: [], step: step };
    const last = dates[dates.length - 1];
    const out = [];
    for (let i = 1; i <= extra; i++) out.push(addDays(last, i * step));
    return { dates: out, step: step };
  }

  function upcomingImmigrationDates(historyConfig, asOfDate, extraCount) {
    const asOf = isIsoDate(asOfDate) ? asOfDate : todayIso();
    const extra = Math.max(1, Math.min(40, Number(extraCount) || MAX_HOP_PERIODS));
    const interval = historyIntervalDays(historyConfig);
    const offset = historyDisplayOffset(historyConfig);
    const history = enabledHistoryDates(historyConfig);
    const forecast = forecastDatesFromHistory(history, extra, interval);
    const seen = {};
    const items = [];
    function push(date, kind) {
      if (!isIsoDate(date) || seen[date]) return;
      seen[date] = true;
      items.push({
        date: date,
        displayDate: addDays(date, offset),
        kind: kind
      });
    }
    history.forEach(function (date) { push(date, "history"); });
    forecast.dates.forEach(function (date) { push(date, "forecast"); });
    items.sort(function (a, b) { return a.date.localeCompare(b.date); });
    return items.filter(function (item) {
      return item.displayDate >= asOf;
    }).slice(0, extra);
  }

  function periodLabel(index) {
    if (index === 0) return "下期";
    if (index === 1) return "下下期";
    return "第" + (index + 1) + "期";
  }

  function hopToward(looked, direction, targetId) {
    if (!looked || looked.error) return null;
    if (direction === "older") {
      if (!looked.older) return null;
      return looked.older.server <= targetId ? targetId : looked.older.server;
    }
    if (!looked.newer) return null;
    return looked.newer.server >= targetId ? targetId : looked.newer.server;
  }

  function planHopsToTarget(schedule, originId, targetId, options) {
    const input = options && typeof options === "object" ? options : {};
    const compared = compareTarget(schedule, originId, targetId);
    if (compared.error) return compared;
    const asOf = isIsoDate(input.asOfDate) ? input.asOfDate : todayIso();
    const furnaceNow = detectFurnace(schedule, Number(originId), dateToSerial(asOf));
    if (compared.direction === "same") {
      return {
        origin: compared.origin,
        target: compared.target,
        direction: "same",
        days: 0,
        daysRounded: 0,
        furnaceNow: furnaceNow,
        steps: [],
        reached: true,
        alreadyThere: true
      };
    }
    const windowed = lookup(schedule, Number(originId), furnaceNow.days);
    const towardNewer = compared.direction === "newer";
    const capServer = towardNewer
      ? (windowed.newer && windowed.newer.server)
      : (windowed.older && windowed.older.server);
    const targetBeyondCap = towardNewer
      ? Number(targetId) > capServer
      : Number(targetId) < capServer;
    const dates = Array.isArray(input.dates) && input.dates.length
      ? input.dates
      : upcomingImmigrationDates(input.historyConfig, asOf, input.extraCount);
    const steps = [];
    let reached = false;
    let stuck = false;
    const originNum = Number(originId);
    const targetNum = Number(targetId);
    let pos = originNum;
    let bestToward = originNum;
    for (let i = 0; i < dates.length && steps.length < MAX_HOP_PERIODS; i++) {
      const period = dates[i];
      const openDate = isIsoDate(period && period.date) ? period.date : period;
      if (!isIsoDate(openDate)) continue;
      const grouped = lookupPredictionGroup(schedule, pos, openDate, input.historyConfig, true);
      if (grouped.error || !grouped.group) {
        stuck = true;
        break;
      }
      const group = grouped.group;
      const inGroup = targetNum >= group.lo && targetNum <= group.hi;
      const edge = towardNewer ? group.hi : group.lo;
      let dest = inGroup ? targetNum : edge;
      if (towardNewer && dest < pos) dest = pos;
      if (!towardNewer && dest > pos) dest = pos;
      const overCap = towardNewer ? dest > capServer : dest < capServer;
      const farthest = inGroup && !overCap ? targetNum : dest;
      const extended = towardNewer ? farthest > bestToward : farthest < bestToward;
      if (steps.length && !inGroup && !extended) continue;
      if (extended) bestToward = farthest;
      steps.push({
        index: steps.length,
        label: periodLabel(steps.length),
        date: openDate,
        displayDate: openDate,
        kind: period && period.kind ? period.kind : "forecast",
        from: pos,
        to: farthest,
        fromInfo: grouped.origin,
        toInfo: describeServer(schedule, farthest),
        furnace: grouped.furnace,
        spanDays: grouped.furnace && grouped.furnace.days,
        group: group,
        capServer: capServer,
        overCap: overCap,
        reached: inGroup && !overCap,
        moved: farthest !== pos
      });
      pos = farthest;
      if (inGroup && !overCap) {
        reached = true;
        break;
      }
    }
    if (!reached) stuck = true;
    return {
      origin: compared.origin,
      target: compared.target,
      direction: compared.direction,
      days: compared.days,
      daysRounded: compared.daysRounded,
      furnaceNow: furnaceNow,
      capServer: capServer,
      steps: steps,
      reached: reached,
      stuck: stuck,
      beyondSpan: targetBeyondCap,
      alreadyThere: false
    };
  }

  return {
    DAY: DAY,
    DEFAULT_INTERVAL_DAYS: DEFAULT_INTERVAL_DAYS,
    DEFAULT_FC5_ANCHOR: DEFAULT_FC5_ANCHOR,
    DEFAULT_HISTORY_INTERVAL_DAYS: DEFAULT_HISTORY_INTERVAL_DAYS,
    DEFAULT_DISPLAY_OFFSET_DAYS: DEFAULT_DISPLAY_OFFSET_DAYS,
    DEFAULT_HISTORY_DATES: DEFAULT_HISTORY_DATES,
    DEFAULT_RANGES: DEFAULT_RANGES,
    FC5_FROM_OPEN_DAYS: FC5_FROM_OPEN_DAYS,
    FURNACE_SPANS: FURNACE_SPANS,
    FURNACE_OFFSETS: FURNACE_OFFSETS,
    PRE_FURNACE: PRE_FURNACE,
    isIsoDate: isIsoDate,
    dateToSerial: dateToSerial,
    serialToDateStr: serialToDateStr,
    addDays: addDays,
    todayIso: todayIso,
    parseRangeLabel: parseRangeLabel,
    theoreticalHops: theoreticalHops,
    remainderDays: remainderDays,
    formatHops: formatHops,
    buildSchedule: buildSchedule,
    applyNeighborProgress: applyNeighborProgress,
    findRangeIndex: findRangeIndex,
    serverFc5Serial: serverFc5Serial,
    serverStageSerial: serverStageSerial,
    serverOpenSerial: serverOpenSerial,
    describeServer: describeServer,
    detectFurnace: detectFurnace,
    predictionGroup: predictionGroup,
    lookupPredictionGroup: lookupPredictionGroup,
    lookup: lookup,
    lookupCurrent: lookupCurrent,
    lookupAll: lookupAll,
    compareTarget: compareTarget,
    forecastDatesFromHistory: forecastDatesFromHistory,
    upcomingImmigrationDates: upcomingImmigrationDates,
    periodLabel: periodLabel,
    planHopsToTarget: planHopsToTarget
  };
});
