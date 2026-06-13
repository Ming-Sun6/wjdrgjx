'use strict';

function shopState(root) {
  if (!root.__adminShopState) {
    root.__adminShopState = { items: [], editingId: null, purchases: [], purchasePage: 1, purchasePageSize: 20, purchaseTotal: 0, purchaseTotalPages: 1 };
  }
  return root.__adminShopState;
}

function shopStatus(msg) {
  if (typeof setStatus === 'function') setStatus('shopAdminStatus', msg);
}

function shopPurchaseStatus(msg) {
  if (typeof setStatus === 'function') setStatus('shopPurchaseStatus', msg);
}

function shopEsc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shopFmtTime(v) {
  if (!v) return '-';
  var d = new Date(v);
  if (!Number.isFinite(d.getTime())) return String(v);
  var p = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function shopTypeLabel(type) {
  if (type === 'points') return '积分礼包';
  if (type === 'combo') return '组合道具';
  return '会员道具';
}

function shopRewardLabel(item) {
  if (!item) return '—';
  if (item.itemType === 'points') return '+' + (item.pointsReward || 0) + ' 积分';
  if (item.itemType === 'membership') {
    return item.membershipDays === 0 ? '永久会员' : item.membershipDays + ' 天会员';
  }
  if (item.itemType === 'combo') {
    var mem = item.membershipDays === 0 ? '永久会员' : item.membershipDays + ' 天会员';
    return '+' + (item.pointsReward || 0) + ' 积分 + ' + mem;
  }
  return '—';
}

function shopInstallStyles(root) {
  if (root.document.getElementById('adminShopStyles')) return;
  var style = root.document.createElement('style');
  style.id = 'adminShopStyles';
  style.textContent =
    '#page-shop .shop-admin-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:10px 12px;margin-bottom:14px}' +
    '#page-shop .shop-admin-grid .form-group{display:flex;flex-direction:column;gap:5px;min-width:0}' +
    '#page-shop .shop-admin-grid label{font-size:.74rem;color:var(--muted);font-weight:700}' +
    '#page-shop .shop-admin-grid input,#page-shop .shop-admin-grid select,#page-shop .shop-admin-grid textarea{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);font:inherit}' +
    '#page-shop .shop-span-3{grid-column:span 3}#page-shop .shop-span-4{grid-column:span 4}#page-shop .shop-span-6{grid-column:span 6}#page-shop .shop-span-12{grid-column:1/-1}' +
    '@media(max-width:900px){#page-shop .shop-span-3,#page-shop .shop-span-4,#page-shop .shop-span-6{grid-column:1/-1}}' +
    '#page-shop .table-wrap table{min-width:1080px}' +
    '#page-shop .shop-row-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}';
  root.document.head.appendChild(style);
}

function shopSyncTypeFields(root) {
  var typeEl = root.document.getElementById('shopItemType');
  var pointsWrap = root.document.getElementById('shopPointsRewardWrap');
  var membershipWrap = root.document.getElementById('shopMembershipDaysWrap');
  if (!typeEl) return;
  var type = String(typeEl.value || 'membership');
  if (pointsWrap) pointsWrap.style.display = type === 'points' || type === 'combo' ? '' : 'none';
  if (membershipWrap) membershipWrap.style.display = type === 'membership' || type === 'combo' ? '' : 'none';
}

function shopClearForm(root) {
  var doc = root.document;
  shopState(root).editingId = null;
  var map = {
    shopItemName: '',
    shopItemDesc: '',
    shopItemType: 'membership',
    shopItemPrice: '100',
    shopPointsReward: '50',
    shopMembershipDays: '30',
    shopItemBadge: '',
    shopItemStock: '',
    shopItemSort: '0',
    shopItemEnabled: '1'
  };
  Object.keys(map).forEach(function (id) {
    var el = doc.getElementById(id);
    if (el) el.value = map[id];
  });
  var saveBtn = doc.getElementById('shopItemSaveBtn');
  if (saveBtn) saveBtn.textContent = '上架道具';
  shopSyncTypeFields(root);
}

function shopFillForm(root, item) {
  var doc = root.document;
  shopState(root).editingId = item.id;
  if (doc.getElementById('shopItemName')) doc.getElementById('shopItemName').value = item.name || '';
  if (doc.getElementById('shopItemDesc')) doc.getElementById('shopItemDesc').value = item.description || '';
  if (doc.getElementById('shopItemType')) doc.getElementById('shopItemType').value = item.itemType || 'membership';
  if (doc.getElementById('shopItemPrice')) doc.getElementById('shopItemPrice').value = String(item.pricePoints || 0);
  if (doc.getElementById('shopPointsReward')) doc.getElementById('shopPointsReward').value = String(item.pointsReward || 0);
  if (doc.getElementById('shopMembershipDays')) {
    doc.getElementById('shopMembershipDays').value =
      item.membershipDays === 0 ? 'lifetime' : String(item.membershipDays || 30);
  }
  if (doc.getElementById('shopItemBadge')) doc.getElementById('shopItemBadge').value = item.badgeText || '';
  if (doc.getElementById('shopItemStock')) {
    doc.getElementById('shopItemStock').value = item.stockLimit == null ? '' : String(item.stockLimit);
  }
  if (doc.getElementById('shopItemSort')) doc.getElementById('shopItemSort').value = String(item.sortOrder || 0);
  if (doc.getElementById('shopItemEnabled')) doc.getElementById('shopItemEnabled').value = item.enabled ? '1' : '0';
  var saveBtn = doc.getElementById('shopItemSaveBtn');
  if (saveBtn) saveBtn.textContent = '保存修改';
  shopSyncTypeFields(root);
}

function shopBuildPayload(root) {
  var doc = root.document;
  var type = String((doc.getElementById('shopItemType') || {}).value || 'membership');
  var payload = {
    name: String((doc.getElementById('shopItemName') || {}).value || '').trim(),
    description: String((doc.getElementById('shopItemDesc') || {}).value || '').trim(),
    itemType: type,
    pricePoints: Number((doc.getElementById('shopItemPrice') || {}).value || 0),
    badgeText: String((doc.getElementById('shopItemBadge') || {}).value || '').trim(),
    sortOrder: Number((doc.getElementById('shopItemSort') || {}).value || 0),
    enabled: String((doc.getElementById('shopItemEnabled') || {}).value || '1') === '1'
  };
  var stock = String((doc.getElementById('shopItemStock') || {}).value || '').trim();
  if (stock) payload.stockLimit = Number(stock);
  if (type === 'points' || type === 'combo') {
    payload.pointsReward = Number((doc.getElementById('shopPointsReward') || {}).value || 0);
  }
  if (type === 'membership' || type === 'combo') {
    var daysVal = String((doc.getElementById('shopMembershipDays') || {}).value || '').trim();
    payload.membershipDays = daysVal === 'lifetime' ? 0 : Number(daysVal || 0);
  }
  return payload;
}

function shopRenderTable(root) {
  var st = shopState(root);
  var tbody = root.document.getElementById('shopItemsTbody');
  if (!tbody) return;
  if (!st.items.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="color:var(--muted);">暂无商城道具，可在上方创建。</td></tr>';
    return;
  }
  tbody.innerHTML = st.items
    .map(function (item) {
      var stockText = item.stockLimit == null ? '不限' : String(item.soldCount || 0) + '/' + item.stockLimit;
      return (
        '<tr data-item-id="' +
        item.id +
        '">' +
        '<td>' +
        shopEsc(item.name) +
        '</td>' +
        '<td>' +
        shopEsc(shopTypeLabel(item.itemType)) +
        '</td>' +
        '<td>' +
        shopEsc(shopRewardLabel(item)) +
        '</td>' +
        '<td>' +
        shopEsc(String(item.pricePoints || 0)) +
        '</td>' +
        '<td>' +
        shopEsc(stockText) +
        '</td>' +
        '<td>' +
        shopEsc(String(item.sortOrder || 0)) +
        '</td>' +
        '<td>' +
        (item.enabled ? '上架' : '下架') +
        '</td>' +
        '<td>' +
        shopEsc(item.badgeText || '—') +
        '</td>' +
        '<td><div class="shop-row-actions">' +
        '<button class="btn secondary shop-edit-btn" type="button">编辑</button>' +
        '<button class="btn danger shop-del-btn" type="button">删除</button>' +
        '</div></td>' +
        '</tr>'
      );
    })
    .join('');

  tbody.querySelectorAll('.shop-edit-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var row = btn.closest('tr');
      var id = Number(row && row.getAttribute('data-item-id'));
      var item = st.items.find(function (it) {
        return Number(it.id) === id;
      });
      if (item) shopFillForm(root, item);
    });
  });
  tbody.querySelectorAll('.shop-del-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var row = btn.closest('tr');
      var id = Number(row && row.getAttribute('data-item-id'));
      if (id) shopDeleteItem(id);
    });
  });
}



