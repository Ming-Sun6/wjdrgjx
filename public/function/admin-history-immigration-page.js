(function () {
  var state = { version: 1, intervalDays: 28, dates: [], rules: { displayOffsetDays: 1, groupMode: 'same-progress', mergeContinuousRanges: true, showStageDetails: true } };
  var ranges = [];
  var loaded = false;
  function el(id) { return document.getElementById(id); }
  function status(text, bad) { var n = el('historyImmigrationStatus'); if (n) { n.textContent = text; n.style.color = bad ? '#fb7185' : ''; } }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function addDays(date, days) { var d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
  function render() {
    el('historyImmigrationInterval').value = state.intervalDays;
    el('historyImmigrationOffset').value = state.rules.displayOffsetDays;
    var dateBox = el('historyImmigrationDates');
    dateBox.innerHTML = state.dates.map(function (item, i) { return '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0"><input type="date" class="him-date" data-i="' + i + '" value="' + esc(item.date) + '"><input class="him-note" data-i="' + i + '" placeholder="备注" value="' + esc(item.note) + '"><label><input type="checkbox" class="him-enabled" data-i="' + i + '"' + (item.enabled === false ? '' : ' checked') + '>启用</label><label><input type="checkbox" class="him-unopened" data-i="' + i + '"' + (item.unopened === true ? ' checked' : '') + '>未开放</label><button type="button" class="btn secondary him-delete" data-i="' + i + '">删除</button></div>'; }).join('');
    dateBox.querySelectorAll('.him-date').forEach(function (n) { n.oninput = function () { state.dates[Number(n.dataset.i)].date = n.value; }; });
    dateBox.querySelectorAll('.him-note').forEach(function (n) { n.oninput = function () { state.dates[Number(n.dataset.i)].note = n.value; }; });
    dateBox.querySelectorAll('.him-enabled').forEach(function (n) { n.onchange = function () { state.dates[Number(n.dataset.i)].enabled = n.checked; }; });
    dateBox.querySelectorAll('.him-unopened').forEach(function (n) { n.onchange = function () { state.dates[Number(n.dataset.i)].unopened = n.checked; }; });
    dateBox.querySelectorAll('.him-delete').forEach(function (n) { n.onclick = function () { state.dates.splice(Number(n.dataset.i), 1); render(); }; });
    var matrix = el('historyImmigrationMatrix');
    var html = '<table style="min-width:900px;width:100%;border-collapse:collapse"><thead><tr><th>邻邦区间</th>' + state.dates.map(function (d) { return '<th>' + esc(d.date) + '</th>'; }).join('') + '</tr></thead><tbody>';
    ranges.slice(0, 46).forEach(function (range) { html += '<tr><td>' + esc(range) + '</td>' + state.dates.map(function (d, di) { var val = d.overrides && d.overrides[range] || ''; return '<td><input class="him-override" data-ri="' + esc(range) + '" data-di="' + di + '" placeholder="自动" value="' + esc(val) + '" style="width:90px"></td>'; }).join('') + '</tr>'; });
    matrix.innerHTML = html + '</tbody></table>';
    matrix.querySelectorAll('.him-override').forEach(function (n) { n.oninput = function () { var d = state.dates[Number(n.dataset.di)]; d.overrides = d.overrides || {}; if (n.value.trim()) d.overrides[n.dataset.ri] = n.value.trim(); else delete d.overrides[n.dataset.ri]; }; });
  }
  async function load() {
    try { var nr = await apiFetch('/api/neighbor-progress', { method: 'GET' }); var nd = await nr.json(); ranges = nd.ranges || []; var r = await apiFetch('/api/admin/history-immigration', { method: 'GET' }); if (!r.ok) throw new Error('加载失败'); state = await r.json(); state.dates = state.dates || []; state.rules = state.rules || { displayOffsetDays: 1 }; loaded = true; render(); status('已加载，可修改日期、规则和分组覆盖。'); }
    catch (e) { status('加载失败：' + (e.message || '网络错误'), true); }
  }
  async function save() {
    state.intervalDays = Math.max(1, Math.min(90, Number(el('historyImmigrationInterval').value) || 28));
    state.rules.displayOffsetDays = Math.max(0, Math.min(7, Number(el('historyImmigrationOffset').value) || 1));
    try { var r = await apiFetch('/api/admin/history-immigration', { method: 'POST', body: JSON.stringify(state) }); if (!r.ok) throw new Error('保存失败'); state = await r.json(); render(); status('保存成功。'); } catch (e) { status(e.message || '保存失败', true); }
  }
  function bind() {
    el('historyImmigrationReloadBtn').onclick = load;
    el('historyImmigrationSaveBtn').onclick = save;
    el('historyImmigrationAddBtn').onclick = function () { state.dates.push({ date: '', enabled: true, unopened: false, note: '', overrides: {} }); render(); };
    el('historyImmigrationGenerateBtn').onclick = function () { var last = state.dates[state.dates.length - 1]; if (!last || !/^\d{4}-\d{2}-\d{2}$/.test(last.date)) return; state.dates.push({ date: addDays(last.date, state.intervalDays), enabled: true, unopened: false, note: '', overrides: {} }); render(); };
  }
  window.loadHistoryImmigrationAdmin = function () { if (!loaded) load(); };
  document.addEventListener('DOMContentLoaded', bind);
})();
