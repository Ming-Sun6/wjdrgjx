const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function sectionById(html, id) {
  const start = html.indexOf(`id="${id}"`);
  assert.notEqual(start, -1, `missing #${id}`);
  const nextWarehouse = html.indexOf('class="card wide tool-warehouse-shell"', start + id.length);
  return html.slice(start, nextWarehouse === -1 ? html.length : nextWarehouse);
}

test('mobile tool tiles wrap long names and use a readable narrow-screen grid', () => {
  const html = read('index.html') + '\n' + read('public/function/home.css');

  assert.match(html, /\.tool-tile-name\s*\{[^}]*white-space\s*:\s*normal[^}]*overflow-wrap\s*:\s*anywhere/s);
  assert.match(html, /\.tool-tile-name-inner\s*\{[^}]*width\s*:\s*100%[^}]*white-space\s*:\s*normal/s);
  assert.match(html, /@media\s*\(max-width:\s*600px\)[\s\S]*?\.tool-warehouse-grid\s*\{[^}]*repeat\(3,/);
  assert.match(html, /@media\s*\(max-width:\s*600px\)[\s\S]*?\.tool-tile-card\s*\{[^}]*aspect-ratio\s*:\s*auto/);
});

test('immigration ticket calculator is listed under more tools', () => {
  const html = read('index.html');
  const coreTools = sectionById(html, 'coreToolWarehouse');
  const moreTools = sectionById(html, 'extendedToolWarehouse');

  assert.doesNotMatch(coreTools, /function\/jisuan\.html/);
  assert.match(moreTools, /data-category="calcTools"\s+data-tool-priority="extended"[\s\S]*?function\/jisuan\.html/);
});

test('immigration calculator displays an explicit outdated-data warning', () => {
  const html = read('public/function/jisuan.html');

  assert.match(html, /role="(?:status|note)"/);
  assert.match(html, /移民券随游戏更新已经进行了调整/);
  assert.match(html, /该工具已经不准确了，仅供娱乐使用/);
});

test('home page exposes separate building query and calculator entries', () => {
  const html = read('index.html');
  const moreTools = sectionById(html, 'extendedToolWarehouse');

  assert.match(moreTools, /data-category="dataQuery"[\s\S]*?function\/building-upgrade-1-30\.html[\s\S]*?1-30建筑升级(?:<wbr>)?数据查询/);
  assert.match(moreTools, /data-category="calcTools"[\s\S]*?function\/building-upgrade-calculator\.html[\s\S]*?1-30建筑升级(?:<wbr>)?计算器/);
});

test('home page exposes the ice workshop placement assistant in basic tools', () => {
  const home = read('index.html');
  assert.match(home, /function\/ice-workshop-placement\.html/);
  assert.match(home, /data-tool-priority="core"[^>]*data-tool-id="ice-workshop-placement"/);
  assert.match(home, /创冰工坊[·｜丨]?最优摆放助手|最优摆放助手/);
});

test('ice workshop placement assistant includes public attribution, home return, and share metadata', () => {
  const html = read('public/function/ice-workshop-placement.html');
  assert.match(html, /创冰工坊·最优摆放助手由“无尽冬日-铁拳”制作/);
  assert.doesNotMatch(html, /合作微信：wjdrtiequan/);
  assert.match(html, /class="back-home"[^>]*href="\/"/);
  assert.match(html, /meta[^>]+name="description"[^>]+content=/);
  assert.match(html, /property="og:description"/);
  assert.match(html, /property="og:image"/);
  assert.match(html, /name="twitter:image"/);
});

test('home and admin changelogs separate the Gareth launch from the data completion release', () => {
  const home = read('index.html');
  const admin = read('public/function/_ops/console-7a9/internal/admin.html');

  for (const html of [home, admin]) {
    assert.match(html, /V0\.9\.28/);
    assert.match(html, /2026-08-03/);
    assert.match(html, /V0\.9\.27/);
    assert.match(html, /2026-07-24/);
    assert.match(html, /加雷斯/);
    assert.match(html, /专家计算器/);
    assert.match(html, /1–100 级/);
    assert.match(html, /天赋与技能效果/);
    assert.match(html, /新增专家「加雷斯」/);
    assert.match(html, /尚未收录的专家等级与效果信息统一标记为「暂无数据」/);
    assert.match(html, /建筑升级计算器/);
    assert.match(html, /移民券/);
    assert.doesNotMatch(html, /加雷斯[^<]*(?:\.xlsx|原始表|数据来源)/);
  }
  assert.match(admin, /活动横幅/);
  assert.doesNotMatch(home, /<li><strong>公告与活动横幅<\/strong>/);
});

test('latest changelogs keep public and admin release notes separated', () => {
  const home = read('index.html');
  const admin = read('public/function/_ops/console-7a9/internal/admin.html');
  const homeLog = home.slice(home.indexOf('id="changelogModal"'), home.indexOf('</div>\n\n  <script', home.indexOf('id="changelogModal"')));
  const adminLog = admin.slice(admin.indexOf('id="page-admin-log"'), admin.indexOf('</section>', admin.indexOf('id="page-admin-log"')));

  assert.match(home, /版本 V0\.9\.39/);
  assert.match(homeLog, /V0\.9\.39（2026-08-25）/);
  assert.match(homeLog, /活动日历上线/);
  assert.match(homeLog, /V0\.9\.38（2026-08-25）/);
  assert.match(homeLog, /最近两年/);
  assert.match(homeLog, /未开放/);
  assert.match(homeLog, /1096今麦雾/);
  assert.match(homeLog, /基础工具/);
  assert.match(homeLog, /V0\.9\.37（2026-08-24）/);
  assert.match(homeLog, /打熊车身推荐/);
  assert.match(homeLog, /返回体验优化/);
  assert.match(homeLog, /V0\.9\.32（2026-08-22）/);
  assert.match(homeLog, /论坛阅读体验/);
  assert.match(homeLog, /领主装备与宝石计算器/);
  assert.doesNotMatch(homeLog, /后台|管理员|管理端|权限|数据库|管理接口|工具管理|配置项/);

  assert.match(admin, /admin-version[^>]*>V0\.9\.39</);
  assert.match(adminLog, /V0\.9\.39（2026-08-25）/);
  assert.match(adminLog, /首页菜单控制/);
  assert.match(adminLog, /V0\.9\.38（2026-08-25）/);
  assert.match(adminLog, /逐日期设置“未开放”/);
  assert.match(adminLog, /打熊车身推荐/);
  assert.match(adminLog, /基础工具/);
  assert.match(adminLog, /V0\.9\.37（2026-08-24）/);
  assert.match(adminLog, /打熊车身推荐/);
  assert.match(adminLog, /新增阶段默认代次/);
  assert.match(adminLog, /历史移民分组配置/);
  assert.match(adminLog, /邻邦进度管理/);
  assert.doesNotMatch(adminLog, /分享卡片优化/);
});

test('home changelog consolidates the August 22 public updates', () => {
  const home = read('index.html');
  const homeLog = home.slice(home.indexOf('id="changelogModal"'), home.indexOf('</div>\n\n  <script', home.indexOf('id="changelogModal"')));
  assert.equal((homeLog.match(/2026-08-22/g) || []).length, 1);
  assert.match(homeLog, /移民相关数据/);
  assert.match(homeLog, /论坛阅读体验/);
  assert.match(homeLog, /领主装备与宝石计算器/);
  assert.match(homeLog, /分享卡片优化/);
});
