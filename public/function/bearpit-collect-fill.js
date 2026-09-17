(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BearpitCollectFill = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const KEY_RE = /^[A-Za-z0-9]{16}$/;
  const TOKEN_RE = /^[A-Za-z0-9]{24}$/;
  const COLLECT_STORAGE_KEY = 'beapit_web_collect_v1';
  const FILL_STORAGE_KEY = 'beapit_web_collect_fill_v1';
  const LAYOUT_MODE_KEY = 'beapit_web_layout_mode_v1';
  const DEFAULT_GRID = 100;
  const COLLECT_FIELD_DEFS = [
    { id: 'heroPower', label: '英雄总实力', placeholder: '例如 1250万', kind: 'power' },
    { id: 'personalPower', label: '个人实力', placeholder: '例如 800万', kind: 'power' },
    { id: 'earthPower', label: '地心战力', placeholder: '例如 300万', kind: 'power' },
    { id: 'petPower', label: '宠物', placeholder: '例如 200万', kind: 'power' },
    { id: 'expertPower', label: '专家', placeholder: '例如 150万', kind: 'power' },
    { id: 'bearDamage', label: '打熊伤害', placeholder: '例如 1.2亿', kind: 'power' },
    { id: 'expedition', label: '探险关卡数', placeholder: '例如 120', kind: 'stage' }
  ];
  const COLLECT_FIELD_IDS = COLLECT_FIELD_DEFS.map((item) => item.id);
  const DEFAULT_COLLECT_FIELDS = ['heroPower'];

  function parseHeroPower(raw) {
    const s = String(raw == null ? '' : raw).trim().replace(/,/g, '').replace(/，/g, '').replace(/\s+/g, '');
    const m = s.match(/^(\d+(?:\.\d+)?)(万|亿|w|W)?$/);
    if (!m) return null;
    let n = Number(m[1]);
    if (!Number.isFinite(n) || n < 0) return null;
    const unit = m[2];
    if (unit === '亿') n *= 1e8;
    else if (unit === '万' || unit === 'w' || unit === 'W') n *= 1e4;
    n = Math.round(n);
    if (n < 1 || n > 1e15) return null;
    return n;
  }

  function formatHeroPower(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v < 0) return '';
    if (v >= 1e8) {
      const x = v / 1e8;
      return (v % 1e8 === 0 ? String(x) : x.toFixed(2).replace(/\.?0+$/, '')) + '亿';
    }
    if (v >= 1e4) {
      const x = v / 1e4;
      return (v % 1e4 === 0 ? String(x) : x.toFixed(1).replace(/\.0$/, '')) + '万';
    }
    return String(v);
  }

  function collectFieldDef(id) {
    return COLLECT_FIELD_DEFS.find((item) => item.id === id) || null;
  }

  function normalizeCollectFields(value) {
    const raw = Array.isArray(value) ? value : [];
    const seen = {};
    const out = [];
    raw.forEach((item) => {
      const id = String(item || '').trim();
      if (!COLLECT_FIELD_IDS.includes(id) || seen[id]) return;
      seen[id] = 1;
      out.push(id);
    });
    return out.length ? out : DEFAULT_COLLECT_FIELDS.slice();
  }

  function normalizeRankField(fields, rankField) {
    const list = normalizeCollectFields(fields);
    const id = String(rankField || '').trim();
    return list.includes(id) ? id : list[0];
  }

  function parseStageCount(raw) {
    const s = String(raw == null ? '' : raw).trim().replace(/,/g, '').replace(/，/g, '');
    if (!/^\d+$/.test(s)) return null;
    const n = Number(s);
    if (!Number.isFinite(n) || n < 1 || n > 9999) return null;
    return n;
  }

  function parseCollectValue(fieldId, raw) {
    const def = collectFieldDef(fieldId);
    if (!def) return null;
    return def.kind === 'stage' ? parseStageCount(raw) : parseHeroPower(raw);
  }

  function formatCollectValue(fieldId, n) {
    const def = collectFieldDef(fieldId);
    if (def && def.kind === 'stage') return String(n || '');
    return formatHeroPower(n);
  }

  function rosterValue(entry, rankField) {
    const stats = entry && entry.stats;
    if (stats && Number(stats[rankField]) > 0) return Number(stats[rankField]);
    return Number(entry && entry.power) || 0;
  }

  function sortRosterByPower(entries, rankField) {
    const field = String(rankField || 'heroPower');
    return (entries || []).slice().sort((a, b) => {
      const dp = rosterValue(b, field) - rosterValue(a, field);
      if (dp) return dp;
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh');
    });
  }

  function boxGap(r, c, s, br, bc, bs) {
    const dr = r + s <= br ? br - (r + s) : br + bs <= r ? r - (br + bs) : 0;
    const dc = c + s <= bc ? bc - (c + s) : bc + bs <= c ? c - (bc + bs) : 0;
    return Math.max(dr, dc);
  }

  function furnaceRingIndex(bear, it) {
    if (!bear || !it) return 99;
    const gap = boxGap(it.r, it.c, it.s || 2, bear.r, bear.c, bear.s || 3);
    return Math.max(1, Math.floor(gap / 2) + 1);
  }

  function centerOutIndices(n) {
    const out = [];
    if (n <= 0) return out;
    let left = Math.floor((n - 1) / 2);
    let right = Math.ceil((n - 1) / 2);
    if (left === right) {
      out.push(left);
      left--;
      right++;
    } else {
      out.push(left);
      out.push(right);
      left--;
      right++;
    }
    while (left >= 0 || right < n) {
      if (left >= 0) out.push(left--);
      if (right < n) out.push(right++);
    }
    return out;
  }

  function interleaveCenterOut(sides) {
    const sequences = (sides || []).map((side) => {
      const list = side || [];
      return centerOutIndices(list.length).map((i) => list[i]);
    });
    const out = [];
    let step = 0;
    let added = true;
    while (added) {
      added = false;
      for (let s = 0; s < sequences.length; s++) {
        if (step < sequences[s].length) {
          out.push(sequences[s][step]);
          added = true;
        }
      }
      step++;
    }
    return out;
  }

  function ringTilePositions(bear, ring) {
    const k = Math.max(1, Math.round(Number(ring) || 1));
    const br = (bear && bear.r) || 0;
    const bc = (bear && bear.c) || 0;
    const bs = (bear && bear.s) || 3;
    const northR = br - 2 * k;
    const westC = bc - 2 * k;
    const southR = br + bs + 2 * (k - 1);
    const eastC = bc + bs + 2 * (k - 1);
    const n = 2 * k + 1;
    const south = [];
    const east = [];
    const north = [];
    const west = [];
    for (let i = 0; i < n; i++) south.push({ r: southR, c: westC + 2 * i });
    for (let i = n - 2; i >= 1; i--) east.push({ r: northR + 2 * i, c: eastC });
    for (let i = n - 1; i >= 0; i--) north.push({ r: northR, c: westC + 2 * i });
    for (let i = 1; i <= n - 2; i++) west.push({ r: northR + 2 * i, c: westC });
    return interleaveCenterOut([south, east, north, west]);
  }

  function ringSlotCount(ring) {
    const r = Math.round(Number(ring) || 0);
    if (r < 1) return 0;
    return 8 * r;
  }

  function neededRingCount(count) {
    let n = 0;
    let cap = 0;
    const need = Math.max(0, Number(count) || 0);
    while (cap < need && n < 12) {
      n++;
      cap += ringSlotCount(n);
    }
    return Math.max(1, n);
  }

  function normalizeRingOrder(order, maxRing) {
    const cap = Math.max(1, Math.round(Number(maxRing) || 1));
    const seen = {};
    const out = [];
    (Array.isArray(order) ? order : []).forEach((n) => {
      const ring = Math.round(Number(n));
      if (ring < 1 || ring > cap || seen[ring]) return;
      seen[ring] = 1;
      out.push(ring);
    });
    for (let ring = 1; ring <= cap; ring++) {
      if (!seen[ring]) out.push(ring);
    }
    return out;
  }

  function cellKey(r, c) {
    return r + '-' + c;
  }

  function cloneOccupied(occupied) {
    if (occupied instanceof Set) return new Set(occupied);
    if (Array.isArray(occupied)) return new Set(occupied);
    const out = new Set();
    if (occupied && typeof occupied === 'object') {
      Object.keys(occupied).forEach((key) => {
        if (occupied[key]) out.add(key);
      });
    }
    return out;
  }

  function canPlace(occ, r, c, size, gridSize) {
    const g = gridSize || DEFAULT_GRID;
    const s = size || 2;
    if (r < 0 || c < 0 || r + s > g || c + s > g) return false;
    for (let row = r; row < r + s; row++) {
      for (let col = c; col < c + s; col++) {
        if (occ.has(cellKey(row, col))) return false;
      }
    }
    return true;
  }

  function addOccupy(occ, r, c, size) {
    const s = size || 2;
    for (let row = r; row < r + s; row++) {
      for (let col = c; col < c + s; col++) occ.add(cellKey(row, col));
    }
  }

  function furnaceSlotsAroundBear(bear, gridSize, occupied, count, ringOrder) {
    if (!bear || count <= 0) return [];
    const g = gridSize || DEFAULT_GRID;
    const occ = cloneOccupied(occupied);
    const placed = [];
    const maxRing = Math.max(1, Math.ceil(g / 2));
    const order = normalizeRingOrder(ringOrder, maxRing);
    for (let k = 0; k < order.length && placed.length < count; k++) {
      const slots = ringTilePositions(bear, order[k]);
      for (let i = 0; i < slots.length && placed.length < count; i++) {
        const slot = slots[i];
        if (!canPlace(occ, slot.r, slot.c, 2, g)) continue;
        addOccupy(occ, slot.r, slot.c, 2);
        placed.push({ r: slot.r, c: slot.c, ring: order[k] });
      }
    }
    return placed;
  }

  function furnaceFillKey(bear, it, rank) {
    const ring = furnaceRingIndex(bear, it);
    const ringRank = rank[ring] != null ? rank[ring] : 999;
    const slots = ringTilePositions(bear, ring);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < slots.length; i++) {
      const d = Math.abs(slots[i].r - it.r) + Math.abs(slots[i].c - it.c);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return ringRank * 10000 + best;
  }

  function sortFurnacesForFill(bear, furnaces, ringOrder, gridSize) {
    const list = (furnaces || []).slice();
    if (!list.length) return list;
    if (!bear) {
      return list.sort((a, b) => a.r - b.r || a.c - b.c);
    }
    const g = gridSize || DEFAULT_GRID;
    const maxRing = Math.max(1, Math.ceil(g / 2));
    const order = normalizeRingOrder(ringOrder, maxRing);
    const rank = {};
    order.forEach((ring, i) => {
      rank[ring] = i;
    });
    return list.sort((a, b) => {
      const ka = furnaceFillKey(bear, a, rank);
      const kb = furnaceFillKey(bear, b, rank);
      if (ka !== kb) return ka - kb;
      return a.r - b.r || a.c - b.c;
    });
  }

  function nextQuickAssign(entries, assignedCount, rankField) {
    const roster = sortRosterByPower(entries, rankField);
    const index = Math.max(0, Math.floor(Number(assignedCount) || 0));
    if (!roster.length || index >= roster.length) return null;
    return {
      entry: roster[index],
      index,
      total: roster.length,
      remainingAfter: roster.length - index - 1
    };
  }

  function collectFillUrl(collectKey, origin) {
    const key = String(collectKey || '').trim();
    const base = String(origin || (typeof location !== 'undefined' ? location.origin : 'https://wjgl.store')).replace(/\/$/, '');
    return base + '/function/bearpit-collect.html?id=' + encodeURIComponent(key);
  }

  async function requestCollect(method, path, body, query) {
    const url = new URL(path, typeof location !== 'undefined' ? location.origin : 'https://wjgl.store');
    if (query) {
      Object.keys(query).forEach((key) => {
        if (query[key]) url.searchParams.set(key, query[key]);
      });
    }
    const opts = {
      method,
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin'
    };
    if (body && method !== 'GET' && method !== 'HEAD') opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.ok === false) {
      const err = new Error((payload && payload.error) || ('HTTP_' + res.status));
      err.status = res.status;
      err.body = payload;
      throw err;
    }
    return payload;
  }

  function createCollectForm(collectKey, hostToken, options) {
    const payload = {};
    if (KEY_RE.test(String(collectKey || '')) && TOKEN_RE.test(String(hostToken || ''))) {
      payload.collectKey = collectKey;
      payload.hostToken = hostToken;
    }
    if (options && Array.isArray(options.fields)) {
      const fields = normalizeCollectFields(options.fields);
      payload.fields = fields;
      payload.rankField = normalizeRankField(fields, options.rankField);
    }
    return requestCollect('POST', '/api/bearpit/collect', payload);
  }

  function fetchCollectForm(key, hostToken) {
    const query = hostToken ? { token: hostToken } : null;
    return requestCollect('GET', '/api/bearpit/collect/' + encodeURIComponent(key), null, query);
  }

  function submitCollectEntry(key, name, stats) {
    const payload = { name, stats: stats || {} };
    if (stats && stats.heroPower) payload.power = stats.heroPower;
    else if (typeof stats === 'number' || typeof stats === 'string') {
      payload.power = stats;
      payload.stats = { heroPower: stats };
    }
    return requestCollect('POST', '/api/bearpit/collect/' + encodeURIComponent(key) + '/entries', payload);
  }

  function deleteCollectEntry(key, id, hostToken) {
    return requestCollect(
      'POST',
      '/api/bearpit/collect/' + encodeURIComponent(key) + '/entries/' + encodeURIComponent(id) + '/delete',
      { hostToken }
    );
  }

  function clearCollectEntries(key, hostToken) {
    return requestCollect('POST', '/api/bearpit/collect/' + encodeURIComponent(key) + '/clear', { hostToken });
  }

  return {
    KEY_RE,
    TOKEN_RE,
    COLLECT_STORAGE_KEY,
    FILL_STORAGE_KEY,
    LAYOUT_MODE_KEY,
    COLLECT_FIELD_DEFS,
    COLLECT_FIELD_IDS,
    DEFAULT_COLLECT_FIELDS,
    collectFieldDef,
    normalizeCollectFields,
    normalizeRankField,
    parseStageCount,
    parseCollectValue,
    formatCollectValue,
    parseHeroPower,
    formatHeroPower,
    sortRosterByPower,
    ringTilePositions,
    ringSlotCount,
    neededRingCount,
    furnaceSlotsAroundBear,
    sortFurnacesForFill,
    nextQuickAssign,
    collectFillUrl,
    createCollectForm,
    fetchCollectForm,
    submitCollectEntry,
    deleteCollectEntry,
    clearCollectEntries
  };
});
