'use strict';

const DAY_MS = 86400000;
const MAX_RENDER_UNITS = 2000;
const SCHEDULE_TYPES = new Set(['single', 'continuous', 'recurring', 'composite', 'date-list']);
const COMPOSITE_LAYOUTS = new Set(['gantt', 'daily-list']);
const CHILD_COLOR_MODES = new Set(['uniform', 'random', 'custom']);
const DATE_MODES = new Set(['all-span', 'relative-range', 'selected-days', 'recurring']);
const RECURRENCE_UNITS = new Set(['day', 'week', 'month']);
const RECURRENCE_END_TYPES = new Set(['never', 'until', 'count']);

function parseDate(value) {
  const text = String(value || '');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new Error('BAD_DATE');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('BAD_DATE');
  }
  return date;
}

function formatDate(value) {
  const date = value instanceof Date ? value : parseDate(value);
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function addDays(value, amount) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + Number(amount || 0));
  return formatDate(date);
}

function compareDates(a, b) {
  return parseDate(a).getTime() - parseDate(b).getTime();
}

function diffDays(a, b) {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / DAY_MS);
}

function inclusiveDays(start, end) {
  const days = diffDays(start, end) + 1;
  if (days < 1) throw new Error('BAD_DATE_RANGE');
  return days;
}

function startOfIsoWeek(value) {
  const date = parseDate(value);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return formatDate(date);
}

function getIsoWeek(value) {
  const date = parseDate(value);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const weekYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / DAY_MS) + 1) / 7);
  return { weekYear, week };
}

function addMonthsToMonth(year, monthIndex, amount) {
  const total = year * 12 + monthIndex + amount;
  return { year: Math.floor(total / 12), monthIndex: ((total % 12) + 12) % 12 };
}

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function getNavigationBounds(todayValue) {
  const today = parseDate(todayValue);
  const year = today.getUTCFullYear();
  const monthIndex = today.getUTCMonth();
  const day = today.getUTCDate();
  const boundedDate = (targetYear) => `${targetYear}-${String(monthIndex + 1).padStart(2, '0')}-${String(Math.min(day, daysInMonth(targetYear, monthIndex))).padStart(2, '0')}`;
  return {
    earliestMonth: `${year - 1}-${String(monthIndex + 1).padStart(2, '0')}`,
    latestMonth: `${year + 1}-${String(monthIndex + 1).padStart(2, '0')}`,
    earliestDate: boundedDate(year - 1),
    latestDate: boundedDate(year + 1)
  };
}

function uniqueSortedNumbers(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(Number).filter(Number.isInteger))).sort((a, b) => a - b);
}

