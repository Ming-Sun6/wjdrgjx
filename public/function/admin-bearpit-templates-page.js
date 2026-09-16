'use strict';

function btState(root) {
  if (!root.__adminBearpitTemplatesState) {
    root.__adminBearpitTemplatesState = {
      rows: [],
      total: 0,
      filters: {
        q: '',
        status: 'pending'
      }
    };
  }
  return root.__adminBearpitTemplatesState;
}

function btStatus(msg) {
  if (typeof setStatus === 'function') setStatus('bearpitTemplateStatus', msg);
}

function btEsc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function btFmtTime(v) {
  if (!v) return '';
  var d = new Date(v);
  if (!Number.isFinite(d.getTime())) return String(v);
  var p = function (n) {
    return String(n).padStart(2, '0');
  };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function btStatusLabel(status) {
  if (status === 'approved') return '已公开';
  if (status === 'rejected') return '未通过';
  return '待审核';
}

function btKindLabel(kind) {
  return kind === 'update' ? '更新' : '首次';
}

function btInstallStyles(root) {
  if (root.document.getElementById('adminBearpitTemplateStyles')) return;
  var style = root.document.createElement('style');
  style.id = 'adminBearpitTemplateStyles';
  style.textContent =
    '#page-bearpit-templates .bearpit-admin-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}' +
    '#page-bearpit-templates .bearpit-admin-toolbar input,#page-bearpit-templates .bearpit-admin-toolbar select{min-width:140px;padding:8px 10px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);font:inherit}' +
    '#page-bearpit-templates .bearpit-admin-toolbar input[type="search"]{flex:1;min-width:180px}' +
    '#page-bearpit-templates .table-wrap table{min-width:980px}' +
    '#page-bearpit-templates .bearpit-row-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}' +
    '#page-bearpit-templates .bearpit-row-actions .btn{font-size:.78rem;padding:6px 10px}' +
    '#page-bearpit-templates .bt-status{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:.78rem;font-weight:700}' +
    '#page-bearpit-templates .bt-status.pending{background:rgba(245,158,11,.18);color:#b45309}' +
    '#page-bearpit-templates .bt-status.approved{background:rgba(16,185,129,.18);color:#047857}' +
    '#page-bearpit-templates .bt-status.rejected{background:rgba(239,68,68,.16);color:#b91c1c}' +
    '#bearpitTemplateModal .bearpit-preview-wrap{display:flex;flex-direction:column;gap:12px}' +
    '#bearpitTemplateModal .bearpit-preview-meta{color:var(--muted);font-size:.85rem;line-height:1.55}' +
    '#bearpitTemplateModal canvas{width:min(560px,100%);height:auto;border-radius:12px;border:1px solid var(--border);background:#0f172a;display:block;margin:0 auto}' +
    '#bearpitTemplateModal .bearpit-preview-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}' +
    '#bearpitTemplateModal .bearpit-json-box{width:100%;min-height:180px;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);font:12px/1.55 ui-monospace,Consolas,monospace;resize:vertical}';
  root.document.head.appendChild(style);
}

function btPreviewFill(it) {
  var src = String((it && it.i) || '');
  var size = Number(it && it.s) || 1;
  if (size === 3 || src.indexOf('beartrap') >= 0) return '#9a3412';
  if (size === 2) return '#ea580c';
  if (src.indexOf('jump_icon') >= 0) return '#64748b';
  return '#0284c7';
}

function btDrawPreview(canvas, preview) {
  if (!canvas || !canvas.getContext) return;
  var gs = Math.max(20, Math.min(100, Number(preview && preview.gs) || 20));
  var items = Array.isArray(preview && preview.items) ? preview.items : [];
  var size = 560;
  canvas.width = size;
  canvas.height = size;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, size, size);
  var cell = size / gs;
  ctx.strokeStyle = 'rgba(148,163,184,.18)';
  ctx.lineWidth = 1;
  for (var i = 0; i <= gs; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cell);
    ctx.lineTo(size, i * cell);
    ctx.stroke();
  }
  items.forEach(function (it) {
    var s = Math.max(1, Number(it.s) || 1);
    var x = Number(it.c) * cell;
    var y = Number(it.r) * cell;
    ctx.fillStyle = btPreviewFill(it);
    ctx.fillRect(x + 0.6, y + 0.6, s * cell - 1.2, s * cell - 1.2);
  });
}

