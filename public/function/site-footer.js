(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__wjdrSiteFooterBound) return;
  window.__wjdrSiteFooterBound = true;

  function cssString(value) {
    return '"' + String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n/g, '\\A ') + '"';
  }

  function ensureStyle() {
    if (document.getElementById('wjdr-site-footer-config-style')) return;
    var style = document.createElement('style');
    style.id = 'wjdr-site-footer-config-style';
    style.textContent =
      'footer.wjdr-footer.wjdr-footer-configured::before{content:none!important;display:none!important}' +
      '#wjdr-footer-credits{white-space:pre-wrap;display:block;width:100%;max-width:min(100%,52rem);margin:0 auto 12px;padding:12px 14px;border:1px solid var(--border,rgba(148,163,184,.22));border-radius:12px;background:rgba(15,23,42,.18);color:var(--muted,#94a3b8);font-size:12px;line-height:1.65;box-sizing:border-box;text-align:center}' +
      'html[data-theme="day"] #wjdr-footer-credits,body.theme-day #wjdr-footer-credits{border-color:rgba(15,23,42,.14);background:rgba(255,255,255,.5);color:#64748b}' +
      '@media (max-width:600px){#wjdr-footer-credits{font-size:11px;padding:10px 12px}}';
    (document.head || document.documentElement).appendChild(style);
  }

  function renderCredits(credits) {
    var text = String(credits || '').trim();
    if (!text) return;

    try {
      document.documentElement.style.setProperty('--wjdr-thanks-text', cssString(text));
    } catch (_e) {}

    ensureStyle();

    var footer = document.querySelector('footer.wjdr-footer');
    var box = document.getElementById('wjdr-footer-credits');
    if (footer) {
      footer.classList.add('wjdr-footer-configured');
      if (!box) {
        box = document.createElement('div');
        box.id = 'wjdr-footer-credits';
        var firstLegal = footer.querySelector('.site-footer-legal, #wjdr-legal-doc-links, #wjdr-icp-links, #wjdr-site-beian-wrap');
        if (firstLegal) footer.insertBefore(box, firstLegal);
        else footer.insertBefore(box, footer.firstChild);
      }
    }
    if (box) box.textContent = text;
  }

  function load() {
    if (window.location && window.location.protocol === 'file:') return;
    if (typeof fetch !== 'function') return;
    fetch('/api/site-footer', { method: 'GET', credentials: 'same-origin', cache: 'no-store' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        var credits = data && data.siteFooter && data.siteFooter.credits;
        if (credits) renderCredits(credits);
      })
      .catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load, { once: true });
  } else {
    load();
  }
})();
