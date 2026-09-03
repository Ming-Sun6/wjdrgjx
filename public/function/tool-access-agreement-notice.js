(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__wjdrToolAccessAgreementNoticeBound) return;
  window.__wjdrToolAccessAgreementNoticeBound = true;

  var MODAL_ID = 'wjdr-tool-access-agreement-modal';

  function pathname() {
    try { return String(window.location.pathname || ''); } catch (_e) { return ''; }
  }

  function shouldSkip() {
    try {
      if (window.location && window.location.protocol === 'file:') return true;
      var params = new URLSearchParams(window.location.search || '');
      if (params.get('embed') === '1') return true;
      var path = pathname();
      if (/\/_ops\//i.test(path)) return true;
      if (/admin\.html$/i.test(path)) return true;
      if (/^\/legal(\/|$)/i.test(path)) return true;
      if (path === '/' || path === '/index.html' || path === '/rukou.html') return true;
      if (!/^\/(?:map-tool|function|giftcode)(?:\/|$)/i.test(path)) return true;
    } catch (_e) {
      return true;
    }
    return false;
  }

  function injectStyles() {
    if (document.getElementById('wjdr-tool-access-agreement-styles')) return;
    var style = document.createElement('style');
    style.id = 'wjdr-tool-access-agreement-styles';
    style.textContent =
      '#' + MODAL_ID + '{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);z-index:10050;padding:16px;box-sizing:border-box}' +
      '#' + MODAL_ID + '.open{display:flex}' +
      '#' + MODAL_ID + ' .panel{width:520px;max-width:95vw;max-height:85vh;display:flex;flex-direction:column;background:#fffaf3;border:1px solid #ead7c2;border-radius:16px;box-shadow:0 16px 40px rgba(76,55,38,.22);color:#483b31;overflow:hidden}' +
      '#' + MODAL_ID + ' .body{padding:18px 18px 8px;overflow:auto}' +
      '#' + MODAL_ID + ' .title{margin:0 0 8px;font-size:1.05rem}' +
      '#' + MODAL_ID + ' .summary{margin:0 0 12px;font-size:13px;line-height:1.75;color:#756456}' +
      '#' + MODAL_ID + ' .link{color:#bd6d49;font-weight:700;font-size:13px;text-decoration:none;border-bottom:1px dotted currentColor}' +
      '#' + MODAL_ID + ' .actions{padding:12px 18px 16px;border-top:1px solid #ead7c2}' +
      '#' + MODAL_ID + ' .confirm{width:100%;height:40px;border:0;border-radius:10px;background:#bd6d49;color:#fff;font-size:14px;font-weight:700;cursor:pointer}';
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
        '<div class="panel" role="dialog" aria-modal="true" aria-labelledby="wjdr-tool-access-agreement-title">' +
        '<div class="body">' +
        '<h3 class="title" id="wjdr-tool-access-agreement-title"></h3>' +
        '<p class="summary" id="wjdr-tool-access-agreement-summary"></p>' +
        '<a class="link" id="wjdr-tool-access-agreement-link" href="/legal/tool-access-agreement" target="_blank" rel="noopener noreferrer">阅读完整《功能申请协议》</a>' +
        '</div>' +
        '<div class="actions">' +
        '<button type="button" class="confirm" id="wjdr-tool-access-agreement-confirm">我已阅读并同意</button>' +
        '</div>' +
        '</div>';
      document.body.appendChild(modal);
    }
    var titleEl = document.getElementById('wjdr-tool-access-agreement-title');
    var summaryEl = document.getElementById('wjdr-tool-access-agreement-summary');
    var linkEl = document.getElementById('wjdr-tool-access-agreement-link');
    var confirmBtn = document.getElementById('wjdr-tool-access-agreement-confirm');
    if (titleEl) titleEl.textContent = notice.title || '功能申请协议已更新';
    if (summaryEl) summaryEl.textContent = notice.summary || '';
    if (linkEl && notice.href) linkEl.href = notice.href;
    if (confirmBtn) {
      confirmBtn.onclick = function () {
        confirmBtn.disabled = true;
        fetch('/api/tool-access-agreement-notice/ack', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: notice.version || '' })
        }).catch(function () {}).finally(function () {
          modal.classList.remove('open');
          modal.setAttribute('aria-hidden', 'true');
          confirmBtn.disabled = false;
        });
      };
    }
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function boot() {
    if (shouldSkip()) return;
    if (typeof fetch !== 'function') return;
    fetch('/api/tool-access-agreement-notice?path=' + encodeURIComponent(pathname()), {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    }).then(function (res) {
      return res.ok ? res.json() : { show: false };
    }).then(function (data) {
      if (!data || data.show !== true || !data.notice) return;
      ensureModal(data.notice);
    }).catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
