const fs = require('fs');
const path = require('path');

let sanitizeHtml = null;
try {
  sanitizeHtml = require('sanitize-html');
} catch (_e) {
  sanitizeHtml = null;
}

const LEGAL_DOCS_SETTING_KEY = 'legal_docs';
const INITIAL_NOTICE_VERSION = '20260828';
const MAX_NOTICE_TITLE = 80;
const MAX_NOTICE_SUMMARY = 2000;
const MAX_DOC_TITLE = 40;
const MAX_DOC_BODY = 80000;
const DEFAULT_NOTICE_TITLE = '用户协议与隐私政策更新';
const DEFAULT_NOTICE_SUMMARY =
  '欢迎使用冬日工具箱。请阅读《关于我们》《用户协议》和《隐私政策》。点击「确定」即表示你已阅读并同意相关内容。';

const LEGAL_DOC_DEFS = [
  { id: 'about', file: 'about.html', title: '关于我们', href: '/legal/about', effectiveAt: '2026-08-28' },
  { id: 'agreement', file: 'user-agreement.html', title: '用户协议', href: '/legal/user-agreement', effectiveAt: '2026-05-01' },
  { id: 'privacy', file: 'privacy.html', title: '隐私政策', href: '/legal/privacy', effectiveAt: '2026-05-01' }
];

const LEGAL_PAGE_STYLE = `:root {
        --bg: #0b1220;
        --panel: rgba(15, 23, 42, 0.82);
        --border: rgba(148, 163, 184, 0.22);
        --text: #e5e7eb;
        --muted: #94a3b8;
        --link: #93c5fd;
      }
      body {
        margin: 0;
        font-family: "Microsoft YaHei", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        background: linear-gradient(135deg, #0b1220, #0f172a);
        color: var(--text);
      }
      .wrap {
        max-width: 960px;
        margin: 0 auto;
        padding: 28px 16px 42px;
      }
      .card {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 16px;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(14px);
        padding: 18px 18px;
      }
      h1 {
        font-size: 20px;
        margin: 0 0 6px;
      }
      .meta {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.7;
        margin-bottom: 14px;
      }
      h2 {
        font-size: 14px;
        margin: 18px 0 8px;
      }
      p,
      li {
        color: var(--text);
        font-size: 13px;
        line-height: 1.85;
      }
      ul {
        margin: 8px 0 0 20px;
        padding: 0;
      }
      a {
        color: var(--link);
        text-decoration: none;
        border-bottom: 1px dotted currentColor;
      }
      .back {
        display: inline-block;
        margin: 0 0 12px;
        color: var(--muted);
        font-size: 12px;
      }
      .back:hover {
        color: var(--text);
      }
      code {
        background: rgba(148, 163, 184, 0.12);
        padding: 0 6px;
        border-radius: 8px;
      }
      .note,
      .muted {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.8;
      }
      .legal-doc-links {
        margin: 16px 0 0;
        text-align: center;
        font-size: 12px;
        line-height: 1.65;
        color: var(--muted);
      }
      .legal-doc-links a {
        color: var(--link);
        text-decoration: none;
        border-bottom: 1px dotted currentColor;
      }
      footer.wjdr-footer{
        margin-top:16px;
        display:flex;
        flex-direction:column;
        align-items:center;
      }
      #wjdr-footer-credits{
        white-space:pre-wrap;
        width:100%;
        margin:0 0 12px;
        text-align:center;
      }`;

const LEGAL_PAGE_CREDITS = `制作：2041茗子、飞菇
数据：飞菇、甜甜、627贰叁、奶酪、719缥缈、2041茗子
测试：2041茗子、飞菇、甜甜、627贰叁、奶酪、719缥缈、755脆脆、2144煤球、柒枫团队
宣传大使：懒羊羊
赞助：39 拙山枯水大江行

感谢以上所有人对本攻略站的付出`;

const LEGAL_DOC_LINKS_HTML = `<p id="wjdr-legal-doc-links" class="legal-doc-links">
        <a href="/legal/about">《关于我们》</a>
        <span aria-hidden="true"> | </span>
        <a href="/legal/user-agreement">《用户协议》</a>
        <span aria-hidden="true"> | </span>
        <a href="/legal/privacy">《隐私政策》</a>
      </p>`;