function btRenderTable(root) {
  var st = btState(root);
  var tbody = root.document.getElementById('bearpitTemplateTbody');
  if (!tbody) return;
  if (!st.rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="color:var(--muted);">暂无符合条件的小程序熊坑模板。</td></tr>';
    return;
  }
  tbody.innerHTML = st.rows
    .map(function (row) {
      var status = row.status || 'pending';
      return (
        '<tr data-key="' +
        btEsc(row.templateKey) +
        '">' +
        '<td>' +
        btEsc(row.title) +
        '</td>' +
        '<td><span class="bt-status ' +
        btEsc(status) +
        '">' +
        btEsc(btStatusLabel(status)) +
        '</span></td>' +
        '<td>' +
        btEsc(btKindLabel(row.submitKind)) +
        '</td>' +
        '<td>' +
        btEsc(row.itemCount) +
        '</td>' +
        '<td>' +
        btEsc(row.gs) +
        '×' +
        btEsc(row.gs) +
        '</td>' +
        '<td>' +
        btEsc(row.downloadCount || 0) +
        '</td>' +
        '<td>' +
        btEsc(btFmtTime(row.updatedAt || row.createdAt)) +
        '</td>' +
        '<td>' +
        btEsc(row.rejectReason || row.reviewedBy || '—') +
        '</td>' +
        '<td><div class="bearpit-row-actions">' +
        '<button type="button" class="btn secondary bt-preview-btn">预览</button>' +
        (status === 'approved'
          ? ''
          : '<button type="button" class="btn bt-approve-btn">通过</button>') +
        (status === 'rejected'
          ? ''
          : '<button type="button" class="btn secondary bt-reject-btn">不通过</button>') +
        '<button type="button" class="btn secondary bt-delete-btn">删除</button>' +
        '</div></td></tr>'
      );
    })
    .join('');

  tbody.querySelectorAll('.bt-preview-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tr = btn.closest('tr');
      if (!tr) return;
      btOpenPreview(root, tr.getAttribute('data-key'));
    });
  });
  tbody.querySelectorAll('.bt-approve-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tr = btn.closest('tr');
      if (!tr) return;
      btReview(root, tr.getAttribute('data-key'), 'approve');
    });
  });
  tbody.querySelectorAll('.bt-reject-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tr = btn.closest('tr');
      if (!tr) return;
      btReview(root, tr.getAttribute('data-key'), 'reject');
    });
  });
  tbody.querySelectorAll('.bt-delete-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tr = btn.closest('tr');
      if (!tr) return;
      btDelete(root, tr.getAttribute('data-key'));
    });
  });
}

function btCollectFilters(root) {
  var st = btState(root);
  var doc = root.document;
  st.filters.q = String((doc.getElementById('bearpitTemplateSearchInput') || {}).value || '').trim();
  st.filters.status = String((doc.getElementById('bearpitTemplateStatusFilter') || {}).value || 'pending');
}

function btQueryString(st) {
  var params = ['status=' + encodeURIComponent(st.filters.status || 'pending')];
  if (st.filters.q) params.push('q=' + encodeURIComponent(st.filters.q));
  return params.join('&');
}

async function btLoad(root) {
  btCollectFilters(root);
  var st = btState(root);
  btStatus('加载中…');
  try {
    var r = await apiFetch('/api/admin/bearpit-templates?' + btQueryString(st), { method: 'GET' });
    var d = await r.json().catch(function () {
      return {};
    });
    if (!r.ok) {
      btStatus('加载失败：' + ((d && d.error) || r.status));
      st.rows = [];
      st.total = 0;
      btRenderTable(root);
      return;
    }
    st.rows = Array.isArray(d.rows) ? d.rows : [];
    st.total = Number(d.total || st.rows.length);
    btRenderTable(root);
    btStatus('共 ' + st.total + ' 条，当前显示 ' + st.rows.length + ' 条');
  } catch (err) {
    btStatus('加载失败：' + ((err && err.message) || '网络错误'));
    st.rows = [];
    st.total = 0;
    btRenderTable(root);
  }
}

async function btOpenPreview(root, key) {
  var modal = root.document.getElementById('bearpitTemplateModal');
  var title = root.document.getElementById('bearpitTemplateModalTitle');
  var meta = root.document.getElementById('bearpitTemplateModalMeta');
  var canvas = root.document.getElementById('bearpitTemplatePreviewCanvas');
  var box = root.document.getElementById('bearpitTemplateModalJson');
  if (!modal || !canvas) return;
  root.__adminBearpitTemplatesPreviewKey = key;
  btStatus('读取模板预览…');
  try {
    var r = await apiFetch('/api/admin/bearpit-templates/' + encodeURIComponent(key), { method: 'GET' });
    var d = await r.json().catch(function () {
      return {};
    });
    if (!r.ok) {
      btStatus('读取失败：' + ((d && d.error) || r.status));
      return;
    }
    var row = d.row || {};
    if (title) title.textContent = (row.title || '模板') + ' · ' + btStatusLabel(row.status);
    if (meta) {
      meta.textContent =
        '建筑 ' +
        (row.itemCount || 0) +
        ' 个 · 网格 ' +
        (row.gs || 20) +
        '×' +
        (row.gs || 20) +
        ' · ' +
        btKindLabel(row.submitKind) +
        ' · 下载 ' +
        (row.downloadCount || 0) +
        (row.rejectReason ? ' · 原因：' + row.rejectReason : '');
    }
    btDrawPreview(canvas, row.preview || { gs: row.gs, items: [] });
    if (box) box.value = JSON.stringify(row.data || null, null, 2);
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    btStatus('');
  } catch (err) {
    btStatus('读取失败：' + ((err && err.message) || '网络错误'));
  }
}

