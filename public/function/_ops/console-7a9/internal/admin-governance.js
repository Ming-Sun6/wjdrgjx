(function (root, factory) {
  var api = factory(root || {});
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.adminGovernance = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  var hasDom = !!(root && root.document);
  var state = {
    initialized: false,
    overview: null,
    auditFilters: {},
    auditPage: 1,
    auditPageSize: 50,
    releaseFilters: {}
  };

  function getEl(id) {
    return hasDom ? root.document.getElementById(id) : null;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildQuery(params) {
    var pairs = [];
    Object.keys(params || {}).forEach(function (key) {
      var value = params[key];
      if (value === undefined || value === null || value === '') return;
      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    });
    return pairs.length ? '?' + pairs.join('&') : '';
  }

  function apiFetch(url, options) {
    var fetcher = root.apiFetch || root.fetch;
    if (typeof fetcher !== 'function') return Promise.reject(new Error('FETCH_UNAVAILABLE'));
    return fetcher.call(root, url, options || {});
  }

  async function apiGet(url) {
    var response = await apiFetch(url, { method: 'GET' });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || String(response.status));
    return data;
  }

  async function apiPost(url, body) {
    var response = await apiFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || String(response.status));
    return data;
  }

  function formatDateTime(value) {
    if (!value) return '-';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('zh-CN', { hour12: false });
  }

  function formatRiskLevelLabel(level) {
    var key = String(level || '').toLowerCase();
    var labels = {
      fail: '失败',
      danger: '危险',
      watch: '关注',
      ok: '正常',
      info: '信息'
    };
    return labels[key] || labels.info;
  }

  function formatCount(value) {
    var count = Number(value || 0);
    return Number.isFinite(count) ? String(count) : '0';
  }

  function riskClass(level) {
    var key = String(level || 'info').toLowerCase();
    return /^(fail|danger|watch|ok|info)$/.test(key) ? key : 'info';
  }

  function renderTodayWorkspace(overview) {
    var counts = (overview && overview.counts) || {};
    var latest = (overview && overview.latestReleaseCheck) || null;
    var cards = [
      { label: '待审核内容', value: counts.pendingReview, hint: '内容审核队列' },
      { label: '待审删号', value: counts.pendingDeleteRequests, hint: '黑屋删号审核' },
      { label: '处罚中账号', value: counts.punishedAccounts, hint: '封禁或禁言' },
      { label: '用户发声', value: counts.userVoices, hint: '反馈收件箱' },
      { label: '日历事项', value: counts.calendarItems, hint: '活动安排' },
      { label: '管理员/版主', value: formatCount(counts.adminCount) + '/' + formatCount(counts.moderatorCount), hint: '权限配置' }
    ];
    return '<div class="governance-workspace-grid">' + cards.map(function (card) {
      return '<article class="governance-workspace-card">' +
        '<span>' + escapeHtml(card.label) + '</span>' +
        '<strong>' + escapeHtml(formatCount(card.value)) + '</strong>' +
        '<small>' + escapeHtml(card.hint) + '</small>' +
        '</article>';
    }).join('') + '</div>' +
      '<div class="governance-latest-note">最新发布检查：' +
      (latest ? '<b class="risk-' + riskClass(latest.riskLevel) + '">' + escapeHtml(formatRiskLevelLabel(latest.riskLevel)) + '</b> · ' + escapeHtml(latest.summary || '') : '暂无记录') +
      '</div>';
  }

  function renderReleaseCheck(check) {
    if (!check) return '<div class="governance-empty">暂无发布检查记录</div>';
    var items = Array.isArray(check.items) ? check.items : [];
    return '<article class="governance-release-card risk-' + riskClass(check.riskLevel) + '">' +
      '<div class="governance-release-head">' +
      '<strong>' + escapeHtml(formatRiskLevelLabel(check.riskLevel)) + '</strong>' +
      '<span>' + escapeHtml(formatDateTime(check.createdAt)) + '</span>' +
      '</div>' +
      '<p>' + escapeHtml(check.summary || '') + '</p>' +
      '<ul class="governance-check-list">' + items.map(function (item) {
        return '<li class="risk-' + riskClass(item && item.level) + '">' +
          '<b>' + escapeHtml((item && item.label) || (item && item.key) || '检查项') + '</b>' +
          '<span>' + escapeHtml(formatRiskLevelLabel(item && item.level)) + '</span>' +
          '<small>' + escapeHtml((item && item.summary) || '') + '</small>' +
          '</li>';
      }).join('') + '</ul>' +
      '</article>';
  }

  function renderRiskCardsMarkup(risks) {
    var rows = Array.isArray(risks) ? risks : [];
    if (!rows.length) return '<div class="governance-empty">暂无需要处理的风险</div>';
    return rows.map(function (risk) {
      var level = riskClass(risk && risk.level);
      var targetPage = (risk && risk.targetPage) || '';
      var targetPanel = (risk && risk.targetPanel) || '';
      return '<article class="governance-risk-card risk-' + level + '">' +
        '<div class="governance-risk-title">' +
        '<span>' + escapeHtml(formatRiskLevelLabel(level)) + '</span>' +
        '<strong>' + escapeHtml((risk && risk.title) || '风险提醒') + '</strong>' +
        '</div>' +
        '<p>' + escapeHtml((risk && risk.summary) || '') + '</p>' +
        '<button type="button" class="governance-target-btn" data-governance-page="' + escapeHtml(targetPage) + '" data-governance-panel="' + escapeHtml(targetPanel) + '">' +
        escapeHtml((risk && risk.actionLabel) || '查看') +
        '</button>' +
        '</article>';
    }).join('');
  }

  function renderAuditRows(logs) {
    var rows = Array.isArray(logs) ? logs : [];
    if (!rows.length) {
      return '<tr><td colspan="6" class="governance-empty">暂无审计记录</td></tr>';
    }
    return rows.map(function (log) {
      var actor = (log && (log.actorUsername || log.actorLoginId || log.actorId)) || '-';
      var target = (log && log.targetType ? log.targetType : '-') + (log && log.targetId ? ' #' + log.targetId : '');
      return '<tr>' +
        '<td>' + escapeHtml(formatDateTime(log && log.createdAt)) + '</td>' +
        '<td>' + escapeHtml(actor) + '</td>' +
        '<td>' + escapeHtml((log && log.action) || '-') + '</td>' +
        '<td><span class="risk-chip risk-' + riskClass(log && log.riskLevel) + '">' + escapeHtml(formatRiskLevelLabel(log && log.riskLevel)) + '</span></td>' +
        '<td>' + escapeHtml(target) + '</td>' +
        '<td>' + escapeHtml((log && log.summary) || '') + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderReleaseHistory(checks) {
    var rows = Array.isArray(checks) ? checks : [];
    if (!rows.length) return '<div class="governance-empty">暂无历史发布检查</div>';
    return rows.map(function (check) {
      return '<article class="governance-history-card risk-' + riskClass(check && check.riskLevel) + '">' +
        '<strong>' + escapeHtml(formatRiskLevelLabel(check && check.riskLevel)) + '</strong>' +
        '<p>' + escapeHtml((check && check.summary) || '') + '</p>' +
        '<small>' + escapeHtml(formatDateTime(check && check.createdAt)) + '</small>' +
        '</article>';
    }).join('');
  }

  function setHtml(id, html) {
    var el = getEl(id);
    if (el) el.innerHTML = html;
  }

  function renderOverview(overview) {
    setHtml('governanceTodayWorkspace', renderTodayWorkspace(overview));
    setHtml('governanceReleaseCheck', renderReleaseCheck(overview && overview.latestReleaseCheck));
    setHtml('governanceRiskCards', renderRiskCardsMarkup((overview && overview.risks) || []));
  }

  async function load() {
    if (!hasDom) return null;
    if (root.currentPage && root.currentPage !== 'governance') return null;
    if (root.authUser && !root.authUser.isAdmin) {
      setHtml('governanceTodayWorkspace', '<div class="governance-empty">仅管理员可查看治理中心</div>');
      return null;
    }
    try {
      if (typeof root.setStatus === 'function') root.setStatus('governanceStatus', '正在加载治理中心...');
      var overview = await apiGet('/api/admin/governance/overview');
      state.overview = overview;
      renderOverview(overview);
      await loadAuditLogs(null, { resetPage: true }).catch(function () {});
      if (typeof root.setStatus === 'function') root.setStatus('governanceStatus', '治理中心已更新');
      return overview;
    } catch (error) {
      setHtml('governanceTodayWorkspace', '<div class="governance-empty">加载治理中心失败：' + escapeHtml(error && error.message) + '</div>');
      if (typeof root.setStatus === 'function') root.setStatus('governanceStatus', '治理中心加载失败');
      throw error;
    }
  }

  async function runReleaseCheck() {
    var data = await apiPost('/api/admin/release-checks/run', {});
    setHtml('governanceReleaseCheck', renderReleaseCheck(data.check));
    await load().catch(function () {});
    return data.check;
  }

  function readFilterValue(id) {
    var el = getEl(id);
    return el ? String(el.value || '').trim() : '';
  }

  function readPageSize() {
    var value = Number.parseInt(readFilterValue('governanceAuditPageSize'), 10);
    if (value === 20 || value === 50 || value === 100) return value;
    return 50;
  }

  function renderAuditPager(data) {
    var total = Number((data && data.total) || 0);
    var page = Number((data && data.page) || 1);
    var totalPages = Number((data && data.totalPages) || 1);
    var pageSize = Number((data && data.pageSize) || state.auditPageSize || 50);
    var info = getEl('governanceAuditPageInfo');
    var pager = getEl('governanceAuditPager');
    var prev = getEl('governanceAuditPrevBtn');
    var next = getEl('governanceAuditNextBtn');
    if (info) info.textContent = '共 ' + total + ' 条 · 每页 ' + pageSize + ' 条';
    if (pager) pager.textContent = '第 ' + page + ' / ' + totalPages + ' 页';
    if (prev) prev.disabled = page <= 1;
    if (next) next.disabled = page >= totalPages;
  }

  async function loadAuditLogs(filters, options) {
    var resetPage = !!(options && options.resetPage);
    var nextPage = options && options.page;
    if (resetPage) state.auditPage = 1;
    else if (nextPage) state.auditPage = Math.max(1, Number(nextPage) || 1);
    state.auditPageSize = readPageSize();
    var source = filters || {
      q: readFilterValue('governanceAuditQ'),
      action: readFilterValue('governanceAuditAction'),
      targetType: readFilterValue('governanceAuditTargetType'),
      targetId: readFilterValue('governanceAuditTargetId'),
      riskLevel: readFilterValue('governanceAuditRiskLevel'),
      from: readFilterValue('governanceAuditFrom'),
      to: readFilterValue('governanceAuditTo')
    };
    source.page = state.auditPage;
    source.pageSize = state.auditPageSize;
    state.auditFilters = source;
    var data = await apiGet('/api/admin/audit-logs' + buildQuery(source));
    state.auditPage = Number(data.page || state.auditPage);
    setHtml('governanceAuditRows', renderAuditRows(data.logs || []));
    renderAuditPager(data);
    return data;
  }

  async function loadReleaseChecks(filters) {
    var source = filters || {
      riskLevel: readFilterValue('governanceReleaseRiskLevel'),
      from: readFilterValue('governanceReleaseFrom'),
      to: readFilterValue('governanceReleaseTo')
    };
    state.releaseFilters = source;
    var data = await apiGet('/api/admin/release-checks' + buildQuery(source));
    setHtml('governanceReleaseHistory', renderReleaseHistory(data.checks || []));
    return data;
  }

  function navigateTarget(page, panel) {
    if (!page) return;
    if (typeof root.showPage === 'function') root.showPage(page);
    else root.currentPage = page;
    if (panel && typeof root.switchGovernanceTargetPanel === 'function') {
      root.switchGovernanceTargetPanel(page, panel);
    }
  }

  function bind() {
    if (!hasDom || state.initialized) return;
    state.initialized = true;
    var runBtn = getEl('governanceRunCheckBtn') || getEl('governanceRunReleaseCheck');
    var auditBtn = getEl('governanceAuditSearchBtn');
    var auditPrev = getEl('governanceAuditPrevBtn');
    var auditNext = getEl('governanceAuditNextBtn');
    var auditPageSize = getEl('governanceAuditPageSize');
    var releaseBtn = getEl('governanceReleaseSearchBtn');
    var refreshBtn = getEl('governanceRefreshBtn');

    if (runBtn) runBtn.addEventListener('click', runReleaseCheck);
    if (auditBtn) auditBtn.addEventListener('click', function () { loadAuditLogs(null, { resetPage: true }); });
    if (auditPrev) {
      auditPrev.addEventListener('click', function () {
        if (auditPrev.disabled) return;
        loadAuditLogs(null, { page: state.auditPage - 1 });
      });
    }
    if (auditNext) {
      auditNext.addEventListener('click', function () {
        if (auditNext.disabled) return;
        loadAuditLogs(null, { page: state.auditPage + 1 });
      });
    }
    if (auditPageSize) {
      auditPageSize.addEventListener('change', function () { loadAuditLogs(null, { resetPage: true }); });
    }
    ['governanceAuditQ', 'governanceAuditAction', 'governanceAuditTargetType', 'governanceAuditTargetId'].forEach(function (id) {
      var input = getEl(id);
      if (!input) return;
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          loadAuditLogs(null, { resetPage: true });
        }
      });
    });
    if (releaseBtn) releaseBtn.addEventListener('click', function () { loadReleaseChecks(); });
    if (refreshBtn) refreshBtn.addEventListener('click', load);
    root.document.addEventListener('click', function (event) {
      var btn = event.target && event.target.closest ? event.target.closest('[data-governance-page]') : null;
      if (!btn) return;
      navigateTarget(btn.getAttribute('data-governance-page'), btn.getAttribute('data-governance-panel'));
    });
  }

  if (hasDom) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', bind);
    else bind();
  }

  return {
    init: bind,
    load: load,
    runReleaseCheck: runReleaseCheck,
    loadAuditLogs: loadAuditLogs,
    loadReleaseChecks: loadReleaseChecks,
    __test__: {
      apiGet: apiGet,
      apiPost: apiPost,
      escapeHtml: escapeHtml,
      formatDateTime: formatDateTime,
      formatRiskLevelLabel: formatRiskLevelLabel,
      renderTodayWorkspace: renderTodayWorkspace,
      renderReleaseCheck: renderReleaseCheck,
      renderRiskCardsMarkup: renderRiskCardsMarkup,
      renderAuditRows: renderAuditRows,
      renderAuditPager: renderAuditPager,
      renderReleaseHistory: renderReleaseHistory
    }
  };
});
