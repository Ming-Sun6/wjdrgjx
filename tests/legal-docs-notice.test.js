const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  INITIAL_NOTICE_VERSION,
  extractCardBodyFromHtml,
  loadDefaultsFromLegalDir,
  normalizeLegalDocs,
  toPublicNotice,
  applyAdminPayload,
  renderLegalPageHtml,
  docIdFromRequestPath
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
  assert.match(server, /CREATE TABLE IF NOT EXISTS legal_notice_acks/);
  assert.match(server, /INSERT IGNORE INTO legal_notice_acks/);
  assert.match(server, /ackCount: await countLegalNoticeAcks/);
  assert.match(pgSchema, /CREATE TABLE IF NOT EXISTS legal_notice_acks/);
  assert.match(admin, /data-page="legal-docs"/);
  assert.match(admin, /legalDocsPublishBtn/);
  assert.match(admin, /已确认：/);
  assert.match(tracker, /legal-notice\.js/);
  assert.match(notice, /wjdr_legal_notice_ack/);
  assert.match(notice, />确定</);
  assert.match(notice, /\/legal/);
  assert.match(notice, /\/api\/legal-notice\/ack/);
});