function legalPageFooterHtml() {
  return `<footer class="wjdr-footer">
      <div id="wjdr-footer-credits" class="muted">
${escapeHtml(LEGAL_PAGE_CREDITS)}
      </div>
      ${LEGAL_DOC_LINKS_HTML}
    </footer>`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function looksLikeHtml(value) {
  return /<[a-z][\s\S]*>/i.test(String(value || ''));
}

function textToHtml(value) {
  const text = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  return text
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      if (!lines.length) return '';
      if (lines.length === 1 && /^#{1,3}\s+/.test(lines[0])) {
        const title = escapeHtml(lines[0].replace(/^#{1,3}\s+/, ''));
        return `<h2>${title}</h2>`;
      }
      return `<p>${lines.map((line) => escapeHtml(line)).join('<br />')}</p>`;
    })
    .filter(Boolean)
    .join('\n');
}

function sanitizeLegalHtml(inputHtml) {
  const raw = String(inputHtml || '').trim();
  if (!raw) return '';
  if (!sanitizeHtml) return escapeHtml(raw).replace(/\n/g, '<br>');
  return sanitizeHtml(raw, {
    allowedTags: [
      'b', 'strong', 'i', 'em', 'u', 's',
      'br', 'p', 'div', 'span',
      'ul', 'ol', 'li',
      'h1', 'h2', 'h3',
      'a', 'code', 'hr'
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      p: ['class'],
      div: ['class'],
      span: ['class']
    },
    transformTags: {
      a: (_tagName, attribs) => {
        const href = String(attribs.href || '').trim();
        const safeHref = (!href || href.startsWith('/') || href.startsWith('mailto:') || /^https?:\/\//i.test(href)) ? href : '';
        return {
          tagName: 'a',
          attribs: {
            href: safeHref,
            target: href.startsWith('mailto:') ? undefined : '_blank',
            rel: 'noopener noreferrer'
          }
        };
      }
    },
    disallowedTagsMode: 'discard'
  });
}

function formatDateYmd(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  } catch (_e) {
    return date.toISOString().slice(0, 10);
  }
}

function extractCardBodyFromHtml(html) {
  const src = String(html || '');
  const marker = '<div class="card">';
  const cardStart = src.indexOf(marker);
  if (cardStart < 0) return '';
  const afterCard = src.slice(cardStart + marker.length);
  let depth = 1;
  const re = /<\/?div\b[^>]*>/gi;
  let match;
  let endAt = -1;
  while ((match = re.exec(afterCard))) {
    if (/^<div\b/i.test(match[0]) && !/\/\s*>$/.test(match[0])) depth += 1;
    else if (/^<\/div/i.test(match[0])) {
      depth -= 1;
      if (depth === 0) {
        endAt = match.index;
        break;
      }
    }
  }
  const inner = (endAt >= 0 ? afterCard.slice(0, endAt) : afterCard).trim();
  return inner
    .replace(/<h1>[\s\S]*?<\/h1>/, '')
    .replace(/<div class="meta">[\s\S]*?<\/div>/, '')
    .trim();
}

function loadDefaultsFromLegalDir(legalDir) {
  const documents = {};
  for (const def of LEGAL_DOC_DEFS) {
    let bodyHtml = '';
    try {
      const html = fs.readFileSync(path.join(legalDir, def.file), 'utf8');
      bodyHtml = extractCardBodyFromHtml(html);
    } catch (_e) {
      bodyHtml = `<p>${escapeHtml(def.title)}</p>`;
    }
    documents[def.id] = {
      title: def.title,
      href: def.href,
      file: def.file,
      effectiveAt: def.effectiveAt,
      bodyHtml
    };
  }
  return {
    version: INITIAL_NOTICE_VERSION,
    publishedAt: null,
    publishedBy: null,
    updatedAt: null,
    updatedBy: null,
    noticeTitle: DEFAULT_NOTICE_TITLE,
    noticeSummary: DEFAULT_NOTICE_SUMMARY,
    documents
  };
}

function emptyDocuments() {
  const documents = {};
  for (const def of LEGAL_DOC_DEFS) {
    documents[def.id] = {
      title: def.title,
      href: def.href,
      file: def.file,
      effectiveAt: def.effectiveAt,
      bodyHtml: ''
    };
  }
  return documents;
}

function normalizeLegalDocs(raw, defaults) {
  const base = defaults && typeof defaults === 'object'
    ? defaults
    : {
      version: INITIAL_NOTICE_VERSION,
      publishedAt: null,
      publishedBy: null,
      updatedAt: null,
      updatedBy: null,
      noticeTitle: DEFAULT_NOTICE_TITLE,
      noticeSummary: DEFAULT_NOTICE_SUMMARY,
      documents: emptyDocuments()
    };
  const stored = raw && typeof raw === 'object' ? raw : {};
  const documents = emptyDocuments();
  const sourceDocs = stored.documents && typeof stored.documents === 'object' ? stored.documents : {};
  for (const def of LEGAL_DOC_DEFS) {
    const incoming = sourceDocs[def.id] && typeof sourceDocs[def.id] === 'object' ? sourceDocs[def.id] : {};
    const fallback = base.documents && base.documents[def.id] ? base.documents[def.id] : documents[def.id];
    documents[def.id] = {
      title: String(incoming.title || fallback.title || def.title).trim().slice(0, MAX_DOC_TITLE) || def.title,
      href: def.href,
      file: def.file,
      effectiveAt: formatDateYmd(incoming.effectiveAt || fallback.effectiveAt || def.effectiveAt) || def.effectiveAt,
      bodyHtml: String(incoming.bodyHtml || fallback.bodyHtml || '').trim()
    };
  }
  return {
    version: String(stored.version || base.version || INITIAL_NOTICE_VERSION),
    publishedAt: stored.publishedAt || base.publishedAt || null,
    publishedBy: stored.publishedBy || base.publishedBy || null,
    updatedAt: stored.updatedAt || base.updatedAt || null,
    updatedBy: stored.updatedBy || base.updatedBy || null,
    noticeTitle: String(stored.noticeTitle || base.noticeTitle || DEFAULT_NOTICE_TITLE).trim().slice(0, MAX_NOTICE_TITLE) || DEFAULT_NOTICE_TITLE,
    noticeSummary: String(stored.noticeSummary || base.noticeSummary || DEFAULT_NOTICE_SUMMARY).trim().slice(0, MAX_NOTICE_SUMMARY) || DEFAULT_NOTICE_SUMMARY,
    documents
  };
}

function toPublicNotice(docs) {
  const normalized = normalizeLegalDocs(docs);
  return {
    version: normalized.version || INITIAL_NOTICE_VERSION,
    publishedAt: normalized.publishedAt,
    title: normalized.noticeTitle,
    summary: normalized.noticeSummary,
    links: LEGAL_DOC_DEFS.map((def) => ({
      id: def.id,
      title: normalized.documents[def.id].title,
      href: def.href
    }))
  };
}

function applyAdminPayload(current, body, options) {
  const opts = options || {};
  const now = opts.now || new Date().toISOString();
  const actorName = String(opts.actorName || '').trim() || null;
  const publish = opts.publish === true;
  const defaults = opts.defaults;
  const next = normalizeLegalDocs(current, defaults);
  const payload = body && typeof body === 'object' ? body : {};

  if (Object.prototype.hasOwnProperty.call(payload, 'noticeTitle')) {
    const title = String(payload.noticeTitle || '').trim().slice(0, MAX_NOTICE_TITLE);
    if (!title) return { error: 'EMPTY_NOTICE_TITLE' };
    next.noticeTitle = title;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'noticeSummary')) {
    const summary = String(payload.noticeSummary || '').trim().slice(0, MAX_NOTICE_SUMMARY);
    if (!summary) return { error: 'EMPTY_NOTICE_SUMMARY' };
    next.noticeSummary = summary;
  }

  const incomingDocs = payload.documents && typeof payload.documents === 'object' ? payload.documents : {};
  for (const def of LEGAL_DOC_DEFS) {
    const incoming = incomingDocs[def.id];
    if (!incoming || typeof incoming !== 'object') continue;
    if (Object.prototype.hasOwnProperty.call(incoming, 'title')) {
      const title = String(incoming.title || '').trim().slice(0, MAX_DOC_TITLE);
      if (!title) return { error: 'EMPTY_DOC_TITLE' };
      next.documents[def.id].title = title;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'effectiveAt')) {
      next.documents[def.id].effectiveAt = formatDateYmd(incoming.effectiveAt) || def.effectiveAt;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'bodyHtml') || Object.prototype.hasOwnProperty.call(incoming, 'body')) {
      const raw = String(incoming.bodyHtml != null ? incoming.bodyHtml : incoming.body || '');
      const html = looksLikeHtml(raw) ? sanitizeLegalHtml(raw) : textToHtml(raw);
      if (!html) return { error: 'EMPTY_DOC_BODY' };
      if (html.length > MAX_DOC_BODY) return { error: 'DOC_BODY_TOO_LONG' };
      next.documents[def.id].bodyHtml = html;
    }
  }

  for (const def of LEGAL_DOC_DEFS) {
    if (!String(next.documents[def.id].bodyHtml || '').trim()) {
      return { error: 'EMPTY_DOC_BODY' };
    }
  }

  next.updatedAt = now;
  next.updatedBy = actorName;
  if (publish) {
    next.version = String(Date.now());
    next.publishedAt = now;
    next.publishedBy = actorName;
  }
  return { docs: next };
}

