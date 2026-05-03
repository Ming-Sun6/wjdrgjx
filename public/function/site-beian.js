(function () {
  if (typeof document === 'undefined') return;

  function injectSharedStylesOnce() {
    if (document.getElementById('wjdr-site-beian-styles')) return;

    var css =
      '#wjdr-legal-doc-links{margin:12px auto 0;padding:0;width:100%;max-width:min(100%,52rem);text-align:center;box-sizing:border-box;font-size:12px;line-height:1.65;color:#94a3b8}' +
      '#wjdr-legal-doc-links a{color:inherit;text-decoration:none;border-bottom:1px dotted currentColor;opacity:.95;transition:opacity .15s ease,color .15s ease}' +
      '#wjdr-legal-doc-links a:hover{opacity:1}' +
      'footer.wjdr-footer #wjdr-legal-doc-links{color:inherit}' +
      '#wjdr-icp-links{margin:10px auto 0;padding:0;width:100%;max-width:min(100%,52rem);text-align:center;box-sizing:border-box;font-size:12px;line-height:1.65;color:#94a3b8}' +
      '#wjdr-icp-links a{color:inherit;text-decoration:none;border-bottom:1px dotted currentColor;opacity:.95;transition:opacity .15s ease,color .15s ease}' +
      '#wjdr-icp-links a:hover{opacity:1}' +
      'footer.wjdr-footer #wjdr-icp-links{color:inherit}' +
      'footer.wjdr-footer #wjdr-icp-links a{border-bottom:1px dotted currentColor}' +
      '.wjdr-legal-docs-sep{margin:0 .35em;opacity:.45;font-weight:300}' +
      '#wjdr-site-beian-wrap{margin:10px auto 0;padding:0;width:100%;max-width:min(100%,52rem);text-align:center;box-sizing:border-box}' +
      '#wjdr-site-beian{display:inline-flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px;line-height:1.5;margin:0}' +
      '#wjdr-site-beian-link{display:inline-flex;align-items:center;gap:6px;color:inherit;text-decoration:none;font-size:12px;opacity:.95;transition:opacity .15s ease,color .15s ease}' +
      '#wjdr-site-beian-link:hover{opacity:1}' +
      '#wjdr-site-beian-icon{display:block;width:auto;height:18px;vertical-align:middle;flex-shrink:0}' +
      'footer.wjdr-footer #wjdr-site-beian-wrap{margin-top:8px}' +
      'footer.wjdr-footer #wjdr-site-beian-link{border-bottom:1px dotted currentColor}';

    var style = document.createElement('style');
    style.id = 'wjdr-site-beian-styles';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureLegalDocLinksRow() {
    if (document.getElementById('wjdr-legal-doc-links')) return;

    var p = document.createElement('p');
    p.id = 'wjdr-legal-doc-links';
    p.className = 'site-footer-legal';

    var aUser = document.createElement('a');
    aUser.href = '/legal/user-agreement';
    aUser.rel = 'noopener noreferrer';
    aUser.textContent = '《用户协议》';

    var sep = document.createElement('span');
    sep.className = 'wjdr-legal-docs-sep';
    sep.setAttribute('aria-hidden', 'true');
    sep.textContent = '|';

    var aPri = document.createElement('a');
    aPri.href = '/legal/privacy';
    aPri.rel = 'noopener noreferrer';
    aPri.textContent = '《隐私声明》';

    p.appendChild(aUser);
    p.appendChild(sep);
    p.appendChild(aPri);

    var footer = document.querySelector('footer.wjdr-footer');
    if (footer) {
      appendNodeBeforeBeianWrap(footer, p);
    } else {
      var bodyBeian = document.getElementById('wjdr-site-beian-wrap');
      if (bodyBeian) document.body.insertBefore(p, bodyBeian);
      else document.body.appendChild(p);
    }
  }

  function appendNodeBeforeBeianWrap(container, node) {
    var beian = container.querySelector('#wjdr-site-beian-wrap');
    if (beian) container.insertBefore(node, beian);
    else container.appendChild(node);
  }

  function ensureIcpFooterRow() {
    if (document.getElementById('wjdr-icp-links')) return;
    try {
      if (document.querySelector('a[href="https://beian.miit.gov.cn/"]')) return;
    } catch (_e) {}

    var p = document.createElement('p');
    p.id = 'wjdr-icp-links';
    p.className = 'site-footer-legal';

    var aIcp = document.createElement('a');
    aIcp.href = 'https://beian.miit.gov.cn/';
    aIcp.target = '_blank';
    aIcp.rel = 'noopener noreferrer';
    aIcp.textContent = '冀ICP备2026012727号';

    var sep = document.createElement('span');
    sep.className = 'wjdr-legal-docs-sep';
    sep.setAttribute('aria-hidden', 'true');
    sep.textContent = '|';

    var aQuery = document.createElement('a');
    aQuery.href = 'https://beian.miit.gov.cn/#/Integrated/recordQuery';
    aQuery.target = '_blank';
    aQuery.rel = 'noopener noreferrer';
    aQuery.textContent = '备案查询';

    p.appendChild(aIcp);
    p.appendChild(sep);
    p.appendChild(aQuery);

    var footer = document.querySelector('footer.wjdr-footer');
    if (footer) {
      appendNodeBeforeBeianWrap(footer, p);
    } else {
      var bodyBeian = document.getElementById('wjdr-site-beian-wrap');
      if (bodyBeian) document.body.insertBefore(p, bodyBeian);
      else document.body.appendChild(p);
    }
  }

  function ensureBeianFooter() {
    if (document.getElementById('wjdr-site-beian-wrap')) return;

    injectSharedStylesOnce();

    var wrap = document.createElement('div');
    wrap.id = 'wjdr-site-beian-wrap';
    wrap.setAttribute('role', 'contentinfo');

    var p = document.createElement('p');
    p.id = 'wjdr-site-beian';

    var a = document.createElement('a');
    a.id = 'wjdr-site-beian-link';
    a.href = 'https://beian.mps.gov.cn/#/query/webSearch?code=13060602001872';
    a.rel = 'noreferrer';
    a.target = '_blank';

    var img = document.createElement('img');
    img.id = 'wjdr-site-beian-icon';
    img.src = '/A/beian.png';
    img.alt = '';
    img.width = 20;
    img.height = 20;
    img.decoding = 'async';

    var text = document.createTextNode('冀公网安备13060602001872号');

    a.appendChild(img);
    a.appendChild(text);
    p.appendChild(a);
    wrap.appendChild(p);

    var footer = document.querySelector('footer.wjdr-footer');
    if (footer) {
      footer.appendChild(wrap);
    } else {
      document.body.appendChild(wrap);
    }
  }

  function guardRun() {
    try {
      if (!document.body) return;
      injectSharedStylesOnce();
      ensureLegalDocLinksRow();
      ensureIcpFooterRow();
      ensureBeianFooter();
    } catch (_e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', guardRun, { once: true });
  } else {
    guardRun();
  }
})();
