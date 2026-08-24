'use strict';

const crypto = require('crypto');
const { addDays, diffDays, inclusiveDays } = require('./calendar-domain');

const SETTING_KEY = 'calendar_schedule_presets';
const MAX_PRESETS = 50;
const IDENTITY_KEYS = new Set(['id', 'originalId', 'legacyOriginalId', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt', 'category']);

function cloneWithoutIdentity(value) {
  if (Array.isArray(value)) return value.map(cloneWithoutIdentity);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (!IDENTITY_KEYS.has(key)) result[key] = cloneWithoutIdentity(child);
  }
  return result;
}

function safePresets(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && item.id && item.name && item.payload) : [];
}

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function createCalendarPresetService(dependencies) {
  const getSetting = dependencies.getSetting;
  const setSetting = dependencies.setSetting;
  const now = dependencies.now || (() => new Date());
  let queue = Promise.resolve();

  const read = async () => safePresets(await getSetting(SETTING_KEY, []));
  const mutate = (operation) => {
    const result = queue.then(async () => {
      const presets = await read();
      return operation(presets);
    });
    queue = result.catch(() => {});
    return result;
  };

  return {
    async list() {
      return (await read()).slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    },
    create(nameValue, payload) {
      return mutate(async (presets) => {
        const name = String(nameValue || '').trim();
        if (!name || name.length > 40) throw codedError('BAD_NAME');
        if (presets.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw codedError('PRESET_NAME_EXISTS');
        if (presets.length >= MAX_PRESETS) throw codedError('PRESET_LIMIT');
        const stamp = now().toISOString();
        const preset = { id: `preset_${crypto.randomBytes(16).toString('hex')}`, name, payload: cloneWithoutIdentity(payload || {}), createdAt: stamp, updatedAt: stamp };
        await setSetting(SETTING_KEY, presets.concat(preset));
        return preset;
      });
    },
    remove(id) {
      return mutate(async (presets) => {
        const next = presets.filter((item) => item.id !== id);
        if (next.length === presets.length) throw codedError('NOT_FOUND');
        await setSetting(SETTING_KEY, next);
        return true;
      });
    },
    apply(preset, today) {
      const payload = cloneWithoutIdentity(preset && preset.payload || {});
      if (payload.scheduleType === 'date-list' && Array.isArray(payload.legacyDates) && payload.legacyDates.length) {
        const shift = diffDays(payload.legacyDates[0], today);
        payload.legacyDates = payload.legacyDates.map((date) => addDays(date, shift));
        payload.startDate = payload.legacyDates[0];
        payload.endDate = payload.legacyDates[payload.legacyDates.length - 1];
      } else if (payload.startDate) {
        const duration = inclusiveDays(payload.startDate, payload.endDate || payload.startDate);
        payload.startDate = today;
        payload.endDate = addDays(today, duration - 1);
      }
      return payload;
    }
  };
}

module.exports = { SETTING_KEY, MAX_PRESETS, cloneWithoutIdentity, createCalendarPresetService };
