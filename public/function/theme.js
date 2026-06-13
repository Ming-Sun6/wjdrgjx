/* Unified theme manager for all static pages. */
(function(){
  var STORAGE_KEY = 'wjdr_theme'; // 'day' | 'night'

  function safeMatchMedia(query){
    try{ return window.matchMedia && window.matchMedia(query).matches; }catch(e){ return false; }
  }

  function getSavedTheme(){
    try{
      var v = localStorage.getItem(STORAGE_KEY);
      if(v === 'day' || v === 'night') return v;
    }catch(e){}
    return null;
  }

  function getDefaultTheme(){
    // Prefer user's OS preference; default to night to match existing design.
    var preferLight = safeMatchMedia('(prefers-color-scheme: light)');
    return preferLight ? 'day' : 'night';
  }

  function applyTheme(theme){
    var root = document.documentElement;
    if(!root) return;
    root.setAttribute('data-theme', theme);

    // Compatibility: some pages style off body[data-theme="dark|light"].
    // Also provide class hooks.
    var isNight = theme === 'night';
    var body = document.body;
    if(body){
      body.setAttribute('data-theme', isNight ? 'dark' : 'light');
      body.classList.toggle('theme-night', isNight);
      body.classList.toggle('theme-day', !isNight);
      body.classList.toggle('theme-dark', isNight);
      body.classList.toggle('theme-light', !isNight);
    }

    // Optional motion flag used by some pages.
    var motion = !safeMatchMedia('(prefers-reduced-motion: reduce)');
    root.setAttribute('data-motion', motion ? 'on' : 'off');
  }

  function markThemeSwitching(){
    var root = document.documentElement;
    if(!root) return;
    // Keep legacy homepage class alongside unified one so existing CSS transitions apply.
    root.classList.add('wjdr-theme-switching', 'theme-switching');
    clearTimeout(markThemeSwitching._timer);
    markThemeSwitching._timer = setTimeout(function(){
      root.classList.remove('wjdr-theme-switching', 'theme-switching');
    }, 320);
  }

  function sunIcon(){
    return '<svg class="wjdr-theme-fab-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.8 1.42-1.42zm10.48 14.32l1.79 1.8 1.41-1.42-1.8-1.79-1.4 1.41zM12 5a1 1 0 0 0 1-1V1h-2v3a1 1 0 0 0 1 1zm0 14a1 1 0 0 0-1 1v3h2v-3a1 1 0 0 0-1-1zM5 11H2v2h3a1 1 0 0 0 0-2zm17 0h-3a1 1 0 0 0 0 2h3v-2zM4.96 19.54l1.41 1.42 1.8-1.8-1.42-1.41-1.79 1.79zM19.04 4.46l-1.8 1.79 1.41 1.42 1.8-1.8-1.41-1.41zM12 7a5 5 0 1 0 .001 10.001A5 5 0 0 0 12 7z"/></svg>';
  }
  function moonIcon(){
    return '<svg class="wjdr-theme-fab-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12.1 2a9.9 9.9 0 0 0 0 19.8 10 10 0 0 0 8.3-4.5 1 1 0 0 0-1.1-1.5A8 8 0 0 1 8.2 4.7 1 1 0 0 0 6.7 3.6 10 10 0 0 0 12.1 2z"/></svg>';
  }

  function ensureButton(){
    var btn = document.getElementById('themeToggleBtn') || document.getElementById('themeToggle');
    if(btn) return btn;

    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'themeToggleBtn';
    // keep compatibility with existing CSS selectors in pages
    btn.className = 'theme-toggle wjdr-theme-fab';
    document.body.appendChild(btn);
    return btn;
  }

  function updateButton(btn){
    if(!btn) return;
    btn.classList.add('wjdr-theme-fab');
    var current = (document.documentElement.getAttribute('data-theme') || '').toLowerCase();
    current = (current === 'day' || current === 'light') ? 'day' : 'night';
    var next = current === 'day' ? 'night' : 'day';
    var label = next === 'day' ? '切换到日间' : '切换到夜间';
    btn.innerHTML = next === 'day' ? sunIcon() : moonIcon();
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);

    // Hard bind: do not rely on bubbling/capturing (some pages may intercept events).
    try{
      if(!btn.__wjdrThemeHardBound){
        btn.__wjdrThemeHardBound = true;
        btn.onclick = function(e){
          try{ performToggle(e, btn); }catch(_e){}
        };
      }
    }catch(_e){}
  }

  function toggleTheme(){
    var current = (document.documentElement.getAttribute('data-theme') || '').toLowerCase();
    current = (current === 'day' || current === 'light') ? 'day' : 'night';
    var next = current === 'day' ? 'night' : 'day';
    applyTheme(next);
    try{ localStorage.setItem(STORAGE_KEY, next); }catch(e){}
  }

  function findToggleTarget(node){
    // Avoid Element.closest for older engines / WebView quirks.
    var cur = node;
    var guard = 0;
    while(cur && guard++ < 12){
      try{
        if(cur.id === 'themeToggleBtn' || cur.id === 'themeToggle') return cur;
      }catch(_e){}
      cur = cur.parentNode;
    }
    return null;
  }

  function performToggle(e, hit){
    if(e && e.__wjdrThemeHandled) return;
    var now = Date.now ? Date.now() : new Date().getTime();
    if(window.__wjdrThemeLastToggleAt && now - window.__wjdrThemeLastToggleAt < 320) {
      if(e) e.__wjdrThemeHandled = true;
      return;
    }
    window.__wjdrThemeLastToggleAt = now;
    if(e) {
      e.__wjdrThemeHandled = true;
      try{ e.preventDefault(); }catch(_e){}
    }
    markThemeSwitching();
    toggleTheme();
    updateButton(hit);
  }

  function init(){
    var initial = getSavedTheme() || getDefaultTheme();
    applyTheme(initial);

    var btn = ensureButton();
    updateButton(btn);

    // Expose debug / fallback API
    try{
      window.__wjdrApplyTheme = applyTheme;
      window.__wjdrToggleTheme = function(){
        markThemeSwitching();
        toggleTheme();
        var b = document.getElementById('themeToggleBtn') || document.getElementById('themeToggle');
        if(b) updateButton(b);
      };
    }catch(_e){}

    // Use delegated click listener so re-rendered/replaced buttons still work.
    if(!window.__wjdrUnifiedThemeClickBound){
      window.__wjdrUnifiedThemeClickBound = true;
      function handleToggleEvent(e){
        try{
          var t = e && e.target;
          var hit = findToggleTarget(t);
          if(!hit) return;
          performToggle(e, hit);
        }catch(_e){}
      }
      document.addEventListener('click', handleToggleEvent, true);
      // Extra fallbacks for some mobile WebViews that are flaky on click.
      try{ document.addEventListener('pointerup', handleToggleEvent, true); }catch(_e){}
      try{ document.addEventListener('touchend', handleToggleEvent, true); }catch(_e){}
    }

    // Keep button in sync if theme is mutated elsewhere.
    try{
      var obs = new MutationObserver(function(){ updateButton(btn); });
      obs.observe(document.documentElement, { attributes:true, attributeFilter:['data-theme','class'] });
    }catch(e){}
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  }else{
    init();
  }
})();