function shopRenderPurchases(root) {
  var st = shopState(root);
  var tbody = root.document.getElementById('shopPurchasesTbody');
  var pageInfo = root.document.getElementById('shopPurchasePageInfo');
  var prev = root.document.getElementById('shopPurchasePrevBtn');
  var next = root.document.getElementById('shopPurchaseNextBtn');
  if (pageInfo) pageInfo.textContent = '第 ' + st.purchasePage + ' / ' + st.purchaseTotalPages + ' 页，共 ' + st.purchaseTotal + ' 条';
  if (prev) prev.disabled = st.purchasePage <= 1;
  if (next) next.disabled = st.purchasePage >= st.purchaseTotalPages;
  if (!tbody) return;
  if (!st.purchases.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="color:var(--muted);">暂无兑换记录。</td></tr>';
    return;
  }
  tbody.innerHTML = st.purchases.map(function (row) {
    var user = row.user || {};
    var item = row.item || {};
    return '<tr>' +
      '<td>' + shopEsc(shopFmtTime(row.purchasedAt)) + '</td>' +
      '<td>' + shopEsc(String(row.userId || '-')) + '</td>' +
      '<td>' + shopEsc((user.username || user.loginId || '未知用户') + (user.loginId ? '（' + user.loginId + '）' : '')) + '</td>' +
      '<td>' + shopEsc(item.name || ('道具 #' + (row.itemId || '?'))) + '</td>' +
      '<td>' + shopEsc(shopTypeLabel(item.itemType)) + '</td>' +
      '<td>' + shopEsc(String(row.pointsSpent || 0)) + '</td>' +
      '<td>' + shopEsc(String(row.id || '-')) + '</td>' +
    '</tr>';
  }).join('');
}