function btCloseModal(root) {
  var modal = root.document.getElementById('bearpitTemplateModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

async function btReview(root, key, action) {
  if (!key) return;
  var reason = '';
  if (action === 'reject') {
    reason = window.prompt('不通过原因（可留空）', '') || '';
  } else if (!window.confirm('确定通过该模板？通过后会出现在小程序模板市场。')) {
    return;
  }
  btStatus(action === 'approve' ? '正在通过…' : '正在标记不通过…');
  try {
    var r = await apiFetch('/api/admin/bearpit-templates/' + encodeURIComponent(key) + '/' + action, {
      method: 'POST',
      body: JSON.stringify({ reason: reason })
    });
    var d = await r.json().catch(function () {
      return {};
    });
    if (!r.ok) {
      btStatus('操作失败：' + ((d && d.error) || r.status));
      return;
    }
    btCloseModal(root);
    await btLoad(root);
    btStatus(action === 'approve' ? '已通过，模板会出现在小程序市场' : '已标记为不通过');
  } catch (err) {
    btStatus('操作失败：' + ((err && err.message) || '网络错误'));
  }
}

async function btDelete(root, key) {
  if (!key) return;
  if (!window.confirm('确定删除该模板？删除后小程序市场不再展示，本机排布不受影响。')) return;
  btStatus('正在删除…');
  try {
    var r = await apiFetch('/api/admin/bearpit-templates/' + encodeURIComponent(key) + '/delete', {
      method: 'POST',
      body: JSON.stringify({})
    });
    var d = await r.json().catch(function () {
      return {};
    });
    if (!r.ok) {
      btStatus('删除失败：' + ((d && d.error) || r.status));
      return;
    }
    btCloseModal(root);
    await btLoad(root);
    btStatus('已删除模板');
  } catch (err) {
    btStatus('删除失败：' + ((err && err.message) || '网络错误'));
  }
}

function btBind(root) {
  var doc = root.document;
  var search = doc.getElementById('bearpitTemplateSearchInput');
  var status = doc.getElementById('bearpitTemplateStatusFilter');
  var reloadBtn = doc.getElementById('bearpitTemplateReloadBtn');
  var closeBtn = doc.getElementById('bearpitTemplateModalClose');
  var modal = doc.getElementById('bearpitTemplateModal');
  var copyBtn = doc.getElementById('bearpitTemplateModalCopy');
  var approveBtn = doc.getElementById('bearpitTemplateModalApprove');
  var rejectBtn = doc.getElementById('bearpitTemplateModalReject');
  var deleteBtn = doc.getElementById('bearpitTemplateModalDelete');

  if (search) {
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') btLoad(root);
    });
  }
  if (status) status.addEventListener('change', function () { btLoad(root); });
  if (reloadBtn) reloadBtn.addEventListener('click', function () { btLoad(root); });
  if (closeBtn) closeBtn.addEventListener('click', function () { btCloseModal(root); });
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) btCloseModal(root);
    });
  }
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var box = doc.getElementById('bearpitTemplateModalJson');
      if (!box) return;
      box.select();
      try {
        doc.execCommand('copy');
        btStatus('JSON 已复制到剪贴板');
      } catch (_e) {
        btStatus('复制失败，请手动全选复制');
      }
    });
  }
  if (approveBtn) {
    approveBtn.addEventListener('click', function () {
      btReview(root, root.__adminBearpitTemplatesPreviewKey, 'approve');
    });
  }
  if (rejectBtn) {
    rejectBtn.addEventListener('click', function () {
      btReview(root, root.__adminBearpitTemplatesPreviewKey, 'reject');
    });
  }
  if (deleteBtn) {
    deleteBtn.addEventListener('click', function () {
      btDelete(root, root.__adminBearpitTemplatesPreviewKey);
    });
  }
}

function btInstall(root) {
  if (!root || !root.document || root.__adminBearpitTemplatesInstalled) return;
  root.__adminBearpitTemplatesInstalled = true;
  btInstallStyles(root);
  btBind(root);
}

function loadBearpitTemplatesAdmin() {
  var root = window;
  btInstall(root);
  btLoad(root);
}

window.loadBearpitTemplatesAdmin = loadBearpitTemplatesAdmin;
window.btDrawPreview = btDrawPreview;
window.btPreviewFill = btPreviewFill;
