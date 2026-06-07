'use strict';

function acState(root) {
  if (!root.__adminActivationCodesState) {
    root.__adminActivationCodesState = { codes: [] };
  }
  return root.__adminActivationCodesState;
}

function acStatus(msg) {
  if (typeof setStatus === 'function') setStatus('activationCodesStatus', msg);
}

function acEsc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function acFmtTime(v) {
  if (!v) return '—';
  var d = new Date(v);
  if (!Number.isFinite(d.getTime())) return String(v);
  var p = function (n) {
    return String(n).padStart(2, '0');
  };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function acTypeLabel(type) {
  return type === 'membership' ? '会员' : '积分';
}

function acValueLabel(row) {
  if (!row) return '—';
  if (row.type === 'points') return String(row.pointsAmount || 0) + ' 积分';
  if (row.membershipDays === 0) return '永久会员';
  return String(row.membershipDays || 0) + ' 天会员';
}

function acInstallStyles(root) {
  if (root.document.getElementById('adminActivationCodesStyles')) return;
  var style = root.document.createElement('style');
  style.id = 'adminActivationCodesStyles';
  style.textContent =
    '#page-activation-codes .activation-create-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:10px 12px;margin-bottom:14px}' +
    '#page-activation-codes .activation-create-grid .form-group{display:flex;flex-direction:column;gap:5px;min-width:0}' +
    '#page-activation-codes .activation-create-grid label{font-size:.74rem;color:var(--muted);font-weight:700}' +
    '#page-activation-codes .activation-create-grid input,#page-activation-codes .activation-create-grid select,#page-activation-codes .activation-create-grid textarea{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);font:inherit}' +
    '#page-activation-codes .ac-span-3{grid-column:span 3}#page-activation-codes .ac-span-4{grid-column:span 4}#page-activation-codes .ac-span-6{grid-column:span 6}#page-activation-codes .ac-span-12{grid-column:1/-1}' +
    '@media(max-width:900px){#page-activation-codes .ac-span-3,#page-activation-codes .ac-span-4,#page-activation-codes .ac-span-6{grid-column:1/-1}}' +
    '#page-activation-codes .activation-code-chip{font-family:ui-monospace,Consolas,monospace;font-weight:700;letter-spacing:.04em}' +
    '#page-activation-codes .table-wrap table{min-width:980px}';
  root.document.head.appendChild(style);
}

function acSyncTypeFields(root) {
  var typeEl = root.document.getElementById('activationCodeType');
  var pointsWrap = root.document.getElementById('activationPointsWrap');
  var membershipWrap = root.document.getElementById('activationMembershipWrap');
  if (!typeEl) return;
  var type = String(typeEl.value || 'points');
  if (pointsWrap) pointsWrap.style.display = type === 'points' ? '' : 'none';
  if (membershipWrap) membershipWrap.style.display = type === 'membership' ? '' : 'none';
}

function acRenderTable(root) {
  var st = acState(root);
  var tbody = root.document.getElementById('activationCodesTbody');
  if (!tbody) return;
  if (!st.codes.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="color:var(--muted);">暂无激活码，可在上方创建。</td></tr>';
    return;
  }
  tbody.innerHTML = st.codes
    .map(function (row) {
      return (
        '<tr>' +
        '<td><span class="activation-code-chip">' +
        acEsc(row.code) +
        '</span></td>' +
        '<td>' +
        acEsc(acTypeLabel(row.type)) +
        '</td>' +
        '<td>' +
        acEsc(acValueLabel(row)) +
        '</td>' +
        '<td>' +
        acEsc(String(row.useCount || 0) + ' / ' + String(row.maxUses || 0)) +
        '</td>' +
        '<td>' +
        acEsc(acFmtTime(row.expiresAt)) +
        '</td>' +
        '<td>' +
        acEsc(row.note || '—') +
        '</td>' +
        '<td>' +
        acEsc(acFmtTime(row.createdAt)) +
        '</td>' +
        '<td><button class="btn secondary ac-copy-btn" type="button" data-code="' +
        acEsc(row.code) +
        '">复制</button></td>' +
        '</tr>'
      );
    })
    .join('');
  tbody.querySelectorAll('.ac-copy-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var code = btn.getAttribute('data-code') || '';
      if (!code) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(
          function () {
            acStatus('已复制激活码：' + code);
          },
          function () {
            acStatus('复制失败，请手动复制：' + code);
          }
        );
      } else {
        acStatus('激活码：' + code);
      }
    });
  });
}