function renderLegalPageHtml(docId, docs) {
  const normalized = normalizeLegalDocs(docs);
  const def = LEGAL_DOC_DEFS.find((item) => item.id === docId);
  if (!def) return '';
  const doc = normalized.documents[docId];
  const title = doc.title || def.title;
  const updated = formatDateYmd(normalized.publishedAt || normalized.updatedAt || doc.effectiveAt);
  const effective = formatDateYmd(doc.effectiveAt) || updated;
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}-冬日工具箱</title>
    <style>
      ${LEGAL_PAGE_STYLE}
    </style>
    <script src="/function/analytics-tracker.js" defer></script>
  </head>
  <body>
    <div class="wrap">
      <a class="back" href="/">← 返回首页</a>
      <div class="card">
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">
          生效日期：${escapeHtml(effective)}<br />
          最近更新：${escapeHtml(updated)}
        </div>
        ${doc.bodyHtml}
      </div>
      ${legalPageFooterHtml()}
    </div>
    <script src="/function/site-beian.js" defer></script>
  </body>
</html>
`;
}

function writeLegalHtmlFiles(legalDir, docs) {
  const normalized = normalizeLegalDocs(docs);
  const written = [];
  for (const def of LEGAL_DOC_DEFS) {
    const html = renderLegalPageHtml(def.id, normalized);
    fs.writeFileSync(path.join(legalDir, def.file), html, 'utf8');
    written.push(def.file);
  }
  return written;
}

function docIdFromRequestPath(urlPath) {
  const clean = String(urlPath || '').split('?')[0].replace(/\.html$/i, '');
  if (clean === '/legal/about') return 'about';
  if (clean === '/legal/privacy') return 'privacy';
  if (clean === '/legal/user-agreement') return 'agreement';
  return '';
}

const TOOL_ACCESS_AGREEMENT_SETTING_KEY = 'tool_access_agreement';
const TOOL_ACCESS_AGREEMENT_DEF = {
  id: 'tool-access',
  file: 'tool-access-agreement.html',
  title: '功能申请协议',
  href: '/legal/tool-access-agreement',
  effectiveAt: '2026-09-03'
};
const DEFAULT_TOOL_ACCESS_AGREEMENT_VERSION = '20260903b';
const DEFAULT_TOOL_ACCESS_NOTICE_TITLE = '功能申请协议已更新';
const DEFAULT_TOOL_ACCESS_NOTICE_SUMMARY =
  '需要申请的功能适用《功能申请协议》。本次更新明确：若你泄露账号、权限或未公开内容，由此产生的全部后果由你自行承担。请阅读后确认。';

function loadToolAccessAgreementDefault(legalDir) {
  let bodyHtml = '';
  try {
    bodyHtml = extractCardBodyFromHtml(fs.readFileSync(path.join(legalDir, TOOL_ACCESS_AGREEMENT_DEF.file), 'utf8'));
  } catch (_e) {
    bodyHtml = `<p>${escapeHtml(TOOL_ACCESS_AGREEMENT_DEF.title)}</p>`;
  }
  return {
    version: DEFAULT_TOOL_ACCESS_AGREEMENT_VERSION,
    title: TOOL_ACCESS_AGREEMENT_DEF.title,
    href: TOOL_ACCESS_AGREEMENT_DEF.href,
    file: TOOL_ACCESS_AGREEMENT_DEF.file,
    effectiveAt: TOOL_ACCESS_AGREEMENT_DEF.effectiveAt,
    bodyHtml,
    noticeTitle: DEFAULT_TOOL_ACCESS_NOTICE_TITLE,
    noticeSummary: DEFAULT_TOOL_ACCESS_NOTICE_SUMMARY,
    publishedAt: null,
    publishedBy: null,
    updatedAt: null,
    updatedBy: null
  };
}

function normalizeToolAccessAgreement(raw, defaults) {
  const base = defaults && typeof defaults === 'object' ? defaults : {
    version: DEFAULT_TOOL_ACCESS_AGREEMENT_VERSION,
    title: TOOL_ACCESS_AGREEMENT_DEF.title,
    href: TOOL_ACCESS_AGREEMENT_DEF.href,
    file: TOOL_ACCESS_AGREEMENT_DEF.file,
    effectiveAt: TOOL_ACCESS_AGREEMENT_DEF.effectiveAt,
    bodyHtml: '',
    noticeTitle: DEFAULT_TOOL_ACCESS_NOTICE_TITLE,
    noticeSummary: DEFAULT_TOOL_ACCESS_NOTICE_SUMMARY,
    publishedAt: null,
    publishedBy: null,
    updatedAt: null,
    updatedBy: null
  };
  const stored = raw && typeof raw === 'object' ? raw : {};
  return {
    version: String(stored.version || base.version || DEFAULT_TOOL_ACCESS_AGREEMENT_VERSION),
    title: String(stored.title || base.title || TOOL_ACCESS_AGREEMENT_DEF.title).trim().slice(0, MAX_DOC_TITLE) || TOOL_ACCESS_AGREEMENT_DEF.title,
    href: TOOL_ACCESS_AGREEMENT_DEF.href,
    file: TOOL_ACCESS_AGREEMENT_DEF.file,
    effectiveAt: formatDateYmd(stored.effectiveAt || base.effectiveAt || TOOL_ACCESS_AGREEMENT_DEF.effectiveAt) || TOOL_ACCESS_AGREEMENT_DEF.effectiveAt,
    bodyHtml: String(stored.bodyHtml || base.bodyHtml || '').trim(),
    noticeTitle: String(stored.noticeTitle || base.noticeTitle || DEFAULT_TOOL_ACCESS_NOTICE_TITLE).trim().slice(0, MAX_NOTICE_TITLE) || DEFAULT_TOOL_ACCESS_NOTICE_TITLE,
    noticeSummary: String(stored.noticeSummary || base.noticeSummary || DEFAULT_TOOL_ACCESS_NOTICE_SUMMARY).trim().slice(0, MAX_NOTICE_SUMMARY) || DEFAULT_TOOL_ACCESS_NOTICE_SUMMARY,
    publishedAt: stored.publishedAt || base.publishedAt || null,
    publishedBy: stored.publishedBy || base.publishedBy || null,
    updatedAt: stored.updatedAt || base.updatedAt || null,
    updatedBy: stored.updatedBy || base.updatedBy || null
  };
}

function applyToolAccessAgreementPayload(current, body, options) {
  const opts = options || {};
  const now = opts.now || new Date().toISOString();
  const actorName = String(opts.actorName || '').trim() || null;
  const publish = opts.publish === true;
  const next = normalizeToolAccessAgreement(current, opts.defaults);
  const payload = body && typeof body === 'object' ? body : {};

  if (Object.prototype.hasOwnProperty.call(payload, 'title')) {
    const title = String(payload.title || '').trim().slice(0, MAX_DOC_TITLE);
    if (!title) return { error: 'EMPTY_DOC_TITLE' };
    next.title = title;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'effectiveAt')) {
    next.effectiveAt = formatDateYmd(payload.effectiveAt) || TOOL_ACCESS_AGREEMENT_DEF.effectiveAt;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'noticeTitle')) {
    const title = String(payload.noticeTitle || '').trim().slice(0, MAX_NOTICE_TITLE);
    if (!title) return { error: 'EMPTY_NOTICE_TITLE' };
    next.noticeTitle = title;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'noticeSummary')) {
    const summary = String(payload.noticeSummary || '').trim().slice(0, MAX_NOTICE_SUMMARY);
    if (!summary) return { error: 'EMPTY_NOTICE_SUMMARY' };
    next.noticeSummary = summary;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'bodyHtml') || Object.prototype.hasOwnProperty.call(payload, 'body')) {
    const raw = String(payload.bodyHtml != null ? payload.bodyHtml : payload.body || '');
    const html = looksLikeHtml(raw) ? sanitizeLegalHtml(raw) : textToHtml(raw);
    if (!html) return { error: 'EMPTY_DOC_BODY' };
    if (html.length > MAX_DOC_BODY) return { error: 'DOC_BODY_TOO_LONG' };
    next.bodyHtml = html;
  }
  if (!String(next.bodyHtml || '').trim()) return { error: 'EMPTY_DOC_BODY' };

  next.updatedAt = now;
  next.updatedBy = actorName;
  if (publish) {
    next.version = String(Date.now());
    next.publishedAt = now;
    next.publishedBy = actorName;
  }
  return { doc: next };
}

function renderToolAccessAgreementHtml(doc) {
  const normalized = normalizeToolAccessAgreement(doc);
  const title = normalized.title || TOOL_ACCESS_AGREEMENT_DEF.title;
  const updated = formatDateYmd(normalized.publishedAt || normalized.updatedAt || normalized.effectiveAt);
  const effective = formatDateYmd(normalized.effectiveAt) || updated;
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}-冬日工具箱</title>
    <style>
      ${LEGAL_PAGE_STYLE}
    </style>
    <script src="/function/analytics-tracker.js" defer></script>
  </head>
  <body>
    <div class="wrap">
      <a class="back" href="/">← 返回首页</a>
      <div class="card">
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">
          生效日期：${escapeHtml(effective)}<br />
          最近更新：${escapeHtml(updated)}<br />
          版本：${escapeHtml(normalized.version)}
        </div>
        ${normalized.bodyHtml}
      </div>
      ${legalPageFooterHtml()}
    </div>
    <script src="/function/site-beian.js" defer></script>
  </body>
</html>
`;
}

