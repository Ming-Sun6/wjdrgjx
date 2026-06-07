'use strict';

function acState(root) {
  if (!root.__adminActivationCodesState) {
    root.__adminActivationCodesState = { codes: [], shopItems: [] };
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
  if (type === 'membership') return '会员';
  if (type === 'combo') return '组合';
  if (type === 'shop_item') return '商城道具';
  return '积分';
}

function acValueLabel(row) {
  if (!row) return '—';
  if (row.type === 'shop_item') {
    var item = acState(window).shopItems.find(function (it) {
      return Number(it.id) === Number(row.shopItemId);
    });
    return item ? item.name + '（#' + item.id + '）' : '道具 #' + (row.shopItemId || '?');
  }
  if (row.type === 'points') return String(row.pointsAmount || 0) + ' 积分';
  if (row.type === 'membership') {
    return row.membershipDays === 0 ? '永久会员' : String(row.membershipDays || 0) + ' 天会员';
  }
  if (row.type === 'combo') {
    var mem = row.membershipDays === 0 ? '永久会员' : String(row.membershipDays || 0) + ' 天会员';
    return String(row.pointsAmount || 0) + ' 积分 + ' + mem;
  }
  return '—';
}

function acUsesLabel(row) {
  var used = String(row.useCount || 0);
  if (row.unlimitedUses) return used + ' / 不限';
  return used + ' / ' + String(row.maxUses || 0);
}

function acInstallStyles(root) {
  if (root.document.getElementById('adminActivationCodesStyles')) return;
  var style = root.document.createElement('style');
  style.id = 'adminActivationCodesStyles';
  style.textContent =
    '#page-activation-codes .activation-create-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:10px 12px;margin-bottom:14px}' +
    '#page-activation-codes .activation-batch-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:10px 12px;margin:0 0 14px;padding:12px 14px;border:1px dashed var(--border);border-radius:12px;background:rgba(148,163,184,.06)}' +
    '#page-activation-codes .activation-create-grid .form-group,#page-activation-codes .activation-batch-grid .form-group{display:flex;flex-direction:column;gap:5px;min-width:0}' +
    '#page-activation-codes .activation-create-grid label,#page-activation-codes .activation-batch-grid label{font-size:.74rem;color:var(--muted);font-weight:700}' +
    '#page-activation-codes .activation-create-grid input,#page-activation-codes .activation-create-grid select,#page-activation-codes .activation-create-grid textarea,#page-activation-codes .activation-batch-grid input,#page-activation-codes .activation-batch-grid select{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);font:inherit}' +
    '#page-activation-codes .ac-span-3{grid-column:span 3}#page-activation-codes .ac-span-4{grid-column:span 4}#page-activation-codes .ac-span-6{grid-column:span 6}#page-activation-codes .ac-span-12{grid-column:1/-1}' +
    '@media(max-width:900px){#page-activation-codes .ac-span-3,#page-activation-codes .ac-span-4,#page-activation-codes .ac-span-6{grid-column:1/-1}}' +
    '#page-activation-codes .activation-code-chip{font-family:ui-monospace,Consolas,monospace;font-weight:700;letter-spacing:.04em}' +
    '#page-activation-codes .table-wrap table{min-width:1180px}' +
    '#page-activation-codes .ac-row-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}';
  root.document.head.appendChild(style);
}

function acSyncTypeFields(root) {
  var typeEl = root.document.getElementById('activationCodeType');
  var pointsWrap = root.document.getElementById('activationPointsWrap');
  var membershipWrap = root.document.getElementById('activationMembershipWrap');
  var membershipCustomWrap = root.document.getElementById('activationMembershipCustomWrap');
  var shopWrap = root.document.getElementById('activationShopItemWrap');
  if (!typeEl) return;
  var type = String(typeEl.value || 'points');
  if (pointsWrap) pointsWrap.style.display = type === 'points' || type === 'combo' ? '' : 'none';
  if (membershipWrap) membershipWrap.style.display = type === 'membership' || type === 'combo' ? '' : 'none';
  if (membershipCustomWrap) membershipCustomWrap.style.display = type === 'membership' || type === 'combo' ? '' : 'none';
  if (shopWrap) shopWrap.style.display = type === 'shop_item' ? '' : 'none';
}

function acFillShopOptions(root, items) {
  var select = root.document.getElementById('activationShopItemId');
  if (!select) return;
  var list = Array.isArray(items) ? items : [];
  acState(root).shopItems = list;
  select.innerHTML =
    '<option value="">请选择商城道具</option>' +
    list
      .map(function (item) {
        return (
          '<option value="' +
          acEsc(item.id) +
          '">' +
          acEsc(item.name + '（#' + item.id + '）') +
          (item.enabled ? '' : ' [已下架]') +
          '</option>'
        );
      })
      .join('');
}

async function acLoadShopOptions(root) {
  try {
    var r = await apiFetch('/api/admin/activation-codes/shop-options', { method: 'GET' });
    var d = await r.json().catch(function () {
      return {};
    });
    if (r.ok) acFillShopOptions(root, d.items || []);
  } catch (_e) {}
}

function acBuildPayload(root, options) {
  var opts = options || {};
  var doc = root.document;
  var type = String((doc.getElementById('activationCodeType') || {}).value || 'points');
  var maxUsesRaw = String((doc.getElementById('activationMaxUses') || {}).value || '1').trim();
  var payload = {
    type: type,
    maxUses: maxUsesRaw === 'unlimited' ? 0 : Number(maxUsesRaw || 1),
    perUserLimit: Number((doc.getElementById('activationPerUserLimit') || {}).value || 1),
    note: String((doc.getElementById('activationNote') || {}).value || '').trim(),
    batchLabel: String((doc.getElementById('activationBatchLabel') || {}).value || '').trim(),
    code: String((doc.getElementById('activationCustomCode') || {}).value || '').trim(),
    enabled: String((doc.getElementById('activationEnabled') || {}).value || '1') === '1'
  };
  var starts = String((doc.getElementById('activationStartsAt') || {}).value || '').trim();
  var expires = String((doc.getElementById('activationExpiresAt') || {}).value || '').trim();
  if (starts) payload.startsAt = starts;
  if (expires) payload.expiresAt = expires;
  if (type === 'points' || type === 'combo') {
    payload.pointsAmount = Number((doc.getElementById('activationPointsAmount') || {}).value || 0);
  }
  if (type === 'membership' || type === 'combo') {
    var customDays = String((doc.getElementById('activationMembershipCustomDays') || {}).value || '').trim();
    if (customDays) {
      payload.membershipDays = customDays === 'lifetime' ? 0 : Number(customDays);
    } else {
      var daysVal = String((doc.getElementById('activationMembershipDays') || {}).value || '').trim();
      payload.membershipDays = daysVal === 'lifetime' ? 0 : Number(daysVal || 0);
    }
  }
  if (type === 'shop_item') {
    payload.shopItemId = Number((doc.getElementById('activationShopItemId') || {}).value || 0);
  }
  if (opts.batch) {
    payload.count = Number((doc.getElementById('activationBatchCount') || {}).value || 1);
    payload.codeLength = Number((doc.getElementById('activationBatchCodeLength') || {}).value || 12);
    payload.prefix = String((doc.getElementById('activationBatchPrefix') || {}).value || '').trim();
  } else if (!opts.batch) {
    payload.codeLength = Number((doc.getElementById('activationCodeLength') || {}).value || 12);
    payload.prefix = String((doc.getElementById('activationCodePrefix') || {}).value || '').trim();
  }
  return payload;
}

function acRenderTable(root) {
  var st = acState(root);
  var tbody = root.document.getElementById('activationCodesTbody');
  if (!tbody) return;
  if (!st.codes.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="color:var(--muted);">暂无激活码，可在上方创建。</td></tr>';
    return;
  }
  tbody.innerHTML = st.codes
    .map(function (row) {
      return (
        '<tr data-code-id="' +
        row.id +
        '">' +
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
        acEsc(acUsesLabel(row)) +
        '</td>' +
        '<td>' +
        acEsc('每人 ' + (row.perUserLimit || 1) + ' 次') +
        '</td>' +
        '<td>' +
        (row.enabled ? '启用' : '停用') +
        '</td>' +
        '<td>' +
        acEsc(acFmtTime(row.startsAt)) +
        ' / ' +
        acEsc(acFmtTime(row.expiresAt)) +
        '</td>' +
        '<td>' +
        acEsc(row.batchLabel || '—') +
        '</td>' +
        '<td>' +
        acEsc(row.note || '—') +
        '</td>' +
        '<td><div class="ac-row-actions">' +
        '<button class="btn secondary ac-copy-btn" type="button" data-code="' +
        acEsc(row.code) +
        '">复制</button>' +
        '<button class="btn secondary ac-toggle-btn" type="button" data-enabled="' +
        (row.enabled ? '0' : '1') +
        '">' +
        (row.enabled ? '停用' : '启用') +
        '</button>' +
        '</div></td>' +
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
            acStatus('已复制：' + code);
          },
          function () {
            acStatus('复制失败：' + code);
          }
        );
      } else {
        acStatus('激活码：' + code);
      }
    });
  });
  tbody.querySelectorAll('.ac-toggle-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var row = btn.closest('tr');
      var id = Number(row && row.getAttribute('data-code-id'));
      var enabled = btn.getAttribute('data-enabled') === '1';
      if (id) acToggleCode(id, enabled);
    });
  });
}

