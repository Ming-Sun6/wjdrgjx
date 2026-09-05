const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function readHomeBundle() {
  return [
    read('index.html'),
    read('public/function/home.css'),
    read('public/function/home-app.js'),
  ].join('\n');
}

test('announcement supports an admin enabled switch and hides disabled announcements publicly', () => {
  const server = read('server.js');
  const admin = read('public/function/_ops/console-7a9/internal/admin.html');
  const home = readHomeBundle();

  assert.match(server, /enabled:\s*req\.body\?\.enabled\s*!==\s*false/);
  assert.match(server, /normalizedAnnouncement\.enabled\s*\?\s*normalizedAnnouncement\s*:\s*null/);
  assert.match(admin, /id="announcementEnabled"/);
  assert.match(admin, /enabled:\s*!!enabledInput\.checked/);
  assert.match(home, /raw\.enabled===false/);
  assert.match(home, /announcementButton\.style\.display/);
});

test('home lead click switch is persisted and renders non-link slides when disabled', () => {
  const server = read('server.js');
  const admin = read('public/function/_ops/console-7a9/internal/admin.html');
  const home = readHomeBundle();

  assert.match(server, /clickEnabled:\s*true/);
  assert.match(server, /clickEnabled\s*=\s*input\.clickEnabled\s*!==\s*false/);
  assert.match(server, /return \{ intervalMs, clickEnabled, enabled, slides \}/);
  assert.match(admin, /id="homeLeadClickEnabled"/);
  assert.match(admin, /clickEnabled:\s*!!clickInput\.checked/);
  assert.match(home, /function build\(slidesCfg, ms, clickEnabled\)/);
  assert.match(home, /wjdr-home-carousel-media is-static/);
});

test('home lead enabled switch hides the homepage carousel', () => {
  const server = read('server.js');
  const admin = read('public/function/_ops/console-7a9/internal/admin.html');
  const home = readHomeBundle();
  const publicHome = read('public/index.html');

  assert.match(server, /enabled:\s*true/);
  assert.match(server, /const enabled = input.enabled !== false/);
  assert.match(admin, /id="homeLeadEnabled"/);
  assert.match(admin, /enabled:\s*!!\(enabledInput&&enabledInput\.checked\)/);
  assert.match(home, /cfg\.enabled===false/);
  assert.match(home, /lead\.hidden=true/);
  assert.match(home, /cdn\.adwork\.net\/js\/makemoney\.js/);
  assert.match(home, /class="adwork-net adwork-auto"/);
  assert.match(home, /data-id="1129"/);
  assert.match(publicHome, /cdn\.adwork\.net\/js\/makemoney\.js/);
  assert.match(publicHome, /data-id="1129"/);
  assert.match(publicHome, /cfg\.enabled===false/);
});

