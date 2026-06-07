'use strict';

function bpState(root) {
  if (!root.__adminBearpitState) {
    root.__adminBearpitState = {
      rows: [],
      total: 0,
      filters: {
        q: '',
        source: 'current',
        minItems: ''
      }
    };
  }
  return root.__adminBearpitState;
}

function bpStatus(msg) {
  if (typeof setStatus === 'function') setStatus('bearpitDataStatus', msg);
}

function bpEsc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bpFmtTime(v) {
  if (!v) return '';
  var d = new Date(v);
  if (!Number.isFinite(d.getTime())) return String(v);
  var p = function (n) {
    return String(n).padStart(2, '0');
  };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function bpInstallStyles(root) {
  if (root.document.getElementById('adminBearpitStyles')) return;
  var style = root.document.createElement('style');
  style.id = 'adminBearpitStyles';
  style.textContent =
    '#page-bearpit .bearpit-admin-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}' +
    '#page-bearpit .bearpit-admin-toolbar input,#page-bearpit .bearpit-admin-toolbar select{min-width:140px;padding:8px 10px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);font:inherit}' +
    '#page-bearpit .bearpit-admin-toolbar input[type="search"]{flex:1;min-width:180px}' +
    '#page-bearpit .bearpit-admin-meta{margin:0 0 10px;color:var(--muted);font-size:.85rem;line-height:1.5}' +
    '#page-bearpit .table-wrap table{min-width:980px}' +
    '#page-bearpit .bearpit-data-preview{max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--muted);font-size:.78rem;font-family:ui-monospace,Consolas,monospace}' +
    '#page-bearpit .bearpit-row-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}' +
    '#page-bearpit .bearpit-row-actions .btn{font-size:.78rem;padding:6px 10px}' +
    '#bearpitDataModal .bearpit-json-box{width:100%;min-height:320px;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);font:12px/1.55 ui-monospace,Consolas,monospace;resize:vertical}';
  root.document.head.appendChild(style);
}

function bpRenderTable(root) {
  var st = bpState(root);
  var tbody = root.document.getElementById('bearpitDataTbody');
  if (!tbody) return;
  if (!st.rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="color:var(--muted);">暂无符合条件的熊坑数据。</td></tr>';
    return;
  }
  tbody.innerHTML = st.rows
    .map(function (row) {
      var typeLabel = row.recordType === 'backup' ? '历史备份' : '当前存档';
      return (
        '<tr data-user-id="' +
        row.userId +
        '" data-record-type="' +
        bpEsc(row.recordType) +
        '" data-record-id="' +
        row.recordId +
        '">' +
        '<td>' +
        bpEsc(row.userId) +
        '</td>' +
        '<td>' +
        bpEsc(row.loginId) +
        '</td>' +
        '<td>' +
        bpEsc(row.username) +
        '</td>' +
        '<td>' +
        bpEsc(typeLabel) +
        '</td>' +
        '<td>' +
        bpEsc(row.title) +
        '</td>' +
        '<td>' +
        bpEsc(row.itemCount) +
        '</td>' +
        '<td>' +
        bpEsc(bpFmtTime(row.recordAt)) +
        '</td>' +
        '<td><div class="bearpit-data-preview" title="' +
        bpEsc(row.dataPreview || '') +
        '">' +
        bpEsc(row.dataPreview || '—') +
        '</div></td>' +
        '<td><div class="bearpit-row-actions">' +
        '<button type="button" class="btn secondary bearpit-view-btn">查看 JSON</button>' +
        '</div></td></tr>'
      );
    })
    .join('');

  tbody.querySelectorAll('.bearpit-view-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tr = btn.closest('tr');
      if (!tr) return;
      bpOpenDetail(root, {
        userId: Number(tr.getAttribute('data-user-id')),
        recordType: tr.getAttribute('data-record-type'),
        recordId: Number(tr.getAttribute('data-record-id'))
      });
    });
  });
}

function bpCollectFilters(root) {
  var st = bpState(root);
  var doc = root.document;
  st.filters.q = String((doc.getElementById('bearpitSearchInput') || {}).value || '').trim();
  st.filters.source = String((doc.getElementById('bearpitSourceFilter') || {}).value || 'current');
  st.filters.minItems = String((doc.getElementById('bearpitMinItemsFilter') || {}).value || '').trim();
}

function bpQueryString(st) {
  var params = [];
  if (st.filters.q) params.push('q=' + encodeURIComponent(st.filters.q));
  if (st.filters.source) params.push('source=' + encodeURIComponent(st.filters.source));
  if (st.filters.minItems) params.push('minItems=' + encodeURIComponent(st.filters.minItems));
  params.push('limit=200');
  params.push('offset=0');
  return params.join('&');
}

