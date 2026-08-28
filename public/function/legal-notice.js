(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__wjdrLegalNoticeBound) return;
  window.__wjdrLegalNoticeBound = true;

  var ACK_KEY = 'wjdr_legal_notice_ack';
  var MODAL_ID = 'wjdr-legal-notice-modal';

  function shouldSkip() {
    try {
      if (window.location && window.location.protocol === 'file:') return true;
      var params = new URLSearchParams(window.location.search || '');
      if (params.get('embed') === '1') return true;
      var path = String(window.location.pathname || '');
      if (/\/_ops\//i.test(path)) return true;
      if (/admin\.html$/i.test(path)) return true;
      if (/^\/legal(\/|$)/i.test(path)) return true;
    } catch (_e) {}
    return false;
  }

  function readAck() {
    try {
      return String(window.localStorage.getItem(ACK_KEY) || '').trim();
    } catch (_e) {
      return '';
    }
  }

  function writeAck(version) {
    try {
      window.localStorage.setItem(ACK_KEY, String(version || ''));
    } catch (_e) {}
  }

  function injectStyles() {
    if (document.getElementById('wjdr-legal-notice-styles')) return;
    var style = document.createElement('style');
    style.id = 'wjdr-legal-notice-styles';
    style.textContent =
      '#' + MODAL_ID + '{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);z-index:10040;padding:16px;box-sizing:border-box}' +
      '#' + MODAL_ID + '.open{display:flex}' +
      '#' + MODAL_ID + ' .wjdr-legal-notice-panel{width:520px;max-width:95vw;max-height:85vh;display:flex;flex-direction:column;background:rgba(30,41,59,.96);border:1px solid rgba(148,163,184,.28);border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.45);color:#e2e8f0;backdrop-filter:blur(10px);overflow:hidden}' +
      '#' + MODAL_ID + ' .wjdr-legal-notice-body{padding:18px 18px 8px;overflow:auto}' +
      '#' + MODAL_ID + ' .wjdr-legal-notice-title{margin:0 0 8px;font-size:1.05rem;color:#60a5fa}' +
      '#' + MODAL_ID + ' .wjdr-legal-notice-meta{margin:0 0 10px;color:#94a3b8;font-size:12px}' +
      '#' + MODAL_ID + ' .wjdr-legal-notice-summary{margin:0 0 12px;font-size:13px;line-height:1.75;color:#e2e8f0}' +
      '#' + MODAL_ID + ' .wjdr-legal-notice-links{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}' +
      '#' + MODAL_ID + ' .wjdr-legal-notice-links a{display:block;padding:8px 10px;border:1px solid rgba(148,163,184,.28);border-radius:10px;color:#93c5fd;text-decoration:none;font-size:13px}' +
      '#' + MODAL_ID + ' .wjdr-legal-notice-links a:hover{border-color:rgba(147,197,253,.7)}' +
      '#' + MODAL_ID + ' .wjdr-legal-notice-actions{padding:12px 18px 16px;border-top:1px solid rgba(148,163,184,.2);flex-shrink:0}' +
      '#' + MODAL_ID + ' .wjdr-legal-notice-confirm{width:100%;height:40px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-size:14px;font-weight:700;cursor:pointer}' +
      '#' + MODAL_ID + ' .wjdr-legal-notice-confirm:hover{background:#1d4ed8}' +
      'html[data-theme="day"] #' + MODAL_ID + ' .wjdr-legal-notice-panel,body.theme-day #' + MODAL_ID + ' .wjdr-legal-notice-panel{background:rgba(255,255,255,.96);color:#0f172a;border-color:rgba(15,23,42,.14)}' +
      'html[data-theme="day"] #' + MODAL_ID + ' .wjdr-legal-notice-title,body.theme-day #' + MODAL_ID + ' .wjdr-legal-notice-title{color:#1d4ed8}' +
      'html[data-theme="day"] #' + MODAL_ID + ' .wjdr-legal-notice-summary,body.theme-day #' + MODAL_ID + ' .wjdr-legal-notice-summary{color:#1e293b}' +
      'html[data-theme="day"] #' + MODAL_ID + ' .wjdr-legal-notice-meta,body.theme-day #' + MODAL_ID + ' .wjdr-legal-notice-meta{color:#64748b}' +
      'html[data-theme="day"] #' + MODAL_ID + ' .wjdr-legal-notice-links a,body.theme-day #' + MODAL_ID + ' .wjdr-legal-notice-links a{color:#1d4ed8;border-color:rgba(15,23,42,.12)}';
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureModal(notice) {
    injectStyles();
    var modal = document.getElementById(MODAL_ID);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = MODAL_ID;
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML =
        '<div class="wjdr-legal-notice-panel" role="dialog" aria-modal="true" aria-labelledby="wjdr-legal-notice-title">' +
        '<div class="wjdr-legal-notice-body">' +
        '<h3 class="wjdr-legal-notice-title" id="wjdr-legal-notice-title"></h3>' +
        '<p class="wjdr-legal-notice-meta" id="wjdr-legal-notice-meta"></p>' +
        '<p class="wjdr-legal-notice-summary" id="wjdr-legal-notice-summary"></p>' +
        '<ul class="wjdr-legal-notice-links" id="wjdr-legal-notice-links"></ul>' +
        '</div>' +
        '<div class="wjdr-legal-notice-actions">' +
        '<button type="button" class="wjdr-legal-notice-confirm" id="wjdr-legal-notice-confirm">确定</button>' +
        '</div>' +
        '</div>';
      document.body.appendChild(modal);
    }

    var titleEl = document.getElementById('wjdr-legal-notice-title');
    var metaEl = document.getElementById('wjdr-legal-notice-meta');
    var summaryEl = document.getElementById('wjdr-legal-notice-summary');
    var linksEl = document.getElementById('wjdr-legal-notice-links');
    var confirmBtn = document.getElementById('wjdr-legal-notice-confirm');
    if (titleEl) titleEl.textContent = notice.title || '用户协议与隐私政策更新';
    if (summaryEl) summaryEl.textContent = notice.summary || '';
    if (metaEl) {
      metaEl.textContent = notice.publishedAt ? ('发布日期：' + String(notice.publishedAt).slice(0, 10)) : '请阅读后点击确定';
    }
    if (linksEl) {
      linksEl.innerHTML = '';
      (notice.links || []).forEach(function (link) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = link.href || '#';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = '阅读《' + (link.title || '') + '》';
        li.appendChild(a);
        linksEl.appendChild(li);
      });
    }
    if (confirmBtn) {
      confirmBtn.onclick = function () {
        writeAck(notice.version);
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
      };
    }
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function boot() {
    if (shouldSkip()) return;
    if (typeof fetch !== 'function') return;
    fetch('/api/legal-notice', { method: 'GET', credentials: 'same-origin', cache: 'no-store' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        var notice = data && data.notice;
        if (!notice || !notice.version) return;
        if (readAck() === String(notice.version)) return;
        ensureModal(notice);
      })
      .catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