async function loadActivationCodesAdmin() {
  if (!window.authUser || !window.authUser.isAdmin) {
    acStatus('没有权限：请使用管理员账号登录。');
    acRenderTable(window);
    return;
  }
  acStatus('加载中...');
  try {
    var r = await apiFetch('/api/admin/activation-codes', { method: 'GET' });
    if (r.status === 401 || r.status === 403) {
      acStatus('没有权限：请确认管理员账号。');
      acState(window).codes = [];
      acRenderTable(window);
      return;
    }
    var d = await r.json().catch(function () {
      return {};
    });
    if (!r.ok) {
      acStatus('加载失败：' + ((d && d.error) || r.status));
      return;
    }
    acState(window).codes = Array.isArray(d.codes) ? d.codes : [];
    acRenderTable(window);
    acStatus('共 ' + acState(window).codes.length + ' 条激活码');
  } catch (err) {
    acStatus('加载失败：' + ((err && err.message) || '网络错误'));
  }
}

async function createActivationCodeAdmin() {
  if (!window.authUser || !window.authUser.isAdmin) {
    acStatus('没有权限：请使用管理员账号登录。');
    return;
  }
  var doc = document;
  var type = String((doc.getElementById('activationCodeType') || {}).value || 'points');
  var payload = {
    type: type,
    maxUses: Number((doc.getElementById('activationMaxUses') || {}).value || 1),
    note: String((doc.getElementById('activationNote') || {}).value || '').trim(),
    code: String((doc.getElementById('activationCustomCode') || {}).value || '').trim()
  };
  var expires = String((doc.getElementById('activationExpiresAt') || {}).value || '').trim();
  if (expires) payload.expiresAt = expires;
  if (type === 'points') {
    payload.pointsAmount = Number((doc.getElementById('activationPointsAmount') || {}).value || 0);
  } else {
    var daysVal = String((doc.getElementById('activationMembershipDays') || {}).value || '').trim();
    if (daysVal === 'lifetime') payload.membershipDays = 0;
    else payload.membershipDays = Number(daysVal || 0);
  }
  var btn = doc.getElementById('activationCreateBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '创建中...';
  }
  acStatus('创建中...');
  try {
    var r = await apiFetch('/api/admin/activation-codes', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    var d = await r.json().catch(function () {
      return {};
    });
    if (!r.ok) {
      var errMap = {
        BAD_TYPE: '类型无效',
        BAD_POINTS_AMOUNT: '积分数量需在 1-1000000',
        BAD_MEMBERSHIP_DAYS: '会员天数无效',
        BAD_CODE: '自定义激活码格式无效',
        CODE_TAKEN: '激活码已存在'
      };
      acStatus('创建失败：' + (errMap[d.error] || d.error || r.status));
      return;
    }
    acStatus('创建成功：' + (d.code && d.code.code ? d.code.code : ''));
    var custom = doc.getElementById('activationCustomCode');
    if (custom) custom.value = '';
    await loadActivationCodesAdmin();
  } catch (err) {
    acStatus('创建失败：' + ((err && err.message) || '网络错误'));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '创建激活码';
    }
  }
}

function acBind(root) {
  var doc = root.document;
  var typeEl = doc.getElementById('activationCodeType');
  if (typeEl) typeEl.addEventListener('change', function () {
    acSyncTypeFields(root);
  });
  var createBtn = doc.getElementById('activationCreateBtn');
  if (createBtn) createBtn.addEventListener('click', createActivationCodeAdmin);
  var reloadBtn = doc.getElementById('activationReloadBtn');
  if (reloadBtn) reloadBtn.addEventListener('click', loadActivationCodesAdmin);
}

function acInstall(root) {
  if (!root.document || root.__adminActivationCodesInstalled) return;
  root.__adminActivationCodesInstalled = true;
  acInstallStyles(root);
  acSyncTypeFields(root);
  acBind(root);
  root.loadActivationCodesAdmin = loadActivationCodesAdmin;
}

if (typeof window !== 'undefined' && window.document) {
  if (window.document.readyState === 'loading') {
    window.document.addEventListener('DOMContentLoaded', function () {
      acInstall(window);
    }, { once: true });
  } else {
    acInstall(window);
  }
}