async function loadShopPurchasesAdmin(opts) {
  var options = opts || {};
  if (!window.authUser || !window.authUser.isAdmin) {
    shopPurchaseStatus('没有权限：请使用管理员账号登录。');
    shopRenderPurchases(window);
    return;
  }
  if (options.page) shopState(window).purchasePage = Math.max(1, Number(options.page) || 1);
  shopPurchaseStatus('兑换记录加载中...');
  try {
    var st = shopState(window);
    var q = String((document.getElementById('shopPurchaseSearchInput') || {}).value || '').trim();
    var params = new URLSearchParams();
    if (q) params.set('q', q);
    params.set('page', String(st.purchasePage));
    params.set('pageSize', String(st.purchasePageSize));
    var r = await apiFetch('/api/admin/shop/purchases?' + params.toString(), { method: 'GET' });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      shopPurchaseStatus('兑换记录加载失败：' + ((d && d.error) || r.status));
      return;
    }
    st.purchases = Array.isArray(d.purchases) ? d.purchases : [];
    st.purchasePage = Number(d.page || st.purchasePage);
    st.purchaseTotal = Number(d.total || 0);
    st.purchaseTotalPages = Math.max(1, Number(d.totalPages || 1));
    shopRenderPurchases(window);
    shopPurchaseStatus('共 ' + st.purchaseTotal + ' 条兑换记录');
  } catch (err) {
    shopPurchaseStatus('兑换记录加载失败：' + ((err && err.message) || '网络错误'));
  }
}

async function loadShopAdmin() {
  if (!window.authUser || !window.authUser.isAdmin) {
    shopStatus('没有权限：请使用管理员账号登录。');
    shopRenderTable(window);
    return;
  }
  shopStatus('加载中...');
  try {
    var r = await apiFetch('/api/admin/shop/items', { method: 'GET' });
    var d = await r.json().catch(function () {
      return {};
    });
    if (!r.ok) {
      shopStatus('加载失败：' + ((d && d.error) || r.status));
      return;
    }
    shopState(window).items = Array.isArray(d.items) ? d.items : [];
    shopRenderTable(window);
    shopStatus('共 ' + shopState(window).items.length + ' 个道具');
    await loadShopPurchasesAdmin();
    if (window.__adminActivationCodesRefreshShopOptions) {
      window.__adminActivationCodesRefreshShopOptions(shopState(window).items);
    }
  } catch (err) {
    shopStatus('加载失败：' + ((err && err.message) || '网络错误'));
  }
}