async function acToggleCode(id, enabled) {
  try {
    var r = await apiFetch('/api/admin/activation-codes/' + encodeURIComponent(id), {
      method: 'POST',
      body: JSON.stringify({ enabled: enabled })
    });
    if (!r.ok) {
      var d = await r.json().catch(function () {
        return {};
      });
      acStatus('操作失败：' + ((d && d.error) || r.status));
      return;
    }
    acStatus(enabled ? '已启用' : '已停用');
    await loadActivationCodesAdmin();
  } catch (err) {
    acStatus('操作失败：' + ((err && err.message) || '网络错误'));
  }
}

async function loadActivationCodesAdmin() {
  if (!window.authUser || !window.authUser.isAdmin) {
    acStatus('没有权限：请使用管理员账号登录。');
    acRenderTable(window);
    return;
  }
  acStatus('加载中...');
  await acLoadShopOptions(window);
  try {
    var q = String((document.getElementById('activationSearchInput') || {}).value || '').trim();
    var r = await apiFetch(
      '/api/admin/activation-codes' + (q ? '?q=' + encodeURIComponent(q) : ''),
      { method: 'GET' }
    );
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
  var payload = acBuildPayload(window, { batch: false });
  var btn = document.getElementById('activationCreateBtn');
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
      acStatus('创建失败：' + acMapError(d.error || r.status));
      return;
    }
    acStatus('创建成功：' + (d.code && d.code.code ? d.code.code : ''));
    var custom = document.getElementById('activationCustomCode');
    if (custom) custom.value = '';
    await loadActivationCodesAdmin();
  } catch (err) {
    acStatus('创建失败：' + ((err && err.message) || '网络错误'));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '创建单个激活码';
    }
  }
}

