(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  if (window.__wjdrAnalyticsTrackerBound) return;
  window.__wjdrAnalyticsTrackerBound = true;

  var THEME_KEY = 'wjdr_theme';

  /** Skip theme UI when unified /function/theme.js is on the page (avoids duplicate click handlers). */
  function pageLoadsUnifiedTheme() {
    try {
      var nodes = document.getElementsByTagName('script');
      for (var i = 0; i < nodes.length; i++) {
        var src = nodes[i].getAttribute('src') || '';
        var path = (src.split('?')[0].split('#')[0] || '').trim();
        if (/\/theme\.js$/i.test(path)) return true;
      }
    } catch (_e) {}
    return false;
  }

  function getStoredTheme() {
    try {
      return String(window.localStorage.getItem(THEME_KEY) || '').trim();
    } catch (_e) {
      return '';
    }
  }

  function storeTheme(value) {
    try {
      window.localStorage.setItem(THEME_KEY, String(value || ''));
    } catch (_e) {}
  }

  function applyTheme(theme) {
    var t = String(theme || '').toLowerCase();
    var isDay = t === 'day';
    document.body.classList.toggle('theme-day', isDay);
    try {
      document.documentElement.dataset.theme = isDay ? 'day' : 'night';
    } catch (_e) {}
  }

  function buildThemeIconSvg() {
    return (
      '<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.8 1.42-1.42zm10.48 14.32l1.79 1.8 1.41-1.42-1.8-1.79-1.4 1.41zM12 5a1 1 0 0 0 1-1V1h-2v3a1 1 0 0 0 1 1zm0 14a1 1 0 0 0-1 1v3h2v-3a1 1 0 0 0-1-1zM5 11H2v2h3a1 1 0 0 0 0-2zm17 0h-3a1 1 0 0 0 0 2h3v-2zM4.96 19.54l1.41 1.42 1.8-1.8-1.42-1.41-1.79 1.79zM19.04 4.46l-1.8 1.79 1.41 1.42 1.8-1.8-1.41-1.41zM12 7a5 5 0 1 0 .001 10.001A5 5 0 0 0 12 7z"/>' +
      '</svg>'
    );
  }

  function ensureThemeToggleButton() {
    if (document.getElementById('__wjdrThemeToggleInstalled')) return;

    var btn =
      document.getElementById('themeToggle') ||
      document.querySelector('.theme-toggle-btn') ||
      document.querySelector('.theme-toggle');

    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'themeToggle';
      document.body.appendChild(btn);
    }

    btn.id = 'themeToggle';
    btn.type = 'button';
    btn.classList.remove('theme-toggle');
    btn.classList.add('theme-toggle-btn');
    btn.setAttribute('aria-label', '切换主题');
    btn.setAttribute('title', '切换主题');
    btn.innerHTML = buildThemeIconSvg();

    var marker = document.createElement('span');
    marker.id = '__wjdrThemeToggleInstalled';
    marker.style.display = 'none';
    document.body.appendChild(marker);

    function toggleFromFallback(e) {
      var now = Date.now ? Date.now() : new Date().getTime();
      if (window.__wjdrFallbackThemeLastToggleAt && now - window.__wjdrFallbackThemeLastToggleAt < 320) {
        try {
          if (e) e.preventDefault();
        } catch (_e) {}
        return;
      }
      window.__wjdrFallbackThemeLastToggleAt = now;
      try {
        if (e) e.preventDefault();
      } catch (_e) {}
      var isDay = document.body.classList.contains('theme-day');
      var next = isDay ? 'night' : 'day';
      applyTheme(next);
      storeTheme(next);
    }

    btn.addEventListener('click', toggleFromFallback);
    try {
      btn.addEventListener('pointerup', toggleFromFallback, { passive: false });
    } catch (_e) {}
    try {
      btn.addEventListener('touchend', toggleFromFallback, { passive: false });
    } catch (_e) {}
  }

  function derivePageKey(pathname) {
    var clean = String(pathname || '').split('?')[0] || '/';
    if (clean === '/' || clean === '/rukou.html') return 'rukou';
    if (/\.html$/i.test(clean)) return clean.replace(/^\//, '').replace(/\.html$/i, '');
    return clean.replace(/^\//, '') || 'rukou';
  }

  function sendPageView() {
    if (location.protocol === 'file:') return;
    if (typeof fetch !== 'function') return;
    var payload = {
      pagePath: location.pathname || '/',
      pageKey: derivePageKey(location.pathname || '/'),
      referrer: document.referrer || ''
    };
    fetch('/api/analytics/page-view', {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(function () {});
  }

  function ensureSiteBeianScript() {
    if (window.__wjdrSiteBeianScriptQueued) return;
    window.__wjdrSiteBeianScriptQueued = true;
    try {
      var nodes = document.getElementsByTagName('script');
      for (var i = 0; i < nodes.length; i++) {
        var src = nodes[i].getAttribute('src') || '';
        var path = (src.split('?')[0].split('#')[0] || '').trim();
        if (/site-beian\.js$/i.test(path)) return;
      }
    } catch (_e) {}
    var sc = document.createElement('script');
    sc.src = '/function/site-beian.js';
    sc.async = true;
    document.head.appendChild(sc);
  }

  function ensureSiteFooterScript() {
    if (window.__wjdrSiteFooterScriptQueued) return;
    window.__wjdrSiteFooterScriptQueued = true;
    try {
      var nodes = document.getElementsByTagName('script');
      for (var i = 0; i < nodes.length; i++) {
        var src = nodes[i].getAttribute('src') || '';
        var path = (src.split('?')[0].split('#')[0] || '').trim();
        if (/site-footer\.js$/i.test(path)) return;
      }
    } catch (_e) {}
    var sc = document.createElement('script');
    sc.src = '/function/site-footer.js';
    sc.async = true;
    document.head.appendChild(sc);
  }

  function boot() {
    ensureSiteBeianScript();
    ensureSiteFooterScript();
    if (!pageLoadsUnifiedTheme()) {
      applyTheme(getStoredTheme() || 'night');
      ensureThemeToggleButton();
    }
    sendPageView();
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      function () {
        boot();
      },
      { once: true }
    );
  } else {
    boot();
  }
})();
