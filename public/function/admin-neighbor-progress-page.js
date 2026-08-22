(function () {
  var state = { version: 1, intervalDays: 14, ranges: [], stages: [] };
  var loaded = false;
  function el(id) { return document.getElementById(id); }
  function status(text, bad) { var n = el('neighborProgressStatus'); if (n) { n.textContent = text; n.style.color = bad ? '#fb7185' : ''; } }
  function escapeHtml(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function addDays(date, days) { var d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
  function render() {
    var box = el('neighborProgressStages'); if (!box) return;
    el('neighborProgressInterval').value = state.intervalDays;
    var html = '<div style="overflow:auto"><table style="min-width:900px;width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">区间</th>';
    state.stages.forEach(function (s) { html += '<th style="min-width:170px;text-align:left">' + escapeHtml(s.name) + '<br><small>' + escapeHtml(s.key) + '</small></th>'; });
    html += '</tr></thead><tbody>';
    state.ranges.forEach(function (range, ri) {
      html += '<tr><td><input class="np-range" data-ri="' + ri + '" value="' + escapeHtml(range) + '" style="width:120px"></td>';
      state.stages.forEach(function (s, si) { html += '<td><input type="date" class="np-date" data-ri="' + ri + '" data-si="' + si + '" value="' + escapeHtml((s.dates || [])[ri] || '') + '"></td>'; });
      html += '</tr>';
    });
    html += '</tbody></table></div><div style="margin-top:12px">';
    state.stages.forEach(function (s, si) { html += '<div class="card" style="margin:8px 0;padding:10px"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input class="np-name" data-si="' + si + '" value="' + escapeHtml(s.name) + '" placeholder="阶段名称"><input class="np-key" data-si="' + si + '" value="' + escapeHtml(s.key) + '" placeholder="阶段Key"><label><input type="checkbox" class="np-enabled" data-si="' + si + '"' + (s.enabled === false ? '' : ' checked') + '>启用</label><button class="btn secondary np-delete" data-si="' + si + '" type="button">删除阶段</button><button class="btn secondary np-generate" data-si="' + si + '" type="button">按间隔生成</button></div></div>'; });
    html += '</div>'; box.innerHTML = html;
    box.querySelectorAll('.np-range').forEach(function (n) { n.oninput = function () { state.ranges[Number(n.dataset.ri)] = n.value; }; });
    box.querySelectorAll('.np-date').forEach(function (n) { n.oninput = function () { state.stages[Number(n.dataset.si)].dates[Number(n.dataset.ri)] = n.value; }; });
    box.querySelectorAll('.np-name').forEach(function (n) { n.oninput = function () { state.stages[Number(n.dataset.si)].name = n.value; }; });
    box.querySelectorAll('.np-key').forEach(function (n) { n.oninput = function () { state.stages[Number(n.dataset.si)].key = n.value; }; });
    box.querySelectorAll('.np-enabled').forEach(function (n) { n.onchange = function () { state.stages[Number(n.dataset.si)].enabled = n.checked; }; });
    box.querySelectorAll('.np-delete').forEach(function (n) { n.onclick = function () { state.stages.splice(Number(n.dataset.si), 1); render(); }; });
    box.querySelectorAll('.np-generate').forEach(function (n) { n.onclick = function () { var s = state.stages[Number(n.dataset.si)]; var anchor = (s.dates || [])[0]; if (!anchor) { status('请先设置第一个区间的日期。', true); return; } var interval = Math.max(1, Math.min(60, Number(el('neighborProgressInterval').value) || 14)); state.intervalDays = interval; s.anchorDate = anchor; s.dates = state.ranges.map(function (_, i) { if (i === 0) return anchor; return addDays(anchor, i * interval); }); render(); status('已保留第一个区间，并按 ' + interval + ' 天间隔生成后续区间。'); }; });
  }
  async function load() {
    try { var r = await apiFetch('/api/admin/neighbor-progress', { method: 'GET' }); if (!r.ok) throw new Error('加载失败'); state = await r.json(); state.ranges = state.ranges || []; state.stages = state.stages || []; loaded = true; render(); status('已加载，可修改区间、阶段和日期。'); }
    catch (e) { status('加载失败：' + (e.message || '网络错误'), true); }
  }
  async function save() {
    state.intervalDays = Math.max(1, Math.min(60, Number(el('neighborProgressInterval').value) || 14));
    try { var r = await apiFetch('/api/admin/neighbor-progress', { method: 'POST', body: JSON.stringify(state) }); if (!r.ok) { var d = await r.json().catch(function () { return {}; }); throw new Error(d.error || '保存失败'); } state = await r.json(); render(); status('保存成功。'); }
    catch (e) { status('保存失败：' + (e.message || '网络错误'), true); }
  }
  function bind() {
    var addStage = el('neighborProgressAddBtn'); if (addStage) addStage.onclick = function () { var i = state.stages.length + 1; state.stages.push({ key: 'Hero' + (12 + i), name: (12 + i) + '代英雄', anchorDate: '', enabled: true, dates: state.ranges.map(function () { return ''; }) }); render(); };
    var addRange = el('neighborProgressAddRangeBtn'); if (addRange) addRange.onclick = function () { var interval = Math.max(1, Math.min(60, Number(el('neighborProgressInterval').value) || 14)); var previousIndex = state.ranges.length - 1; state.intervalDays = interval; state.ranges.push('新区间'); state.stages.forEach(function (s) { s.dates = s.dates || []; var previousDate = s.dates[previousIndex] || ''; s.dates.push(previousDate ? addDays(previousDate, interval) : ''); }); render(); status('已新增区间，并按 ' + interval + ' 天间隔自动续算各阶段日期。'); };
    var reload = el('neighborProgressReloadBtn'); if (reload) reload.onclick = load;
    var saveBtn = el('neighborProgressSaveBtn'); if (saveBtn) saveBtn.onclick = save;
  }
  window.loadNeighborProgressAdmin = function () { if (!loaded) load(); };
  document.addEventListener('DOMContentLoaded', bind);
})();