test('publisher menu controls homepage ads independently of the carousel', () => {
  const server = read('server.js');
  const admin = read('public/function/_ops/console-7a9/internal/admin.html');
  const home = readHomeBundle();
  const publicHome = read('public/index.html');

  assert.match(server, /PUBLISHER_ADS_SETTING_KEY = 'publisher_ads'/);
  assert.match(server, /function defaultPublisherAds\(\)/);
  assert.match(server, /homeAdEnabled:\s*hasHome \? input\.homeAdEnabled !== false : legacyOn/);
  assert.match(server, /forumAdEnabled:\s*hasForum \? input\.forumAdEnabled !== false : legacyOn/);
  assert.match(server, /toolAdEnabled:\s*hasTool \? toolOn : true/);
  assert.match(server, /app\.get\('\/api\/publisher'/);
  assert.match(server, /app\.get\('\/api\/admin\/publisher'/);
  assert.match(server, /app\.put\('\/api\/admin\/publisher'/);
  assert.match(server, /\/api\/admin\/publisher\/forum-views/);
  assert.match(admin, /data-page="publisher"/);
  assert.match(admin, />流量主</);
  assert.match(admin, /id="page-publisher"/);
  assert.match(admin, /id="publisherHomeAdEnabled"/);
  assert.match(admin, /id="publisherForumAdEnabled"/);
  assert.match(admin, /id="publisherToolAdEnabled"/);
  assert.match(admin, /id="publisherViewsTbody"/);
  assert.match(admin, /\/api\/admin\/publisher\/forum-views/);
  assert.doesNotMatch(admin, /id="publisherAdEnabled"/);
  assert.doesNotMatch(admin, /id="homeLeadAdEnabled"/);
  assert.match(admin, /\/api\/admin\/publisher/);
  assert.match(home, /function applyAdSlot\(cfg\)/);
  assert.match(home, /cfg\.adEnabled===false/);
  assert.match(home, /slot\.parentNode\.removeChild\(slot\)/);
  assert.match(publicHome, /function applyAdSlot\(cfg\)/);
  assert.match(publicHome, /cfg\.adEnabled===false/);
  const tracker = read('public/function/analytics-tracker.js');
  assert.match(tracker, /function applyHomePublisherRuntime\(\)/);
  assert.match(tracker, /function isForumPostPage\(\)/);
  assert.match(tracker, /function isToolAdPage\(\)/);
  assert.match(tracker, /function isExcludedAdPage\(\)/);
  assert.match(tracker, /function insertAdSlotAtTop\(/);
  assert.ok(tracker.includes('/\\/function\\//i.test(path)'));
  assert.match(tracker, /applyHomeAdSlot\(null\)/);
  assert.match(tracker, /isHomePage\(\) \|\| isForumPostPage\(\) \|\| isToolAdPage\(\)/);
  assert.match(tracker, /wjdr-home-publisher-gap/);
  assert.match(tracker, /cfg\.enabled === false/);
  assert.match(tracker, /cdn\.adwork\.net\/js\/makemoney\.js/);
  assert.match(tracker, /data-id="1129"/);
  assert.match(tracker, /cfg\.forumAdEnabled === false/);
  assert.match(tracker, /cfg\.homeAdEnabled === false/);
  assert.match(tracker, /cfg\.toolAdEnabled != null \? cfg\.toolAdEnabled === false : cfg\.rangeAdEnabled === false/);
  const forumPost = read('public/function/forum-post.html');
  assert.match(forumPost, /cdn\.adwork\.net\/js\/makemoney\.js/);
  assert.match(forumPost, /id="wjdrAdworkSlot"/);
  assert.match(forumPost, /class="adwork-net adwork-auto"/);
  assert.match(forumPost, /data-id="1129"/);
  [
    'public/function/farthest-migration-range.html',
    'public/function/neighbor-progress.html',
    'public/function/history-immigration-group.html',
    'public/function/migration-prediction.html',
    'public/function/jisuan.html'
  ].forEach(function (rel) {
    const page = read(rel);
    assert.match(page, /cdn\.adwork\.net\/js\/makemoney\.js/);
    assert.match(page, /id="wjdrAdworkSlot"/);
    assert.match(page, /class="adwork-net adwork-auto"/);
    assert.match(page, /data-id="1129"/);
  });
  const calendar = read('public/function/calendar.html');
  assert.match(calendar, /id="wjdrAdworkSlot"/);
  assert.match(calendar, /class="adwork-net adwork-auto"/);
  assert.match(calendar, /data-id="1129"/);
  assert.match(tracker, /function isCalendarPage\(\)/);
  assert.match(tracker, /function isEmbedPage\(\)/);
  assert.match(admin, /全部前台工具页顶部/);
  [
    'public/function/farthest-migration-range.html',
    'public/function/neighbor-progress.html',
    'public/function/history-immigration-group.html',
    'public/function/migration-prediction.html',
    'public/function/jisuan.html',
    'public/function/forum-post.html',
    'public/function/calendar.html'
  ].forEach(function (rel) {
    const page = read(rel);
    assert.match(page, /<body[^>]*>[\s\S]{0,240}id="wjdrAdworkSlot"/, `${rel} should place the ad slot at the top of body`);
  });
});

test('home lead has responsive presentation and disabled-click styling', () => {
  const home = readHomeBundle();

  assert.match(home, /\.wjdr-home-carousel-media/);
  assert.match(home, /aspect-ratio:/);
  assert.match(home, /\.wjdr-home-carousel\.is-static/);
  assert.match(home, /@media \(max-width:\s*600px\)/);
  assert.match(home, /body:has\(#wjdrAdworkSlot\)/);
});