function writeToolAccessAgreementHtmlFile(legalDir, doc) {
  const html = renderToolAccessAgreementHtml(doc);
  fs.writeFileSync(path.join(legalDir, TOOL_ACCESS_AGREEMENT_DEF.file), html, 'utf8');
  return TOOL_ACCESS_AGREEMENT_DEF.file;
}

module.exports = {
  LEGAL_DOCS_SETTING_KEY,
  INITIAL_NOTICE_VERSION,
  LEGAL_DOC_DEFS,
  DEFAULT_NOTICE_TITLE,
  DEFAULT_NOTICE_SUMMARY,
  extractCardBodyFromHtml,
  loadDefaultsFromLegalDir,
  normalizeLegalDocs,
  toPublicNotice,
  applyAdminPayload,
  renderLegalPageHtml,
  writeLegalHtmlFiles,
  docIdFromRequestPath,
  sanitizeLegalHtml,
  textToHtml,
  TOOL_ACCESS_AGREEMENT_SETTING_KEY,
  TOOL_ACCESS_AGREEMENT_DEF,
  DEFAULT_TOOL_ACCESS_AGREEMENT_VERSION,
  DEFAULT_TOOL_ACCESS_NOTICE_TITLE,
  DEFAULT_TOOL_ACCESS_NOTICE_SUMMARY,
  loadToolAccessAgreementDefault,
  normalizeToolAccessAgreement,
  applyToolAccessAgreementPayload,
  renderToolAccessAgreementHtml,
  writeToolAccessAgreementHtmlFile
};