function normalizeColor(value) {
  const color = String(value || '').trim();
  if (!color) return null;
  if (!/^#[0-9a-f]{6}$/i.test(color)) return undefined;
  return color.toLowerCase();
}

function activityColor(name) {
  const text = String(name || '').trim().toLowerCase();
  if (!text) return '#e8c9a0';
  let hash = 2166136261;
  for (const character of text) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  hash >>>= 0;
  const hue = hash % 360;
  const saturation = 58 + ((hash >>> 8) % 13);
  const lightness = 72 + ((hash >>> 16) % 7);
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const match = l - chroma / 2;
  let red = 0;
  let green = 0;
  let blue = 0;
  if (hue < 60) [red, green, blue] = [chroma, x, 0];
  else if (hue < 120) [red, green, blue] = [x, chroma, 0];
  else if (hue < 180) [red, green, blue] = [0, chroma, x];
  else if (hue < 240) [red, green, blue] = [0, x, chroma];
  else if (hue < 300) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];
  return `#${[red, green, blue].map((value) => Math.round((value + match) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function normalizeRecurrence(source, prefix) {
  const get = (camel) => {
    const prefixed = source[`${prefix || ''}${camel}`];
    if (prefixed !== undefined) return prefixed;
    const plain = camel.charAt(0).toLowerCase() + camel.slice(1);
    return source[plain];
  };
  const unit = String(get('Unit') || '').trim();
  const interval = Number(get('Interval'));
  const endType = String(get('EndType') || '').trim();
  if (!RECURRENCE_UNITS.has(unit) || !Number.isInteger(interval) || interval < 1 || interval > 365 || !RECURRENCE_END_TYPES.has(endType)) {
    return { error: 'BAD_RECURRENCE' };
  }
  const weekdays = uniqueSortedNumbers(get('Weekdays'));
  const monthDay = get('MonthDay') === null || get('MonthDay') === undefined || get('MonthDay') === '' ? null : Number(get('MonthDay'));
  if (unit === 'week' && (!weekdays.length || weekdays.some((day) => day < 1 || day > 7))) return { error: 'BAD_RECURRENCE' };
  if (unit !== 'week' && weekdays.length) return { error: 'BAD_RECURRENCE' };
  if (unit === 'month' && (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31)) return { error: 'BAD_RECURRENCE' };
  if (unit !== 'month' && monthDay !== null) return { error: 'BAD_RECURRENCE' };
  const until = get('Until') || null;
  const count = get('Count') === null || get('Count') === undefined || get('Count') === '' ? null : Number(get('Count'));
  if (endType === 'until') {
    try { parseDate(until); } catch (_error) { return { error: 'BAD_RECURRENCE' }; }
    if (count !== null) return { error: 'BAD_RECURRENCE' };
  } else if (endType === 'count') {
    if (!Number.isInteger(count) || count < 1 || count > 500 || until) return { error: 'BAD_RECURRENCE' };
  } else if (until || count !== null) {
    return { error: 'BAD_RECURRENCE' };
  }
  return { value: { unit, interval, weekdays, monthDay, endType, until, count } };
}

function normalizeItemPayload(item, parentDays) {
  const source = item || {};
  const name = String(source.name || '').trim();
  if (!name || name.length > 120) return { error: 'BAD_NAME' };
  if (String(source.description || '').trim().length > 1000) return { error: 'BAD_DESCRIPTION' };
  const dateMode = String(source.dateMode || '').trim();
  if (!DATE_MODES.has(dateMode)) return { error: 'BAD_ITEM_MODE' };
  const color = normalizeColor(source.color);
  if (color === undefined) return { error: 'BAD_COLOR' };
  const value = {
    id: source.id === undefined || source.id === null || source.id === '' ? null : Number(source.id),
    name,
    description: String(source.description || '').trim(),
    color,
    sortOrder: Number.isInteger(Number(source.sortOrder)) ? Number(source.sortOrder) : 0,
    highlighted: source.highlighted === true,
    enabled: source.enabled !== false,
    dateMode,
    startOffsetDays: null,
    endOffsetDays: null,
    selectedOffsets: [],
    durationDays: null,
    startTime: String(source.startTime || '').trim(),
    endTime: String(source.endTime || '').trim()
  };
  if (dateMode === 'relative-range') {
    value.startOffsetDays = Number(source.startOffsetDays);
    value.endOffsetDays = Number(source.endOffsetDays);
    if (!Number.isInteger(value.startOffsetDays) || !Number.isInteger(value.endOffsetDays) || value.startOffsetDays < 0 || value.endOffsetDays < value.startOffsetDays || value.endOffsetDays >= parentDays) {
      return { error: 'BAD_ITEM_OFFSET' };
    }
  } else if (dateMode === 'selected-days') {
    value.selectedOffsets = uniqueSortedNumbers(source.selectedOffsets);
    if (!value.selectedOffsets.length || value.selectedOffsets.some((offset) => offset < 0 || offset >= parentDays)) return { error: 'BAD_ITEM_OFFSET' };
  } else if (dateMode === 'recurring') {
    value.durationDays = Number(source.durationDays);
    if (!Number.isInteger(value.durationDays) || value.durationDays < 1 || value.durationDays > parentDays) return { error: 'BAD_RECURRENCE' };
    const recurrence = normalizeRecurrence(source, 'recurrence');
    if (recurrence.error) return recurrence;
    value.recurrence = recurrence.value;
    if (recurrence.value.endType === 'until') {
      const offset = Number(source.recurrenceUntilOffset);
      if (!Number.isInteger(offset) || offset < 0 || offset >= parentDays) return { error: 'BAD_RECURRENCE' };
      value.recurrence.untilOffset = offset;
      value.recurrence.until = null;
    }
  }
  if (!validTimeRange(value.startTime, value.endTime)) return { error: 'BAD_TIME' };
  return { value };
}

function validTimeRange(startTime, endTime) {
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (startTime && !timePattern.test(startTime)) return false;
  if (endTime && !timePattern.test(endTime)) return false;
  if (startTime && endTime && endTime <= startTime) return false;
  return true;
}

function normalizeSchedulePayload(payload) {
  const source = payload || {};
  const name = String(source.name || '').trim();
  if (!name || name.length > 120) return { error: 'BAD_NAME' };
  const categoryId = Number(source.categoryId);
  if (!Number.isInteger(categoryId) || categoryId < 1) return { error: 'BAD_CATEGORY' };
  const scheduleType = String(source.scheduleType || '').trim();
  if (!SCHEDULE_TYPES.has(scheduleType)) return { error: 'BAD_SCHEDULE_TYPE' };
  try { parseDate(source.startDate); } catch (_error) { return { error: 'BAD_DATE' }; }
  const endDate = source.endDate || source.startDate;
  let durationDays;
  try { durationDays = inclusiveDays(source.startDate, endDate); } catch (_error) { return { error: 'BAD_DATE_RANGE' }; }
  if (durationDays > 366) return { error: 'BAD_DURATION' };
  const description = String(source.description || '').trim();
  if (description.length > 2000) return { error: 'BAD_DESCRIPTION' };
  const color = normalizeColor(source.color);
  if (color === undefined) return { error: 'BAD_COLOR' };
  const value = {
    categoryId,
    name,
    scheduleType,
    compositeLayout: null,
    childColorMode: 'random',
    startDate: source.startDate,
    endDate,
    startTime: String(source.startTime || '').trim(),
    endTime: String(source.endTime || '').trim(),
    color,
    description,
    sortOrder: Number.isInteger(Number(source.sortOrder)) ? Number(source.sortOrder) : 0,
    fontBold: source.fontBold === true,
    enabled: source.enabled !== false,
    items: []
  };
  if (!validTimeRange(value.startTime, value.endTime)) return { error: 'BAD_TIME' };
  if (scheduleType === 'single') value.endDate = value.startDate;
  if (scheduleType === 'date-list') {
    const dates = Array.from(new Set((Array.isArray(source.legacyDates) ? source.legacyDates : []).map(String)));
    if (!dates.length || dates.length > 366) return { error: 'BAD_DATES' };
    try { dates.forEach(parseDate); } catch (_error) { return { error: 'BAD_DATE' }; }
    dates.sort(compareDates);
    value.legacyDates = dates;
    value.startDate = dates[0];
    value.endDate = dates[dates.length - 1];
  }
  if (source.recurrenceUnit || source.recurrence && source.recurrence.unit) {
    const recurrence = normalizeRecurrence(source, 'recurrence');
    if (recurrence.error) return recurrence;
    value.recurrence = recurrence.value;
    value.recurrenceUnit = recurrence.value.unit;
    value.recurrenceInterval = recurrence.value.interval;
    value.weekdays = recurrence.value.weekdays;
    value.monthDay = recurrence.value.monthDay;
    value.recurrenceEndType = recurrence.value.endType;
    value.recurrenceUntil = recurrence.value.until;
    value.recurrenceCount = recurrence.value.count;
    if (recurrence.value.endType === 'until' && compareDates(recurrence.value.until, value.startDate) < 0) return { error: 'BAD_RECURRENCE' };
  }
  if (scheduleType === 'composite') {
    value.compositeLayout = String(source.compositeLayout || 'gantt');
    if (!COMPOSITE_LAYOUTS.has(value.compositeLayout)) return { error: 'BAD_COMPOSITE_LAYOUT' };
    value.childColorMode = String(source.childColorMode || 'random');
    if (!CHILD_COLOR_MODES.has(value.childColorMode)) return { error: 'BAD_CHILD_COLOR_MODE' };
    const parentDays = inclusiveDays(value.startDate, value.endDate);
    const items = Array.isArray(source.items) ? source.items : [];
    if (items.length > 100) return { error: 'TOO_MANY_ITEMS' };
    for (const item of items) {
      const normalized = normalizeItemPayload(item, parentDays);
      if (normalized.error) return normalized;
      value.items.push(normalized.value);
    }
    if (!value.items.some((item) => item.enabled)) return { error: 'ITEMS_REQUIRED' };
  }
  return { value };
}

function recurrenceConfig(definition) {
  if (definition.recurrence) return definition.recurrence;
  return {
    unit: definition.recurrenceUnit,
    interval: Number(definition.recurrenceInterval || 1),
    weekdays: uniqueSortedNumbers(definition.weekdays),
    monthDay: definition.monthDay === null || definition.monthDay === undefined ? null : Number(definition.monthDay),
    endType: definition.recurrenceEndType || 'never',
    until: definition.recurrenceUntil || null,
    count: definition.recurrenceCount === null || definition.recurrenceCount === undefined ? null : Number(definition.recurrenceCount)
  };
}

function occurrenceStarts(definition, hardEnd, hardStart) {
  const startDate = definition.startDate;
  const type = definition.scheduleType;
  if (!(definition.recurrence || definition.recurrenceUnit) && type !== 'recurring') return [startDate];
  const config = recurrenceConfig(definition);
  const starts = [];
  const until = config.endType === 'until' && config.until && compareDates(config.until, hardEnd) < 0 ? config.until : hardEnd;
  let produced = 0;
  const accept = (date) => {
    if (compareDates(date, startDate) < 0 || compareDates(date, until) > 0) return false;
    starts.push(date);
    produced += 1;
    return config.endType === 'count' && produced >= config.count;
  };
  if (config.endType === 'never' && hardStart && compareDates(hardStart, startDate) < 0) {
    if (config.unit === 'day') {
      for (let date = addDays(startDate, -config.interval); compareDates(date, hardStart) >= 0; date = addDays(date, -config.interval)) starts.push(date);
    } else if (config.unit === 'week') {
      const anchorWeek = startOfIsoWeek(startDate);
      for (let date = hardStart; compareDates(date, startDate) < 0; date = addDays(date, 1)) {
        const weekIndex = Math.floor(diffDays(anchorWeek, startOfIsoWeek(date)) / 7);
        const weekday = parseDate(date).getUTCDay() || 7;
        if (weekIndex % config.interval === 0 && config.weekdays.includes(weekday)) starts.push(date);
      }
    } else if (config.unit === 'month') {
      const anchor = parseDate(startDate);
      const first = parseDate(hardStart);
      const firstIndex = (first.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + first.getUTCMonth() - anchor.getUTCMonth();
      for (let index = firstIndex; index < 0; index += 1) {
        if (index % config.interval !== 0) continue;
        const month = addMonthsToMonth(anchor.getUTCFullYear(), anchor.getUTCMonth(), index);
        if (config.monthDay > daysInMonth(month.year, month.monthIndex)) continue;
        const date = `${month.year}-${String(month.monthIndex + 1).padStart(2, '0')}-${String(config.monthDay).padStart(2, '0')}`;
        if (compareDates(date, hardStart) >= 0 && compareDates(date, startDate) < 0) starts.push(date);
      }
    }
  }
  if (config.unit === 'day') {
    for (let date = startDate; compareDates(date, until) <= 0; date = addDays(date, config.interval)) {
      if (accept(date)) break;
    }
  } else if (config.unit === 'week') {
    const anchorWeek = startOfIsoWeek(startDate);
    for (let date = startDate; compareDates(date, until) <= 0; date = addDays(date, 1)) {
      const weekIndex = Math.floor(diffDays(anchorWeek, startOfIsoWeek(date)) / 7);
      const weekday = parseDate(date).getUTCDay() || 7;
      if (weekIndex >= 0 && weekIndex % config.interval === 0 && config.weekdays.includes(weekday) && accept(date)) break;
    }
  } else if (config.unit === 'month') {
    const anchor = parseDate(startDate);
    for (let index = 0; index < 2400; index += config.interval) {
      const month = addMonthsToMonth(anchor.getUTCFullYear(), anchor.getUTCMonth(), index);
      if (config.monthDay <= daysInMonth(month.year, month.monthIndex)) {
        const date = `${month.year}-${String(month.monthIndex + 1).padStart(2, '0')}-${String(config.monthDay).padStart(2, '0')}`;
        if (compareDates(date, until) > 0) break;
        if (compareDates(date, startDate) >= 0 && accept(date)) break;
      }
    }
  }
  return starts;
}

function intersects(start, end, from, to) {
  return compareDates(end, from) >= 0 && compareDates(start, to) <= 0;
}

function effectiveColor(item, definition) {
  return item && item.color || definition.color || activityColor(item && item.name || definition.name);
}

function baseOccurrence(definition, startDate, endDate) {
  const id = `${definition.id}:${startDate}`;
  return {
    id,
    scheduleId: Number(definition.id),
    originalId: definition.originalId || definition.legacyOriginalId || null,
    name: definition.name,
    startDate,
    endDate,
    startTime: definition.startTime || '',
    endTime: definition.endTime || '',
    color: effectiveColor(null, definition),
    description: definition.description || '',
    sortOrder: Number(definition.sortOrder || 0),
    fontBold: definition.fontBold === true,
    scheduleType: definition.scheduleType,
    category: definition.category || null,
    occurrenceDate: startDate,
    recurring: definition.scheduleType === 'recurring' || !!definition.recurrenceUnit || !!definition.recurrence
  };
}

function applyOccurrenceException(occurrence, definition) {
  const exceptions = Array.isArray(definition.exceptions) ? definition.exceptions : [];
  const future = exceptions.filter((item) => item.scope === 'future' && compareDates(item.occurrenceDate, occurrence.occurrenceDate) <= 0).sort((a, b) => compareDates(a.occurrenceDate, b.occurrenceDate)).pop();
  const single = exceptions.find((item) => item.scope === 'single' && item.occurrenceDate === occurrence.occurrenceDate);
  const override = single || future;
  if (!override) return occurrence;
  occurrence.name = override.name;
  occurrence.color = override.color || activityColor(override.name);
  occurrence.fontBold = override.fontBold === true;
  occurrence.enabled = override.enabled !== false;
  occurrence.exceptionScope = override.scope;
  return occurrence;
}

function groupOffsets(offsets) {
  const groups = [];
  for (const offset of uniqueSortedNumbers(offsets)) {
    const current = groups[groups.length - 1];
    if (current && offset === current[1] + 1) current[1] = offset;
    else groups.push([offset, offset]);
  }
  return groups;
}

function expandChildOccurrences(item, parentStart, parentEnd, parentOccurrenceId) {
  const ranges = [];
  if (item.dateMode === 'all-span') {
    ranges.push([parentStart, parentEnd]);
  } else if (item.dateMode === 'relative-range') {
    ranges.push([addDays(parentStart, item.startOffsetDays), addDays(parentStart, item.endOffsetDays)]);
  } else if (item.dateMode === 'selected-days') {
    for (const [start, end] of groupOffsets(item.selectedOffsets || [])) ranges.push([addDays(parentStart, start), addDays(parentStart, end)]);
  } else if (item.dateMode === 'recurring') {
    const config = recurrenceConfig(item);
    if (config.endType === 'until' && item.recurrence && Number.isInteger(item.recurrence.untilOffset)) {
      config.until = addDays(parentStart, item.recurrence.untilOffset);
    }
    const temp = {
      scheduleType: 'recurring',
      startDate: parentStart,
      endDate: addDays(parentStart, Number(item.durationDays || 1) - 1),
      recurrence: config
    };
    for (const childStart of occurrenceStarts(temp, parentEnd)) {
      const childEnd = addDays(childStart, Number(item.durationDays || 1) - 1);
      if (compareDates(childEnd, parentEnd) <= 0) ranges.push([childStart, childEnd]);
    }
  }
  return ranges.map(([startDate, endDate]) => ({
    id: `${parentOccurrenceId}:item:${item.id}:${startDate}`,
    itemId: Number(item.id),
    parentOccurrenceId,
    name: item.name,
    startDate,
    endDate,
    startTime: item.startTime || '',
    endTime: item.endTime || '',
    color: item.color || null,
    description: item.description || '',
    sortOrder: Number(item.sortOrder || 0),
    highlighted: item.highlighted === true
  }));
}

function expandDefinitions(definitions, options) {
  const from = options && options.from;
  const to = options && options.to;
  parseDate(from);
  parseDate(to);
  if (compareDates(from, to) > 0) throw new Error('BAD_DATE_RANGE');
  const maxUnits = Number(options && options.maxUnits || MAX_RENDER_UNITS);
  let units = 0;
  const schedules = [];
  const addUnits = (amount) => {
    units += amount;
    if (units > maxUnits) {
      const error = new Error('EXPANSION_LIMIT');
      error.code = 'EXPANSION_LIMIT';
      throw error;
    }
  };
  const includeDisabled = options && options.includeDisabled === true;
  for (const definition of Array.isArray(definitions) ? definitions : []) {
    if (definition.enabled === false && !includeDisabled) continue;
    if (definition.scheduleType === 'date-list') {
      const offsets = (definition.legacyDates || []).map((date) => diffDays(definition.startDate, date));
      for (const [startOffset, endOffset] of groupOffsets(offsets)) {
        const occurrenceStart = addDays(definition.startDate, startOffset);
        const occurrenceEnd = addDays(definition.startDate, endOffset);
        if (!intersects(occurrenceStart, occurrenceEnd, from, to)) continue;
        addUnits(1);
        const occurrence = applyOccurrenceException(baseOccurrence(definition, occurrenceStart, occurrenceEnd), definition);
        occurrence.enabled = occurrence.enabled === undefined ? definition.enabled !== false : occurrence.enabled;
        if (occurrence.enabled === false && !includeDisabled) continue;
        schedules.push(occurrence);
      }
      continue;
    }
    const duration = inclusiveDays(definition.startDate, definition.endDate || definition.startDate);
    for (const occurrenceStart of occurrenceStarts(definition, to, from)) {
      const occurrenceEnd = addDays(occurrenceStart, duration - 1);
      if (!intersects(occurrenceStart, occurrenceEnd, from, to)) continue;
      const occurrence = applyOccurrenceException(baseOccurrence(definition, occurrenceStart, occurrenceEnd), definition);
      occurrence.enabled = occurrence.enabled === undefined ? definition.enabled !== false : occurrence.enabled;
      if (occurrence.enabled === false && !includeDisabled) continue;
      if (definition.scheduleType !== 'composite') {
        addUnits(1);
        schedules.push(occurrence);
        continue;
      }
      occurrence.compositeLayout = definition.compositeLayout || 'gantt';
      occurrence.childColorMode = definition.childColorMode || 'random';
      const enabledItems = (definition.items || []).filter((item) => item.enabled !== false);
      const childOccurrences = [];
      for (const item of enabledItems) {
        const childColor = occurrence.childColorMode === 'uniform'
          ? occurrence.color
          : occurrence.childColorMode === 'custom'
            ? item.color || activityColor(item.name)
            : activityColor(item.name);
        for (const child of expandChildOccurrences(item, occurrenceStart, occurrenceEnd, occurrence.id)) {
          child.color = childColor;
          child.fontBold = occurrence.fontBold;
          childOccurrences.push(child);
        }
      }
      if (occurrence.compositeLayout === 'daily-list') {
        const allCards = [];
        for (const child of childOccurrences) {
          for (let date = child.startDate; compareDates(date, child.endDate) <= 0; date = addDays(date, 1)) {
            allCards.push({
              id: `${child.id}:day:${date}`,
              itemOccurrenceId: child.id,
              itemId: child.itemId,
              parentOccurrenceId: occurrence.id,
              name: child.name,
              date,
              startDate: date,
              endDate: date,
              startTime: child.startTime,
              endTime: child.endTime,
              color: child.color,
              description: child.description,
              sortOrder: child.sortOrder,
              highlighted: child.highlighted,
              fontBold: child.fontBold
            });
          }
        }
        allCards.sort((a, b) => compareDates(a.date, b.date) || a.sortOrder - b.sortOrder || a.itemId - b.itemId || a.id.localeCompare(b.id));
        const cards = allCards.filter((card) => compareDates(card.date, from) >= 0 && compareDates(card.date, to) <= 0);
        if (!cards.length) continue;
        occurrence.firstCardDate = allCards[0].date;
        occurrence.lastCardDate = allCards[allCards.length - 1].date;
        occurrence.cards = cards;
        addUnits(1 + cards.length);
      } else {
        occurrence.items = childOccurrences.filter((child) => intersects(child.startDate, child.endDate, from, to));
        if (!occurrence.items.length) continue;
        occurrence.items.sort((a, b) => a.sortOrder - b.sortOrder || compareDates(a.startDate, b.startDate) || compareDates(a.endDate, b.endDate) || a.id.localeCompare(b.id));
        addUnits(1 + occurrence.items.length);
      }
      schedules.push(occurrence);
    }
  }
  schedules.sort((a, b) => {
    const categoryOrder = Number(a.category && a.category.sortOrder || 0) - Number(b.category && b.category.sortOrder || 0);
    return categoryOrder || Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || compareDates(a.startDate, b.startDate) || compareDates(a.endDate, b.endDate) || a.id.localeCompare(b.id);
  });
  return { from, to, schedules, renderUnits: units };
}

module.exports = {
  MAX_RENDER_UNITS,
  parseDate,
  formatDate,
  addDays,
  compareDates,
  diffDays,
  inclusiveDays,
  startOfIsoWeek,
  getIsoWeek,
  getNavigationBounds,
  activityColor,
  normalizeSchedulePayload,
  normalizeItemPayload,
  expandDefinitions,
  groupOffsets
};