async function saveShopItemAdmin() {
  if (!window.authUser || !window.authUser.isAdmin) {
    shopStatus('没有权限：请使用管理员账号登录。');
    return;
  }
  var payload = shopBuildPayload(window);
  var editingId = shopState(window).editingId;
  var btn = document.getElementById('shopItemSaveBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '保存中...';
  }
  shopStatus('保存中...');
  try {
    var url = editingId
      ? '/api/admin/shop/items/' + encodeURIComponent(editingId)
      : '/api/admin/shop/items';
    var r = await apiFetch(url, { method: 'POST', body: JSON.stringify(payload) });
    var d = await r.json().catch(function () {
      return {};
    });
    if (!r.ok) {
      shopStatus('保存失败：' + ((d && d.error) || r.status));
      return;
    }
    shopStatus(editingId ? '道具已更新' : '道具已上架');
    shopClearForm(window);
    await loadShopAdmin();
  } catch (err) {
    shopStatus('保存失败：' + ((err && err.message) || '网络错误'));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = shopState(window).editingId ? '保存修改' : '上架道具';
    }
  }
}

async function shopDeleteItem(itemId) {
  if (!window.confirm('确认删除该商城道具？')) return;
  try {
    var r = await apiFetch('/api/admin/shop/items/' + encodeURIComponent(itemId), { method: 'DELETE' });
    if (!r.ok) {
      var d = await r.json().catch(function () {
        return {};
      });
      shopStatus('删除失败：' + ((d && d.error) || r.status));
      return;
    }
    shopStatus('道具已删除');
    await loadShopAdmin();
  } catch (err) {
    shopStatus('删除失败：' + ((err && err.message) || '网络错误'));
  }
}

function shopBind(root) {
  var doc = root.document;
  var typeEl = doc.getElementById('shopItemType');
  if (typeEl) typeEl.addEventListener('change', function () {
    shopSyncTypeFields(root);
  });
  var saveBtn = doc.getElementById('shopItemSaveBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveShopItemAdmin);
  var resetBtn = doc.getElementById('shopItemResetBtn');
  if (resetBtn) resetBtn.addEventListener('click', function () {
    shopClearForm(root);
  });
  var reloadBtn = doc.getElementById('shopReloadBtn');
  if (reloadBtn) reloadBtn.addEventListener('click', loadShopAdmin);
  var purchaseReloadBtn = doc.getElementById('shopPurchaseReloadBtn');
  if (purchaseReloadBtn) purchaseReloadBtn.addEventListener('click', function () {
    loadShopPurchasesAdmin();
  });
  var purchaseSearchBtn = doc.getElementById('shopPurchaseSearchBtn');
  if (purchaseSearchBtn) purchaseSearchBtn.addEventListener('click', function () {
    shopState(root).purchasePage = 1;
    loadShopPurchasesAdmin();
  });
  var purchaseSearchInput = doc.getElementById('shopPurchaseSearchInput');
  if (purchaseSearchInput) {
    purchaseSearchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        shopState(root).purchasePage = 1;
        loadShopPurchasesAdmin();
      }
    });
  }
  var purchasePrevBtn = doc.getElementById('shopPurchasePrevBtn');
  if (purchasePrevBtn) purchasePrevBtn.addEventListener('click', function () {
    var st = shopState(root);
    if (st.purchasePage > 1) loadShopPurchasesAdmin({ page: st.purchasePage - 1 });
  });
  var purchaseNextBtn = doc.getElementById('shopPurchaseNextBtn');
  if (purchaseNextBtn) purchaseNextBtn.addEventListener('click', function () {
    var st = shopState(root);
    if (st.purchasePage < st.purchaseTotalPages) loadShopPurchasesAdmin({ page: st.purchasePage + 1 });
  });

}

function shopInstall(root) {
  if (!root.document || root.__adminShopInstalled) return;
  root.__adminShopInstalled = true;
  shopInstallStyles(root);
  shopSyncTypeFields(root);
  shopBind(root);
  root.loadShopAdmin = loadShopAdmin;
  root.loadShopPurchasesAdmin = loadShopPurchasesAdmin;
}

if (typeof window !== 'undefined' && window.document) {
  if (window.document.readyState === 'loading') {
    window.document.addEventListener('DOMContentLoaded', function () {
      shopInstall(window);
    }, { once: true });
  } else {
    shopInstall(window);
  }
}