async function bpLoad(root) {
  bpCollectFilters(root);
  var st = bpState(root);
  bpStatus('加载中…');
  try {
    var r = await apiFetch('/api/admin/bearpit-layouts?' + bpQueryString(st), { method: 'GET' });
    var d = await r.json().catch(function () {
      return {};
    });
    if (!r.ok) {
      bpStatus('加载失败：' + ((d && d.error) || r.status));
      st.rows = [];
      st.total = 0;
      bpRenderTable(root);
      return;
    }
    st.rows = Array.isArray(d.rows) ? d.rows : [];
    st.total = Number(d.total || st.rows.length);
    bpRenderTable(root);
    bpStatus('共 ' + st.total + ' 条，当前显示 ' + st.rows.length + ' 条');
  } catch (err) {
    bpStatus('加载失败：' + ((err && err.message) || '网络错误'));
    st.rows = [];
    st.total = 0;
    bpRenderTable(root);
  }
}

async function bpOpenDetail(root, meta) {
  var modal = root.document.getElementById('bearpitDataModal');
  var title = root.document.getElementById('bearpitDataModalTitle');
  var box = root.document.getElementById('bearpitDataModalJson');
  if (!modal || !box) return;
  bpStatus('读取熊坑 JSON…');
  try {
    var url =
      '/api/admin/bearpit-layouts/' +
      encodeURIComponent(meta.recordId) +
      '?type=' +
      encodeURIComponent(meta.recordType) +
      '&userId=' +
      encodeURIComponent(meta.userId);
    var r = await apiFetch(url, { method: 'GET' });
    var d = await r.json().catch(function () {
      return {};
    });
    if (!r.ok) {
      bpStatus('读取失败：' + ((d && d.error) || r.status));
      return;
    }
    var row = d.row || {};
    if (title) {
      title.textContent =
        (row.username || row.loginId || '用户') +
        ' · ' +
        (row.recordType === 'backup' ? '备份' : '当前存档') +
        ' · ' +
        (row.title || '');
    }
    box.value = JSON.stringify(row.data || null, null, 2);
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    bpStatus('');
  } catch (err) {
    bpStatus('读取失败：' + ((err && err.message) || '网络错误'));
  }
}

function bpCloseModal(root) {
  var modal = root.document.getElementById('bearpitDataModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function bpExportCsv(root) {
  bpCollectFilters(root);
  var st = bpState(root);
  var qs = bpQueryString(st).replace(/limit=\d+/, 'limit=5000');
  window.location.href = '/api/admin/bearpit-layouts-export.csv?' + qs;
}

function bpBind(root) {
  var doc = root.document;
  var search = doc.getElementById('bearpitSearchInput');
  var source = doc.getElementById('bearpitSourceFilter');
  var minItems = doc.getElementById('bearpitMinItemsFilter');
  var reloadBtn = doc.getElementById('bearpitReloadBtn');
  var exportBtn = doc.getElementById('bearpitExportBtn');
  var closeBtn = doc.getElementById('bearpitDataModalClose');
  var copyBtn = doc.getElementById('bearpitDataModalCopy');
  var modal = doc.getElementById('bearpitDataModal');

  if (search) {
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') bpLoad(root);
    });
  }
  if (source) source.addEventListener('change', function () { bpLoad(root); });
  if (minItems) {
    minItems.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') bpLoad(root);
    });
  }
  if (reloadBtn) reloadBtn.addEventListener('click', function () { bpLoad(root); });
  if (exportBtn) exportBtn.addEventListener('click', function () { bpExportCsv(root); });
  if (closeBtn) closeBtn.addEventListener('click', function () { bpCloseModal(root); });
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) bpCloseModal(root);
    });
  }
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var box = doc.getElementById('bearpitDataModalJson');
      if (!box) return;
      box.select();
      try {
        doc.execCommand('copy');
        bpStatus('JSON 已复制到剪贴板');
      } catch (_e) {
        bpStatus('复制失败，请手动全选复制');
      }
    });
  }
}

function bpInstall(root) {
  if (!root || !root.document || root.__adminBearpitInstalled) return;
  root.__adminBearpitInstalled = true;
  bpInstallStyles(root);
  bpBind(root);
}

function loadBearpitAdmin() {
  var root = window;
  bpInstall(root);
  bpLoad(root);
}

window.loadBearpitAdmin = loadBearpitAdmin;
