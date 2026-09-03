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
    var pageKey = derivePageKey(location.pathname || '/');
    var pagePath = location.pathname || '/';
    var scopeKey = pageKey;
    try {
      var postId = new URLSearchParams(location.search || '').get('id');
      if (isForumPostPage() && postId) {
        pagePath = pagePath + '?id=' + encodeURIComponent(postId);
        scopeKey = 'forum_post:' + String(postId);
      }
    } catch (_e) {}
    var payload = {
      pagePath: pagePath,
      pageKey: pageKey,
      scopeKey: scopeKey,
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

  function cancelForumQualifiedRead(postId) {
    var jobs = window.__wjdrForumReadJobs || {};
    var id = Number(postId);
    var job = jobs[id];
    if (!job) return;
    if (job.timer) clearInterval(job.timer);
    document.removeEventListener('visibilitychange', job.onVis);
    delete jobs[id];
  }

  function scheduleForumQualifiedRead(postId, onViewCount) {
    var id = Number(postId);
    if (!Number.isFinite(id) || id <= 0) return;
    window.__wjdrForumReadJobs = window.__wjdrForumReadJobs || {};
    if (window.__wjdrForumReadJobs[id]) return;
    var visibleMs = 0;
    var lastTick = Date.now();
    var done = false;
    var job = { timer: null, onVis: null };
    function cleanup() {
      if (job.timer) clearInterval(job.timer);
      job.timer = null;
      document.removeEventListener('visibilitychange', job.onVis);
      delete window.__wjdrForumReadJobs[id];
    }
    function fire() {
      if (done) return;
      done = true;
      cleanup();
      fetch('/api/forum/posts/' + id + '/read?_=' + Date.now(), {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store'
      })
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (d) {
          if (!d || d.viewCount == null) return;
          if (typeof onViewCount === 'function') onViewCount(Number(d.viewCount || 0), !!d.recorded);
        })
        .catch(function () {});
    }
    job.onVis = function () { lastTick = Date.now(); };
    job.timer = setInterval(function () {
      var now = Date.now();
      if (!document.hidden) visibleMs += Math.max(0, now - lastTick);
      lastTick = now;
      if (visibleMs >= 2500) fire();
    }, 250);
    document.addEventListener('visibilitychange', job.onVis);
    window.__wjdrForumReadJobs[id] = job;
  }
  window.wjdrScheduleForumQualifiedRead = scheduleForumQualifiedRead;
  window.wjdrCancelForumQualifiedRead = cancelForumQualifiedRead;

  function ensurePlayerMadeNotice() {
    try {
      if (new URLSearchParams(window.location.search).get('embed') === '1') return;
    } catch (_e) {}
    if (document.getElementById('__wjdrPlayerNotice')) return;

    if (!document.getElementById('__wjdrPlayerNoticeStyle')) {
      var style = document.createElement('style');
      style.id = '__wjdrPlayerNoticeStyle';
      style.textContent =
        '.wjdr-player-notice{' +
        'width:100%;box-sizing:border-box;margin:0;padding:8px 14px;' +
        'display:flex;align-items:center;justify-content:center;text-align:center;' +
        'font:700 12px/1.5 "Microsoft YaHei",system-ui,-apple-system,Segoe UI,sans-serif;' +
        'letter-spacing:.02em;color:var(--text,#e5e7eb);' +
        'background:linear-gradient(90deg,rgba(59,130,246,.18),rgba(245,158,11,.16));' +
        'border-bottom:1px solid var(--border,rgba(148,163,184,.24));' +
        'position:relative;z-index:2;' +
        '}' +
        'body.theme-day .wjdr-player-notice,html[data-theme="day"] .wjdr-player-notice{' +
        'color:var(--text,#0f172a);background:linear-gradient(90deg,rgba(219,234,254,.92),rgba(254,243,199,.92));border-bottom-color:rgba(15,23,42,.12);' +
        '}' +
        '@media (max-width:600px){.wjdr-player-notice{padding:7px 10px;font-size:11px;line-height:1.45;}}';
      document.head.appendChild(style);
    }

    var notice = document.createElement('div');
    notice.id = '__wjdrPlayerNotice';
    notice.className = 'wjdr-player-notice';
    notice.setAttribute('role', 'note');
    notice.textContent = '冬日工具箱由玩家制作，非官方攻略 / 非官方工具；数据仅供参考，请以游戏内为准。';
    document.body.insertBefore(notice, document.body.firstChild);
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
    sc.src = '/function/site-beian.js?v=20260903-1';
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

  function ensureLegalNoticeScript() {
    if (window.__wjdrLegalNoticeScriptQueued) return;
    window.__wjdrLegalNoticeScriptQueued = true;
    try {
      var nodes = document.getElementsByTagName('script');
      for (var i = 0; i < nodes.length; i++) {
        var src = nodes[i].getAttribute('src') || '';
        var path = (src.split('?')[0].split('#')[0] || '').trim();
        if (/legal-notice\.js$/i.test(path)) return;
      }
    } catch (_e) {}
    var sc = document.createElement('script');
    sc.src = '/function/legal-notice.js';
    sc.async = true;
    document.head.appendChild(sc);
  }

  function ensureToolAccessAgreementNoticeScript() {
    if (window.__wjdrToolAccessAgreementNoticeQueued) return;
    window.__wjdrToolAccessAgreementNoticeQueued = true;
    try {
      var nodes = document.getElementsByTagName('script');
      for (var i = 0; i < nodes.length; i++) {
        var src = nodes[i].getAttribute('src') || '';
        var path = (src.split('?')[0].split('#')[0] || '').trim();
        if (/tool-access-agreement-notice\.js$/i.test(path)) return;
      }
    } catch (_e) {}
    var sc = document.createElement('script');
    sc.src = '/function/tool-access-agreement-notice.js';
    sc.async = true;
    document.head.appendChild(sc);
  }

  function ensureSmartBackScript() {
    if (window.__wjdrSmartBackScriptQueued || window.__wjdrSmartBackBound) return;
    window.__wjdrSmartBackScriptQueued = true;
    var sc = document.createElement('script');
    sc.src = '/function/smart-back.js';
    sc.async = true;
    document.head.appendChild(sc);
  }

  function pagePath() {
    return String((location.pathname || '/').split('?')[0] || '/').replace(/\/+$/, '') || '/';
  }

  function isHomePage() {
    var path = pagePath();
    return path === '/' || /\/index\.html$/i.test(path) || path === '/public/index.html';
  }

  function isForumPostPage() {
    return /\/forum-post\.html$/i.test(pagePath());
  }

  function isPublisherAdPage() {
    return isHomePage() || isForumPostPage();
  }

  function findHomeLead() {
    return document.querySelector('.wjdr-home-lead');
  }

  function setHomeLeadVisible(visible) {
    var lead = findHomeLead();
    if (!lead) return;
    if (visible) {
      lead.hidden = false;
      lead.removeAttribute('aria-hidden');
    } else {
      lead.hidden = true;
      lead.setAttribute('aria-hidden', 'true');
    }
  }

  function ensureAdworkSdk() {
    try {
      var nodes = document.getElementsByTagName('script');
      for (var i = 0; i < nodes.length; i++) {
        var src = nodes[i].getAttribute('src') || '';
        if (/cdn\.adwork\.net\/js\/makemoney\.js/i.test(src)) return;
      }
    } catch (_e) {}
    var sc = document.createElement('script');
    sc.type = 'text/javascript';
    sc.charset = 'UTF-8';
    sc.src = 'https://cdn.adwork.net/js/makemoney.js';
    sc.async = true;
    (document.head || document.documentElement).appendChild(sc);
  }

  function applyHomeAdSlot(cfg) {
    var slot = document.getElementById('wjdrAdworkSlot');
    var adsOff = isForumPostPage()
      ? (cfg && cfg.forumAdEnabled === false)
      : (cfg && (cfg.homeAdEnabled === false || cfg.adEnabled === false));
    if (adsOff) {
      if (slot && slot.parentNode) slot.parentNode.removeChild(slot);
      return;
    }
    if (!slot) {
      slot = document.createElement('div');
      slot.id = 'wjdrAdworkSlot';
      slot.className = 'wjdr-adwork-slot';
      slot.innerHTML = '<div class="adwork-net adwork-auto" data-id="1129"></div>';
      if (isForumPostPage()) {
        var wrap = document.querySelector('.wrap');
        var card = wrap && wrap.querySelector('.card');
        if (card && card.parentNode) card.parentNode.insertBefore(slot, card);
        else if (wrap) wrap.insertBefore(slot, wrap.firstChild);
        else document.body.insertBefore(slot, document.body.firstChild);
      } else {
        var notice = document.getElementById('__wjdrPlayerNotice');
        var lead = findHomeLead();
        if (notice && notice.parentNode) notice.parentNode.insertBefore(slot, notice.nextSibling);
        else if (lead && lead.parentNode) lead.parentNode.insertBefore(slot, lead);
        else document.body.insertBefore(slot, document.body.firstChild);
      }
    }
    ensureAdworkSdk();
  }

  function ensureHomePublisherGapStyle() {
    if (document.getElementById('wjdr-home-publisher-gap')) return;
    var style = document.createElement('style');
    style.id = 'wjdr-home-publisher-gap';
    style.textContent =
      'body:has(#wjdrAdworkSlot)>.auth-bar~.container,' +
      'body:has(.wjdr-home-lead:not([hidden]))>.auth-bar~.container{padding-top:10px!important}' +
      '@media (max-width:600px){body:has(#wjdrAdworkSlot)>.auth-bar~.container,' +
      'body:has(.wjdr-home-lead:not([hidden]))>.auth-bar~.container{padding-top:8px!important}}';
    (document.head || document.documentElement).appendChild(style);
  }

  function applyHomePublisherRuntime() {
    if (window.__wjdrHomePublisherBound) return;
    if (!isPublisherAdPage()) return;
    window.__wjdrHomePublisherBound = true;
    if (isHomePage()) {
      ensureHomePublisherGapStyle();
      setHomeLeadVisible(false);
    }
    fetch('/api/home-lead', { credentials: 'omit', cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (cfg) {
        if (isHomePage()) {
          if (cfg && cfg.enabled === false) setHomeLeadVisible(false);
          else setHomeLeadVisible(true);
        }
        applyHomeAdSlot(cfg);
      })
      .catch(function () {
        if (isHomePage()) setHomeLeadVisible(true);
      });
  }

  function boot() {
    ensurePlayerMadeNotice();
    ensureSiteBeianScript();
    ensureSiteFooterScript();
    ensureLegalNoticeScript();
    ensureToolAccessAgreementNoticeScript();
    ensureSmartBackScript();
    applyHomePublisherRuntime();
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