async function createActivationCodeBatchAdmin() {
  if (!window.authUser || !window.authUser.isAdmin) {
    acStatus('没有权限：请使用管理员账号登录。');
    return;
  }
  var payload = acBuildPayload(window, { batch: true });
  var btn = document.getElementById('activationBatchCreateBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '批量创建中...';
  }
  acStatus('批量创建中...');
  try {
    var r = await apiFetch('/api/admin/activation-codes/batch', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    var d = await r.json().catch(function () {
      return {};
    });
    if (!r.ok) {
      acStatus('批量创建失败：' + acMapError(d.error || r.status));
      return;
    }
    acStatus('批量创建成功：' + (d.count || 0) + ' 个');
    await loadActivationCodesAdmin();
  } catch (err) {
    acStatus('批量创建失败：' + ((err && err.message) || '网络错误'));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '批量生成激活码';
    }
  }
}

function acMapError(code) {
  var map = {
    BAD_TYPE: '类型无效',
    BAD_POINTS_AMOUNT: '积分数量需在 1-1000000',
    BAD_MEMBERSHIP_DAYS: '会员天数无效',
    BAD_CODE: '激活码格式无效',
    BAD_MAX_USES: '总可用次数无效',
    BAD_SHOP_ITEM: '请选择商城道具',
    CODE_TAKEN: '激活码已存在',
    BATCH_CREATE_FAILED: '批量创建失败，请重试',
    SCHEMA_NOT_READY: '数据库未就绪，请重启 Node 服务后再试',
    INTERNAL_ERROR: '服务器内部错误，请查看 Node 日志'
  };
  return map[code] || String(code || '未知错误');
}

function acBind(root) {
  var doc = root.document;
  var typeEl = doc.getElementById('activationCodeType');
  if (typeEl) typeEl.addEventListener('change', function () {
    acSyncTypeFields(root);
  });
  var createBtn = doc.getElementById('activationCreateBtn');
  if (createBtn) createBtn.addEventListener('click', createActivationCodeAdmin);
  var batchBtn = doc.getElementById('activationBatchCreateBtn');
  if (batchBtn) batchBtn.addEventListener('click', createActivationCodeBatchAdmin);
  var reloadBtn = doc.getElementById('activationReloadBtn');
  if (reloadBtn) reloadBtn.addEventListener('click', loadActivationCodesAdmin);
  var searchBtn = doc.getElementById('activationSearchBtn');
  if (searchBtn) searchBtn.addEventListener('click', loadActivationCodesAdmin);
  var searchInput = doc.getElementById('activationSearchInput');
  if (searchInput) {
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') loadActivationCodesAdmin();
    });
  }
}

function acInstall(root) {
  if (!root.document || root.__adminActivationCodesInstalled) return;
  root.__adminActivationCodesInstalled = true;
  acInstallStyles(root);
  acSyncTypeFields(root);
  acBind(root);
  root.loadActivationCodesAdmin = loadActivationCodesAdmin;
  root.__adminActivationCodesRefreshShopOptions = function (items) {
    acFillShopOptions(root, items);
  };
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
