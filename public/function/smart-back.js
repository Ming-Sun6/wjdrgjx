(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__wjdrSmartBackBound) return;
  window.__wjdrSmartBackBound = true;

  var DATA_QUERY_PAGES = /\/(?:T12DataOverview|neighbor-progress|history-immigration-group|migration-prediction|building-upgrade-1-30|pet-data-query|bear-body-recommendation|tiantian-strategy-hub)\.html$/i;
  var CALCULATOR_PAGES = /\/(?:Architecture10|BeaPit|building-upgrade-calculator|duihuan|engineering-station-time|equipment-training-calculator|expert-calculator|gift-value-calculator|hero-equipment-calculator|jisuan|lord-equipment-gem-calculator|refine-crystal-calculator|refine-crystal-simulator|T11Calculator|T12Calculator|wjti-personality-test)\.html$/i;

  function sameOriginReferrer() {
    if (!document.referrer || !window.history || window.history.length <= 1) return false;
    try {
      var previous = new URL(document.referrer, window.location.href);
      var current = new URL(window.location.href);
      return previous.origin === current.origin &&
        (previous.pathname !== current.pathname || previous.search !== current.search);
    } catch (_e) {
      return false;
    }
  }

  function categoryFallback(pathname) {
    var path = String(pathname || window.location.pathname || '');
    if (/\/forum-post\.html$/i.test(path)) return '/?tab=forum';
    if (/\/calendar\.html$/i.test(path)) return '/?tab=calendar';
    if (/\/my\.html$/i.test(path)) return '/?tab=my';
    if (/\/aeroplane-chess\//i.test(path)) return '/?tab=tools&toolTab=miniGames';
    if (/\/Zero\//i.test(path) || /\/reference-hub\//i.test(path) || DATA_QUERY_PAGES.test(path)) {
      return '/?tab=tools&toolTab=dataQuery';
    }
    if (CALCULATOR_PAGES.test(path)) return '/?tab=tools&toolTab=calcTools';
    return '/';
  }

  function smartBack(fallback) {
    if (sameOriginReferrer()) {
      window.history.back();
      return 'history';
    }
    window.location.assign(fallback || categoryFallback());
    return 'fallback';
  }

  function isReturnText(node) {
    var text = String(node && node.textContent || '').replace(/\s+/g, ' ').trim();
    return /^(?:←|‹|<)?\s*返回/.test(text);
  }

  function isHomeDestination(rawHref) {
    if (!rawHref) return false;
    try {
      var target = new URL(rawHref, window.location.href);
      return target.origin === window.location.origin &&
        (target.pathname === '/' || /\/rukou\.html$/i.test(target.pathname));
    } catch (_e) {
      return false;
    }
  }

  function linkFallback(link) {
    var explicit = link.getAttribute('data-back-fallback');
    if (explicit) return explicit;
    var rawHref = link.getAttribute('href') || '';
    return isHomeDestination(rawHref) ? categoryFallback() : rawHref || categoryFallback();
  }

  function findReturnControl(target) {
    if (!target || typeof target.closest !== 'function') return null;
    var link = target.closest('a');
    if (link && isReturnText(link)) return { node: link, fallback: linkFallback(link) };
    var forumButton = target.closest('#backBtn');
    if (forumButton && /\/forum-post\.html$/i.test(window.location.pathname) && isReturnText(forumButton)) {
      return { node: forumButton, fallback: '/?tab=forum' };
    }
    return null;
  }

  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var control = findReturnControl(event.target);
    if (!control) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    smartBack(control.fallback);
  }, true);

  window.wjdrSmartBack = smartBack;
  window.wjdrBackFallback = categoryFallback;
})();
