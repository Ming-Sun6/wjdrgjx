const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  INITIAL_NOTICE_VERSION,
  LEGAL_DOC_DEFS,
  extractCardBodyFromHtml,
  loadDefaultsFromLegalDir,
  normalizeLegalDocs,
  toPublicNotice,
  applyAdminPayload,
  renderLegalPageHtml,
  docIdFromRequestPath,
  DEFAULT_TOOL_ACCESS_AGREEMENT_VERSION,
  loadToolAccessAgreementDefault,
  applyToolAccessAgreementPayload,
  renderToolAccessAgreementHtml
} = require('../legal-docs');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('extracts legal card bodies from current html files', () => {
  const about = extractCardBodyFromHtml(read('legal/about.html'));
  assert.match(about, /网站是什么/);
  assert.doesNotMatch(about, /<h1>/);
  assert.match(extractCardBodyFromHtml(read('legal/privacy.html')), /Cookie/);
  assert.match(extractCardBodyFromHtml(read('legal/user-agreement.html')), /广告与第三方服务/);
});

test('public notice uses a stable first-visit version until publish', () => {
  const defaults = loadDefaultsFromLegalDir(path.join(root, 'legal'));
  const notice = toPublicNotice(defaults);
  assert.equal(notice.version, INITIAL_NOTICE_VERSION);
  assert.equal(notice.links.length, 3);
  assert.equal(notice.links[0].href, '/legal/about');
});

test('publish bumps version and keeps sanitized html', () => {
  const defaults = loadDefaultsFromLegalDir(path.join(root, 'legal'));
  const current = normalizeLegalDocs(null, defaults);
  const applied = applyAdminPayload(current, {
    noticeTitle: '协议已更新',
    noticeSummary: '请阅读后点击确定。',
    documents: {
      about: { title: '关于我们', bodyHtml: '<h2>测试</h2><p>内容<script>alert(1)</script></p>' }
    }
  }, { publish: true, actorName: 'admin', now: '2026-08-28T12:00:00.000Z' });

  assert.ok(!applied.error);
  assert.notEqual(applied.docs.version, INITIAL_NOTICE_VERSION);
  assert.equal(applied.docs.publishedBy, 'admin');
  assert.match(applied.docs.documents.about.bodyHtml, /<h2>测试<\/h2>/);
  assert.doesNotMatch(applied.docs.documents.about.bodyHtml, /script/i);
  assert.match(renderLegalPageHtml('about', applied.docs), /协议已更新|测试|关于我们/);
});

test('request path maps to legal document ids', () => {
  assert.equal(docIdFromRequestPath('/legal/about'), 'about');
  assert.equal(docIdFromRequestPath('/legal/privacy.html'), 'privacy');
  assert.equal(docIdFromRequestPath('/legal/user-agreement'), 'agreement');
  assert.equal(docIdFromRequestPath('/legal/tool-access-agreement'), '');
  assert.equal(docIdFromRequestPath('/legal/nope'), '');
});

test('server and admin expose legal docs notice endpoints', () => {
  const server = read('server.js');
  const admin = read('public/function/_ops/console-7a9/internal/admin.html');
  const tracker = read('public/function/analytics-tracker.js');
  const notice = read('public/function/legal-notice.js');
  const pgSchema = read('postgres-schema.js');

  assert.match(server, /app\.get\('\/api\/legal-notice'/);
  assert.match(server, /app\.post\('\/api\/legal-notice\/ack'/);
  assert.match(server, /app\.get\('\/api\/admin\/legal-docs'/);
  assert.match(server, /app\.post\('\/api\/admin\/legal-docs\/publish'/);
  assert.match(server, /app\.get\('\/api\/admin\/tool-access-agreement'/);
  assert.match(server, /app\.post\('\/api\/admin\/tool-access-agreement\/publish'/);
  assert.match(server, /CREATE TABLE IF NOT EXISTS legal_notice_acks/);
  assert.match(server, /INSERT IGNORE INTO legal_notice_acks/);
  assert.match(server, /ackCount: await countLegalNoticeAcks/);
  assert.match(pgSchema, /CREATE TABLE IF NOT EXISTS legal_notice_acks/);
  assert.match(admin, /data-page="legal-docs"/);
  assert.match(admin, /legalDocsPublishBtn/);
  assert.match(admin, /toolAccessPublishBtn/);
  assert.match(admin, /功能申请协议（单独发布）/);
  assert.match(admin, /只会在需要申请的功能页提醒已登录用户/);
  assert.match(admin, /已确认：/);
  assert.match(tracker, /legal-notice\.js/);
  assert.match(tracker, /tool-access-agreement-notice\.js/);
  assert.equal(LEGAL_DOC_DEFS.length, 3);
  assert.equal(toPublicNotice(loadDefaultsFromLegalDir(path.join(root, 'legal'))).links.length, 3);
  assert.doesNotMatch(notice, /tool-access-agreement/);
  assert.match(notice, /wjdr_legal_notice_ack/);
  assert.match(notice, />确定</);
  assert.match(notice, /\/legal/);
  assert.match(notice, /\/api\/legal-notice\/ack/);
});

test('tool access agreement publish is independent of site-wide legal notice', () => {
  const legalDir = path.join(root, 'legal');
  const siteDocs = normalizeLegalDocs(null, loadDefaultsFromLegalDir(legalDir));
  const current = loadToolAccessAgreementDefault(legalDir);
  const applied = applyToolAccessAgreementPayload(current, {
    title: '功能申请协议',
    noticeTitle: '申请协议已更新',
    noticeSummary: '请阅读后确认。泄漏未公开内容的全部后果由你自行承担。',
    bodyHtml: '<h2>申请须知</h2><p>内容<script>alert(1)</script></p>'
  }, { publish: true, actorName: 'admin', now: '2026-09-03T12:00:00.000Z' });

  assert.ok(!applied.error);
  assert.notEqual(applied.doc.version, DEFAULT_TOOL_ACCESS_AGREEMENT_VERSION);
  assert.equal(applied.doc.publishedBy, 'admin');
  assert.match(applied.doc.bodyHtml, /<h2>申请须知<\/h2>/);
  assert.doesNotMatch(applied.doc.bodyHtml, /script/i);
  assert.match(renderToolAccessAgreementHtml(applied.doc), /申请须知|功能申请协议/);
  assert.equal(toPublicNotice(siteDocs).version, INITIAL_NOTICE_VERSION);
  assert.equal(toPublicNotice(siteDocs).links.length, 3);
});
