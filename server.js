const crypto = require('crypto');
const express = require('express');
let sanitizeHtml = null;
try { sanitizeHtml = require('sanitize-html'); } catch (_e) { sanitizeHtml = null; }
let mysql = null;
try {
  // mysql2 不是必需依赖：当 PostgreSQL 可用时我们优先使用 pg。
  // 只有在 pg 不可用时才回退到 MySQL。
  mysql = require('mysql2');
} catch (_e) {
  mysql = null;
}
try {
  // 保障生产环境（Windows 服务）也能读到根目录 .env
  // （否则 pg 配置可能为空，导致仍回退到 MySQL）。
  require('dotenv').config();
} catch (_e) {}
const { createPostgresPool, createPostgresDatabase } = require('./postgres-db');
const path = require('path');
const fs = require('fs');
let sharp = null;
try { sharp = require('sharp'); } catch (_e) { sharp = null; }
const {
  ensureVisitorIdentity,
  isValidVisitorId,
  classifyRequestPath,
  classifyApiPath
} = require('./analytics/identity');
const {
  RAW_EVENTS_TABLE_SQL,
  HOURLY_AGGREGATES_TABLE_SQL
} = require('./analytics/schema');
const { createAnalyticsService } = require('./analytics/service');
const { createDashboardHandlers } = require('./analytics/handlers');
const { createGovernanceService } = require('./admin-governance');
const {
  normalizeAdminUserPatchPayload,
  validateBatchAdminUserAction,
  buildBatchResetUsername
} = require('./admin-user-management');
const { mountGiftcodeProxy, GIFTCODE_URL_PREFIX, GIFTCODE_SERVICE_URL, GIFTCODE_UI_MODE } = require('./giftcode-proxy');
const {
  mountGiftPackRoutes,
  seedGiftPacksIfEmpty,
  GIFT_PACKS_DDL_MYSQL
} = require('./gift-packs');
const {
  mountBearpitBackupRoutes,
  BEARPIT_BACKUPS_DDL_MYSQL,
  BEARPIT_SHARES_DDL_MYSQL,
  BEARPIT_SHARES_DDL_PG,
  BEARPIT_SIMPLE_BACKUPS_DDL_MYSQL,
  BEARPIT_SIMPLE_BACKUPS_DDL_PG
} = require('./bearpit-backups');
const {
  mountBearpitCollectRoutes,
  BEARPIT_COLLECT_FORMS_DDL_MYSQL,
  BEARPIT_COLLECT_FORMS_DDL_PG,
  BEARPIT_COLLECT_ENTRIES_DDL_MYSQL,
  BEARPIT_COLLECT_ENTRIES_DDL_PG
} = require('./bearpit-collect');
const { mountBearpitAdminRoutes } = require('./bearpit-admin');
const { mountBearpitTemplateRoutes } = require('./bearpit-templates');
const {
  mountHeroDataRoutes,
  seedHeroGenerationsIfEmpty,
  HERO_GENERATIONS_DDL_MYSQL
} = require('./hero-data');
const { mountLordEquipmentGemRoutes } = require('./lord-equipment-gem');
const { mountUserRewardsRoutes, ensureUserRewardsSchema, repairUserRewardsSchema } = require('./user-rewards');
const {
  mountShopRoutes,
  ensureShopSchema,
  applyShopItemToUser,
  mapShopItemRow
} = require('./shop');
const { mountAeroplaneChessPollingRoutes } = require('./aeroplane-chess-polling');
const {
  FORUM_VISIBLE_VIEW_COUNT_EXPR,
  buildForumViewRows
} = require('./forum-post-views');
const { applyQualifiedForumRead } = require('./forum-post-reads');
const { createPublisherForumStatsService } = require('./publisher-forum-stats');
const { getChatSendPolicy, canReadChatThread, createKeyedSerialExecutor } = require('./social-features');
const { injectShareMeta, resolvePageMeta, resolvePublicHtmlPath } = require('./share-meta');
const { defaultNeighborProgressConfig, normalizeNeighborProgressConfig } = require('./neighbor-progress-config');
const { DEFAULT_HISTORY_IMMIGRATION_DATES, defaultHistoryImmigrationConfig, normalizeHistoryImmigrationConfig } = require('./history-immigration-config');
const { ensureCalendarSchema, createCalendarStore } = require('./calendar-store');
const { mountCalendarRoutes } = require('./calendar-routes');
const { mountHomeNavigationRoutes, HOME_NAVIGATION_CATALOG, normalizeHomeNavigation, createHomeNavigationHandlers } = require('./home-navigation');
const {
  LEGAL_DOCS_SETTING_KEY,
  loadDefaultsFromLegalDir,
  normalizeLegalDocs,
  toPublicNotice,
  applyAdminPayload,
  renderLegalPageHtml,
  writeLegalHtmlFiles,
  docIdFromRequestPath,
  TOOL_ACCESS_AGREEMENT_SETTING_KEY,
  DEFAULT_TOOL_ACCESS_AGREEMENT_VERSION,
  DEFAULT_TOOL_ACCESS_NOTICE_TITLE,
  DEFAULT_TOOL_ACCESS_NOTICE_SUMMARY,
  loadToolAccessAgreementDefault,
  normalizeToolAccessAgreement,
  applyToolAccessAgreementPayload,
  renderToolAccessAgreementHtml,
  writeToolAccessAgreementHtmlFile
} = require('./legal-docs');

const app = express();
const runChatSendSerial = createKeyedSerialExecutor();
const PORT = 3000;
const PUBLIC_SITE_ORIGIN = String(process.env.PUBLIC_SITE_ORIGIN || 'https://wjgl.store').replace(/\/$/, '');
const SESSION_COOKIE_NAME = 'auth_token';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const AVATAR_COOLDOWN_MS = 24 * 60 * 60 * 1000;
// 注意：站点前面是 IIS（不是 Node）在直接返回静态资源，
// 所以头像文件必须落在 IIS 站点根目录下的 /uploads/avatars 才能被访问到。
const AVATAR_UPLOAD_DIR = path.join(__dirname, 'uploads', 'avatars');
const AVATAR_PUBLIC_PREFIX = '/uploads/avatars/';
const FORUM_IMAGE_UPLOAD_DIR = path.join(__dirname, 'uploads', 'forum');
const FORUM_IMAGE_PUBLIC_PREFIX = '/uploads/forum/';
const DEFAULT_ADMIN_LOGIN_ID = process.env.DEFAULT_ADMIN_LOGIN_ID || 'admin';
const SITE_FOOTER_SETTING_KEY = 'site_footer';
const LEGAL_DIR = path.join(__dirname, 'legal');
const TOOL_MANAGEMENT_SETTING_KEY = 'tool_management';
const TOOL_ACCESS_REQUESTS_SETTING_KEY = 'tool_access_requests';
const MAX_TOOL_ACCESS_REQUESTS = 300;
const TOOL_ACCESS_AGREEMENT_VERSION = DEFAULT_TOOL_ACCESS_AGREEMENT_VERSION;
const TOOL_ACCESS_AGREEMENT_HREF = '/legal/tool-access-agreement';
const TOOL_ACCESS_AGREEMENT_ACKS_SETTING_KEY = 'tool_access_agreement_acks';
const NEIGHBOR_PROGRESS_SETTING_KEY = 'neighbor_progress_schedule';
const HISTORY_IMMIGRATION_SETTING_KEY = 'history_immigration_config';
const TOOL_BADGES = new Set(['none', 'new', 'hot']);
const TOOL_DISPLAY_GROUPS = new Set(['featured', 'core', 'extended', 'miniGames']);
const TOOL_CATEGORIES = new Set(['calcTools', 'dataQuery', 'miniGames']);
const TOOL_CATALOG = [
  { id: 'training-calculator', name: '练兵计算站', group: 'featured', defaultVisible: true, badge: 'none' },
  { id: 'fire-crystal-building', name: '火晶建筑计算器', group: 'featured', defaultVisible: true, badge: 'none' },
  { id: 'lord-equipment-gem', name: '领主装备与宝石计算器', group: 'featured', defaultVisible: true, badge: 'none' },
  { id: 'hero-data', name: '英雄数据', group: 'featured', defaultVisible: true, badge: 'none' },
  { id: 'bear-pit', name: '熊坑排布', group: 'core', defaultVisible: true, badge: 'none' },
  { id: 'bear-pit-simple', name: '熊坑排布简约版', group: 'core', defaultVisible: true, badge: 'none' },
  { id: 'tiantian-strategy', name: '甜甜的攻略站', group: 'core', defaultVisible: true, badge: 'none' },
  { id: 'refine-crystal-calculator', name: '精炼提炼计算器', group: 'core', defaultVisible: true, badge: 'none' },
  { id: 'refine-crystal-simulator', name: '精炼提炼模拟器', group: 'core', defaultVisible: true, badge: 'none' },
  { id: 'engineering-station-time', name: '工程站时间', group: 'core', defaultVisible: true, badge: 'none' },
  { id: 'gift-value-calculator', name: '礼包性价比', group: 'core', defaultVisible: true, badge: 'none' },
  { id: 'hero-equipment-calculator', name: '英雄装备计算器', group: 'core', defaultVisible: true, badge: 'none' },
  { id: 'bear-damage-calculator', name: '打熊伤害计算器', group: 'core', defaultVisible: true, badge: 'none' },
  { id: 'expert-calculator', name: '专家计算器', group: 'core', defaultVisible: true, badge: 'none' },
  { id: 't11-calculator', name: 'T11 升级', group: 'core', defaultVisible: true, badge: 'none' },
  { id: 't12-calculator', name: 'T12科技计算器', group: 'core', defaultVisible: true, badge: 'none' },
  { id: 'giftcode-center', name: '无尽冬日兑换中心', group: 'extended', defaultVisible: false, badge: 'none' },
  { id: 'immigration-coupon-calculator', name: '移民券计算器', group: 'extended', defaultVisible: true, badge: 'none' },
  { id: 'building-upgrade-calculator', name: '1-30建筑升级计算器', group: 'extended', defaultVisible: true, badge: 'none' },
  { id: 't12-data-overview', name: 'T12数据总览', group: 'extended', defaultVisible: true, badge: 'none' },
  { id: 'neighbor-progress', name: '邻邦进度', group: 'extended', defaultVisible: true, badge: 'none' },
  { id: 'history-immigration-group', name: '历史移民分组', group: 'extended', defaultVisible: true, badge: 'none' },
  { id: 'migration-prediction', name: '移民预测', group: 'extended', defaultVisible: true, badge: 'none' },
  { id: 'farthest-migration-range', name: '最远移民区间', group: 'extended', defaultVisible: true, badge: 'none' },
  { id: 'building-upgrade-query', name: '1-30建筑升级数据查询', group: 'extended', defaultVisible: true, badge: 'none' },
  { id: 'pet-data-query', name: '宠物数据查询', group: 'extended', defaultVisible: true, badge: 'none' },
{ id: 'bear-body-recommendation', name: '打熊车身推荐', group: 'core', defaultVisible: true, badge: 'none' },
  { id: 'ice-workshop-placement', name: '创冰工坊·最优摆放助手', group: 'core', defaultVisible: true, badge: 'none' },
  { id: 'wjti-personality-test', name: '无尽冬日人格测试', group: 'extended', defaultVisible: true, badge: 'none' },
  { id: 'regular-gift-data', name: '常规礼包', group: 'extended', defaultVisible: true, badge: 'none' },
  { id: 'special-gift-data', name: '特惠礼包', group: 'extended', defaultVisible: true, badge: 'none' },
  { id: 'reference-hub', name: '礼包参考总览', group: 'extended', defaultVisible: true, badge: 'none' },
  { id: 'gift-rotation-schedule', name: '礼包轮换表', group: 'extended', defaultVisible: true, badge: 'none' },
  { id: 'aeroplane-chess', name: '极简飞行棋', group: 'miniGames', defaultVisible: true, badge: 'none' },
  { id: 'map-editor', name: '全能地图编辑器', group: 'core', defaultVisible: true, badge: 'none' }
];
const TOOL_DATA_QUERY_IDS = new Set([
  'hero-data', 'tiantian-strategy', 'bear-body-recommendation', 'ice-workshop-placement',
  't12-data-overview', 'neighbor-progress', 'history-immigration-group', 'migration-prediction',
  'farthest-migration-range',
  'building-upgrade-query', 'pet-data-query', 'regular-gift-data', 'special-gift-data',
  'reference-hub', 'gift-rotation-schedule'
]);
const TOOL_ENTRY_PATHS = {
  'training-calculator': ['/function/equipment-training-calculator.html'],
  'fire-crystal-building': ['/function/Architecture10.html'],
  'lord-equipment-gem': ['/function/lord-equipment-gem-calculator.html'],
  'hero-data': ['/function/Zero/hero-data.html', '/function/Zero/generation-heroes.html'],
  'bear-pit': ['/function/BeaPit.html'],
  'bear-pit-simple': ['/function/BearPitSimple.html'],
  'tiantian-strategy': ['/function/tiantian-strategy-hub.html'],
  'refine-crystal-calculator': ['/function/refine-crystal-calculator.html'],
  'refine-crystal-simulator': ['/function/refine-crystal-simulator.html'],
  'engineering-station-time': ['/function/engineering-station-time.html'],
  'gift-value-calculator': ['/function/gift-value-calculator.html'],
  'hero-equipment-calculator': ['/function/hero-equipment-calculator.html'],
  'bear-damage-calculator': ['/function/bear-damage/', '/function/bear-damage/index.html', '/function/bear-damage'],
  'expert-calculator': ['/function/expert-calculator.html'],
  't11-calculator': ['/function/T11Calculator.html'],
  't12-calculator': ['/function/T12Calculator.html'],
  'giftcode-center': ['/giftcode/'],
  'immigration-coupon-calculator': ['/function/jisuan.html'],
  'building-upgrade-calculator': ['/function/building-upgrade-calculator.html'],
  't12-data-overview': ['/function/T12DataOverview.html'],
  'neighbor-progress': ['/function/neighbor-progress.html'],
  'history-immigration-group': ['/function/history-immigration-group.html'],
  'migration-prediction': ['/function/migration-prediction.html'],
  'farthest-migration-range': ['/function/farthest-migration-range.html'],
  'building-upgrade-query': ['/function/building-upgrade-1-30.html'],
  'pet-data-query': ['/function/pet-data-query.html'],
  'bear-body-recommendation': ['/function/bear-body-recommendation.html'],
  'ice-workshop-placement': ['/function/ice-workshop-placement.html'],
  'wjti-personality-test': ['/function/wjti-personality-test.html'],
  'regular-gift-data': ['/function/Zero/regular-gift-data.html'],
  'special-gift-data': ['/function/Zero/special-gift-data.html'],
  'reference-hub': ['/function/reference-hub/index.html'],
  'gift-rotation-schedule': ['/function/Zero/gift-rotation-schedule.html'],
  'aeroplane-chess': ['/function/aeroplane-chess/index.html', '/function/aeroplane-chess/game.html', '/function/aeroplane-chess/spectate.html'],
  'map-editor': ['/map-tool/', '/map-tool/index.html']
};

function defaultToolCategory(tool) {
  if (tool.group === 'miniGames') return 'miniGames';
  return TOOL_DATA_QUERY_IDS.has(tool.id) ? 'dataQuery' : 'calcTools';
}

function normalizeManagedToolPath(value) {
  let pathname = String(value || '').split('?')[0];
  try { pathname = decodeURIComponent(pathname); } catch (_error) {}
  pathname = ('/' + pathname.replace(/^\/+/, '')).replace(/^\/public\//i, '/');
  if (pathname.length > 1) pathname = pathname.replace(/\/$/, '/index.html');
  if (!/\.[a-z0-9]+$/i.test(pathname)) pathname += '.html';
  return pathname.toLowerCase();
}

function findManagedToolByPath(pathname) {
  const normalized = normalizeManagedToolPath(pathname);
  for (const tool of TOOL_CATALOG) {
    const paths = TOOL_ENTRY_PATHS[tool.id] || [];
    if (paths.some((entry) => normalizeManagedToolPath(entry) === normalized)) return tool;
    if (tool.id === 'reference-hub' && normalized.startsWith('/function/reference-hub/')) return tool;
    if (tool.id === 'aeroplane-chess' && normalized.startsWith('/function/aeroplane-chess/')) return tool;
    if (tool.id === 'map-editor' && (normalized === '/map-tool.html' || normalized === '/map-tool/index.html')) return tool;
    if (tool.id === 'hero-data' && /^\/function\/zero\/(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth)-generation-heroes\.html$/.test(normalized)) return tool;
  }
  return null;
}

function renderToolGatePageHtml({ title, message, tool }) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const toolId = escapeHtml(String(tool && tool.id || ''));
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${safeTitle}</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:linear-gradient(145deg,#fff7e9,#e9f1e8);color:#483b31;font-family:"Microsoft YaHei",sans-serif}
    .box{width:min(520px,100%);padding:34px;border:1px solid #ead7c2;border-radius:24px;background:rgba(255,255,255,.9);box-shadow:0 20px 60px rgba(76,55,38,.13);text-align:center}
    h1{margin:0 0 12px;font-size:1.55rem}
    p{color:#756456;line-height:1.8}
    .actions{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:16px}
    .actions a,button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:11px 18px;border-radius:999px;font-weight:700;font-size:1rem;font-family:inherit;cursor:pointer;text-decoration:none;box-sizing:border-box}
    .actions a{background:#bd6d49;color:#fff;border:0}
    button{background:#fff;color:#bd6d49;border:1px solid #bd6d49}
    button:disabled{opacity:.55;cursor:not-allowed}
    .agreement-link{display:inline-block;margin-top:8px;color:#bd6d49;font-size:.9rem;font-weight:700;text-decoration:none;border-bottom:1px dotted currentColor}
    .agree-row{display:flex;align-items:flex-start;justify-content:center;gap:8px;margin-top:12px;color:#483b31;font-size:.9rem;line-height:1.55;text-align:left;cursor:pointer}
    .agree-row input{margin-top:3px;flex:0 0 auto}
    .login-form{display:grid;gap:8px;margin-top:16px;text-align:left}
    .login-form[hidden]{display:none}
    .login-form input[type="text"],.login-form input[type="password"]{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #ead7c2;border-radius:12px;font-size:1rem;font-family:inherit}
    .hint{margin:14px 0 0;font-size:.9rem}
  </style>
</head>
<body data-tool-id="${toolId}">
  <main class="box">
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
    <a class="agreement-link" href="${TOOL_ACCESS_AGREEMENT_HREF}" target="_blank" rel="noopener noreferrer">查看完整协议</a>
    <label class="agree-row" for="agreeCheckbox">
      <input id="agreeCheckbox" type="checkbox">
      <span>我已阅读并同意《功能申请协议》</span>
    </label>
    <div class="actions">
      <a href="/">返回工具箱首页</a>
      <button type="button" id="requestAccessBtn">申请权限</button>
    </div>
    <form id="loginForm" class="login-form" hidden>
      <input id="loginIdInput" name="loginId" autocomplete="username" placeholder="登录 ID" maxlength="32">
      <input id="passwordInput" name="password" type="password" autocomplete="current-password" placeholder="密码" maxlength="64">
      <button type="submit">登录并申请</button>
    </form>
    <p class="hint" id="requestStatus">登录后即可向管理员申请使用该功能。</p>
  </main>
  <script>
    (function () {
      var toolId = document.body.getAttribute('data-tool-id') || '';
      var btn = document.getElementById('requestAccessBtn');
      var statusEl = document.getElementById('requestStatus');
      var loginForm = document.getElementById('loginForm');
      var loginIdInput = document.getElementById('loginIdInput');
      var passwordInput = document.getElementById('passwordInput');
      var agreeCheckbox = document.getElementById('agreeCheckbox');
      function setStatus(text, isError) {
        statusEl.textContent = text;
        statusEl.style.color = isError ? '#a24b32' : '#756456';
      }
      function api(url, options) {
        return fetch(url, Object.assign({
          credentials: 'same-origin',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
        }, options || {})).then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            return { res: res, data: data };
          });
        });
      }
      function markApplied(text) {
        btn.disabled = true;
        btn.textContent = '已申请';
        loginForm.hidden = true;
        setStatus(text || '已提交申请，请等待管理员审核。');
      }
      function hasAgreed() {
        return !!(agreeCheckbox && agreeCheckbox.checked);
      }
      function requireAgreement() {
        if (hasAgreed()) return true;
        setStatus('请先阅读并勾选同意《功能申请协议》。', true);
        return false;
      }
      function submitRequest() {
        if (!requireAgreement()) {
          btn.disabled = false;
          return Promise.resolve(false);
        }
        return api('/api/tool-access-requests', {
          method: 'POST',
          body: JSON.stringify({ toolId: toolId, acceptedAgreement: true })
        }).then(function (result) {
          var error = result.data && result.data.error;
          if (result.res.status === 401 || error === 'SESSION_EXPIRED' || error === 'UNAUTHORIZED') {
            loginForm.hidden = false;
            btn.disabled = false;
            setStatus('请先登录后再申请。', true);
            return false;
          }
          if (error === 'ALREADY_PENDING') { markApplied('你已提交申请，请等待管理员审核。'); return true; }
          if (error === 'ALREADY_ALLOWED') {
            btn.disabled = true;
            btn.textContent = '已通过';
            setStatus('你已有权限，请刷新页面。');
            return true;
          }
          if (!result.res.ok) {
            var message = '申请失败，请稍后再试。';
            if (error === 'UNKNOWN_TOOL') message = '无法识别该工具。';
            else if (error === 'AGREEMENT_REQUIRED') message = '请先阅读并勾选同意《功能申请协议》。';
            setStatus(message, true);
            btn.disabled = false;
            return false;
          }
          markApplied('已提交申请，请等待管理员审核。');
          return true;
        });
      }
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        if (!requireAgreement()) return;
        btn.disabled = true;
        api('/api/auth/me').then(function (result) {
          if (!result.data || !result.data.authenticated) {
            loginForm.hidden = false;
            btn.disabled = false;
            setStatus('请先登录后再申请。');
            return;
          }
          return submitRequest();
        }).catch(function () {
          setStatus('网络错误，请稍后再试。', true);
          btn.disabled = false;
        });
      });
      loginForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var loginId = String(loginIdInput.value || '').trim();
        var password = String(passwordInput.value || '');
        if (!requireAgreement()) return;
        if (!loginId || !password) {
          setStatus('请填写登录 ID 和密码。', true);
          return;
        }
        api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ loginId: loginId, password: password })
        }).then(function (result) {
          if (!result.res.ok) {
            setStatus(result.data && result.data.error === 'BANNED' ? '该账号已被封禁。' : '账号或密码不正确。', true);
            return;
          }
          return submitRequest();
        }).catch(function () {
          setStatus('登录失败，请稍后再试。', true);
        });
      });
      if (toolId) {
        api('/api/tool-access-requests/mine?toolId=' + encodeURIComponent(toolId)).then(function (result) {
          var request = result.data && result.data.request;
          if (!request) return;
          if (request.status === 'pending') markApplied('你已提交申请，请等待管理员审核。');
          else if (request.status === 'approved') {
            btn.disabled = true;
            btn.textContent = '已通过';
            setStatus('申请已通过，请刷新页面后重试。');
          }
        }).catch(function () {});
      }
    })();
  </script>
  <script src="/function/tool-access-agreement-notice.js" defer></script>
</body>
</html>`;
}

function sendToolDisabledPage(res, tool, message) {
  const safeName = tool && tool.name || '该工具';
  res.status(503);
  res.setHeader('Cache-Control', 'no-store');
  return res.type('html').send(renderToolGatePageHtml({
    title: `${safeName}当前已关闭`,
    message: message || '该工具当前已关闭，请稍后再试。',
    tool
  }));
}

function sendToolRestrictedPage(res, tool, setting) {
  const safeName = tool && tool.name || '该工具';
  const allowedCount = Array.isArray(setting?.allowedLoginIds) ? setting.allowedLoginIds.length : 0;
  const adminOnly = setting?.adminOnly === true;
  const title = adminOnly && !allowedCount ? `${safeName}仅管理员可访问` : `${safeName}仅指定用户可访问`;
  const message = adminOnly && !allowedCount
    ? '该工具当前仅对管理员开放，普通用户无法打开此页面。'
    : adminOnly
      ? '该工具当前仅对管理员或指定用户开放。'
      : '该工具当前仅对指定用户开放。';
  res.status(403);
  res.setHeader('Cache-Control', 'no-store');
  return res.type('html').send(renderToolGatePageHtml({
    title,
    message,
    tool
  }));
}

function sendToolAdminOnlyPage(res, tool) {
  return sendToolRestrictedPage(res, tool, { adminOnly: true, allowedLoginIds: [] });
}
const DEFAULT_SITE_FOOTER_CREDITS = [
  '制作：2041茗子、飞菇',
  '数据：飞菇、甜甜、627贰叁、奶酪、719缥缈、2041茗子',
  '测试：2041茗子、飞菇、甜甜、627贰叁、奶酪、719缥缈、755脆脆、2144煤球、柒枫团队',
  '宣传大使：懒羊羊',
  '赞助：39 拙山枯水大江行',
  '',
  '感谢以上所有人对本攻略站的付出'
].join('\n');

const MIGRATION_GROUP_SECTIONS = Array.from({ length: 10 }, (_, i) => `migration-${i + 1}`);
const FORUM_SECTIONS = new Set(['guide', 'forecast', 'talk', 'melon', ...MIGRATION_GROUP_SECTIONS]);
const ADMIN_ONLY_SECTIONS = new Set(['guide', 'forecast']);
const MEMBERSHIP_STATUSES = new Set(['none', 'active', 'expired', 'lifetime']);
const GENDER_VALUES = new Set(['unknown', 'male', 'female']);
const USER_TITLE_MAX_CHARS = 24;
const DEFAULT_PROFILE_BIO = '这个人很高冷，连个人介绍都不改！';
const PROFILE_BIO_MAX_CHARS = 120;
const WEAK_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', '123456789qaz', 'qaz123456',
  'qwerty', 'qwerty123', 'password', 'abc123456', 'abc12345',
  '11111111', '00000000', '87654321', '1q2w3e4r', '1q2w3e4r5t',
  '1qaz2wsx', '1qaz2wsx3edc'
]);

const sessions = new Map();
let pool = null;
let db = null;
if (mysql) {
  pool = mysql.createPool({
    host: 'localhost',
    user: 'db_user',
    password: 'REDACTED',
    database: 'test',
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 60000
  });
  db = pool.promise();
}
let pgDatabase = null;
try {
  const pgPool = createPostgresPool();
  pgDatabase = pgPool ? createPostgresDatabase(pgPool) : null;
} catch (_e) {
  pgDatabase = null;
}
let analyticsService = null;
let dashboardHandlers = null;
let governanceService = null;

function isHttpsRequest(req) {
  if (req && req.secure) return true;
  const xfProto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return xfProto === 'https';
}

// HTTPS 跳转只在 IIS / CDN 层做。Node 在 IIS 反代后收到的是 HTTP，若在此 301 到 HTTPS 会死循环。
app.use((req, res, next) => {
  if (isHttpsRequest(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

const giftcodeStaticDir = path.join(__dirname, 'public', 'giftcode');
app.use(async (req, res, next) => {
  try {
    if (req.method !== 'GET') return next();
    const managedTool = findManagedToolByPath(req.path);
    if (!managedTool) return next();
    const stored = await getSetting(TOOL_MANAGEMENT_SETTING_KEY, { tools: [] });
    const normalized = normalizeToolManagement(stored);
    const tools = normalized.error ? normalizeToolManagement([]).tools : normalized.tools;
    const setting = tools.find((tool) => tool.id === managedTool.id);
    if (setting && setting.enabled === false) return sendToolDisabledPage(res, managedTool, setting.disabledMessage);
    if (setting && (setting.adminOnly === true || (Array.isArray(setting.allowedLoginIds) && setting.allowedLoginIds.length))) {
      const user = await currentUserFromRequest(req);
      if (!isToolAllowedForUser(setting, user)) return sendToolRestrictedPage(res, managedTool, setting);
    }
    return next();
  } catch (err) {
    console.warn('tool availability check skipped:', err.message);
    return next();
  }
});

if (GIFTCODE_UI_MODE !== 'live') {
  app.get(['/giftcode', '/giftcode/'], (_req, res) => {
    res.redirect(302, '/');
  });
}

mountGiftcodeProxy(app);
app.use(express.json({ limit: '8mb' }));
app.use(async (req, res, next) => {
  try {
    if (req.method !== 'GET') return next();
    const filePath = resolvePublicHtmlPath(path.join(__dirname, 'public'), req.path);
    if (!filePath || !fs.existsSync(filePath)) return next();
    let post = null;
    if (req.path === '/function/forum-post.html' && req.query.id) {
      try { post = await queryOne('SELECT title,contentText,contentHtml,coverImage FROM forum_posts WHERE id = ? LIMIT 1', [Number(req.query.id)]); } catch (_) {}
    }
    const origin = PUBLIC_SITE_ORIGIN;
    const meta = resolvePageMeta(req.path, post, origin);
    const html = await fs.promises.readFile(filePath, 'utf8');
    res.setHeader('Cache-Control', 'no-store');
    if (req.path === '/function/forum-post.html') {
      res.setHeader('CDN-Cache-Control', 'no-store');
      res.setHeader('Surrogate-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    return res.type('html').send(injectShareMeta(html, meta, `${origin}${req.originalUrl}`));
  } catch (err) {
    console.warn('share metadata injection skipped:', err.message);
    return next();
  }
});
app.use(
  '/function/aeroplane-chess',
  express.static(path.join(__dirname, 'aeroplane-chess', 'frontend', 'public'))
);
app.use(
  '/function/aeroplane-chess',
  express.static(path.join(__dirname, 'aeroplane-chess', 'frontend'))
);
app.get('/map-tool', (_req, res) => {
  res.redirect(302, '/map-tool/');
});
app.use('/map-tool', express.static(path.join(__dirname, 'public', 'map-tool')));
app.use(express.static(path.join(__dirname, 'public')));
app.get(
  ['/legal/about', '/legal/about.html', '/legal/privacy', '/legal/privacy.html', '/legal/user-agreement', '/legal/user-agreement.html'],
  async (req, res, next) => {
    try {
      const stored = await getSetting(LEGAL_DOCS_SETTING_KEY, null);
      if (!stored || !stored.publishedAt) return next();
      const docId = docIdFromRequestPath(req.path);
      if (!docId) return next();
      const docs = normalizeLegalDocs(stored, loadDefaultsFromLegalDir(LEGAL_DIR));
      return res.type('html').send(renderLegalPageHtml(docId, docs));
    } catch (_err) {
      return next();
    }
  }
);
app.get(
  ['/legal/tool-access-agreement', '/legal/tool-access-agreement.html'],
  async (req, res, next) => {
    try {
      const stored = await getSetting(TOOL_ACCESS_AGREEMENT_SETTING_KEY, null);
      if (!stored || !stored.publishedAt) return next();
      const doc = normalizeToolAccessAgreement(stored, loadToolAccessAgreementDefault(LEGAL_DIR));
      return res.type('html').send(renderToolAccessAgreementHtml(doc));
    } catch (_err) {
      return next();
    }
  }
);
app.use('/legal', express.static(path.join(__dirname, 'legal'), { extensions: ['html'] }));

const aeroplaneChessPollingService = mountAeroplaneChessPollingRoutes(app, {
  recordHistory: async (entry) => {
    try {
      await execute(
        `
        INSERT INTO aeroplane_chess_match_history
          (room_code, game_session_id, winner_player, rankings_json, players_json, ended_at)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          entry.roomCode || '',
          entry.gameSessionId || '',
          entry.winnerPlayer == null ? null : Number(entry.winnerPlayer),
          JSON.stringify(entry.rankings || null),
          JSON.stringify(entry.players || []),
          new Date(entry.endedAt || Date.now())
        ]
      );
    } catch (err) {
      console.warn('Aeroplane chess history write failed:', err.message);
    }
  }
});

// 避免中间层/浏览器把“带登录态”的 API 响应缓存，导致不同用户看到同一份响应（典型表现：打开网站像是登录了别人）。
// 如需对个别公共接口做缓存，应该在对应 handler 里显式覆盖 Cache-Control。
app.use('/api', (req, res, next) => {
  if (req.path === '/image/thumb') return next();
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Cookie');
  next();
});

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseJsonMaybe(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch (_err) {
    return fallback;
  }
}

function sanitizeAnnouncementHtml(inputHtml) {
  const raw = String(inputHtml || '').trim();
  if (!raw) return '';
  if (!sanitizeHtml) {
    // 降级策略：没有 sanitize-html 依赖时，只允许纯文本
    return escapeHtml(raw).replace(/\n/g, '<br>');
  }
  return sanitizeHtml(raw, {
    allowedTags: [
      'b', 'strong', 'i', 'em', 'u', 's',
      'br', 'p', 'div', 'span',
      'ul', 'ol', 'li',
      'h1', 'h2', 'h3',
      'a', 'img'
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'title'],
      span: ['style'],
      p: ['style'],
      div: ['style']
    },
    allowedStyles: {
      '*': {
        'color': [
          /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/,
          /^rgb\(\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*\)$/,
          /^rgba\(\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:0|1|0?\.\d+)\s*\)$/
        ],
        'font-size': [/^\d+(px|rem|em|%)$/],
        'font-weight': [/^(normal|bold|[1-9]00)$/],
        'text-decoration': [/^(none|underline|line-through)$/],
        'text-align': [/^(left|right|center|justify)$/]
      }
    },
    transformTags: {
      a: (tagName, attribs) => {
        const href = String(attribs.href || '').trim();
        // 只允许 http(s) 或站内相对链接
        const safeHref = (!href || href.startsWith('/') || /^https?:\/\//i.test(href)) ? href : '';
        return {
          tagName,
          attribs: {
            href: safeHref,
            target: '_blank',
            rel: 'noopener noreferrer'
          }
        };
      },
      img: (tagName, attribs) => {
        const src = String(attribs.src || '').trim();
        // 只允许站内 uploads 或 data:image
        const safeSrc = (src.startsWith('/uploads/') || /^data:image\//i.test(src)) ? src : '';
        return { tagName, attribs: { src: safeSrc, alt: String(attribs.alt || '') } };
      }
    },
    disallowedTagsMode: 'discard'
  });
}

const HOME_LEAD_SETTING_KEY = 'home_lead_carousel';
const PUBLISHER_ADS_SETTING_KEY = 'publisher_ads';

function isSafeSitePath(urlPath) {
  const p = String(urlPath || '').trim();
  if (!p.startsWith('/')) return false;
  return !p.split('/').some((seg) => seg === '..');
}

function isAllowedHomeLeadImageUrl(url) {
  const s = String(url || '').trim();
  if (!s || s.length > 2048) return false;
  if (s.startsWith('/')) {
    if (!isSafeSitePath(s)) return false;
    if (s.startsWith('/uploads/')) return true;
    if (s.startsWith('/public/wjdr-home/')) return true;
    if (s.startsWith('/public/')) return true;
    return false;
  }
  if (/^https?:\/\//i.test(s)) return true;
  return false;
}

function isAllowedHomeLeadHref(href) {
  const s = String(href || '').trim();
  if (!s || s.length > 2048) return false;
  if (/^javascript:/i.test(s) || /^data:/i.test(s)) return false;
  if (s.startsWith('/')) return isSafeSitePath(s);
  if (/^https?:\/\//i.test(s)) return true;
  return false;
}

function sanitizeHomeLeadDetailHtml(inputHtml) {
  const raw = String(inputHtml || '').trim();
  if (!raw) return '';
  if (!sanitizeHtml) {
    return escapeHtml(raw).replace(/\n/g, '<br>');
  }
  return sanitizeHtml(raw, {
    allowedTags: [
      'b', 'strong', 'i', 'em', 'u', 's',
      'br', 'p', 'div', 'span',
      'ul', 'ol', 'li',
      'h1', 'h2', 'h3',
      'a', 'img'
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'title'],
      span: ['style'],
      p: ['style'],
      div: ['style']
    },
    allowedStyles: {
      '*': {
        color: [/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/],
        'font-size': [/^\d+(px|rem|em|%)$/],
        'font-weight': [/^(normal|bold|[1-9]00)$/],
        'text-decoration': [/^(none|underline|line-through)$/],
        'text-align': [/^(left|right|center|justify)$/]
      }
    },
    transformTags: {
      a: (tagName, attribs) => {
        const href = String(attribs.href || '').trim();
        const safeHref = (!href || href.startsWith('/') || /^https?:\/\//i.test(href)) ? href : '';
        return {
          tagName,
          attribs: {
            href: safeHref,
            target: '_blank',
            rel: 'noopener noreferrer'
          }
        };
      },
      img: (tagName, attribs) => {
        const src = String(attribs.src || '').trim();
        let safeSrc = '';
        if (/^data:image\//i.test(src)) safeSrc = src;
        else if (src.startsWith('/uploads/') || src.startsWith('/public/wjdr-home/') || src.startsWith('/public/')) {
          safeSrc = isSafeSitePath(src) ? src : '';
        }
        return { tagName, attribs: { src: safeSrc, alt: String(attribs.alt || '') } };
      }
    },
    disallowedTagsMode: 'discard'
  });
}

function sanitizeForumPostHtml(inputHtml) {
  const raw = String(inputHtml || '').trim();
  if (!raw) return '';
  if (!sanitizeHtml) {
    return escapeHtml(raw).replace(/\n/g, '<br>');
  }
  return sanitizeHtml(raw, {
    allowedTags: [
      'b', 'strong', 'i', 'em', 'u', 's',
      'br', 'p', 'div', 'span',
      'ul', 'ol', 'li',
      'blockquote', 'pre', 'code',
      'h1', 'h2', 'h3', 'h4',
      'a', 'img'
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      span: ['style'],
      p: ['style'],
      div: ['style']
    },
    allowedStyles: {
      '*': {
        color: [/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/],
        'font-size': [/^\d+(px|rem|em|%)$/],
        'font-weight': [/^(normal|bold|[1-9]00)$/],
        'text-decoration': [/^(none|underline|line-through)$/],
        'text-align': [/^(left|right|center|justify)$/]
      }
    },
    transformTags: {
      a: (tagName, attribs) => {
        const href = String(attribs.href || '').trim();
        const safeHref = (!href || href.startsWith('/') || /^https?:\/\//i.test(href)) ? href : '';
        return {
          tagName,
          attribs: {
            href: safeHref,
            title: String(attribs.title || ''),
            target: '_blank',
            rel: 'noopener noreferrer'
          }
        };
      },
      img: (tagName, attribs) => {
        const src = String(attribs.src || '').trim();
        const safeSrc = (src.startsWith('/uploads/') || src.startsWith('/api/image/thumb') || /^https?:\/\//i.test(src)) ? src : '';
        return {
          tagName,
          attribs: {
            src: safeSrc,
            alt: String(attribs.alt || ''),
            title: String(attribs.title || '')
          }
        };
      }
    },
    disallowedTagsMode: 'discard'
  }).trim();
}

function defaultHomeLeadCarousel() {
  return {
    intervalMs: 6000,
    clickEnabled: true,
    enabled: true,
    slides: [
      {
        id: 'default',
        imageUrl: '/public/wjdr-home/2213301_47_5895.jpg',
        alt: '活动说明图示',
        href: '/public/wjdr-home/board',
        detailTitle: '',
        detailHtml: ''
      }
    ]
  };
}

function normalizeHomeLeadCarousel(input) {
  const base = defaultHomeLeadCarousel();
  if (!input || typeof input !== 'object') return base;
  const clickEnabled = input.clickEnabled !== false;
  const enabled = input.enabled !== false;
  let intervalMs = Number(input.intervalMs);
  if (!Number.isFinite(intervalMs)) intervalMs = base.intervalMs;
  intervalMs = Math.max(3000, Math.min(30000, Math.floor(intervalMs)));
  let slidesIn = Array.isArray(input.slides) ? input.slides : [];
  slidesIn = slidesIn.slice(0, 10);
  const slides = [];
  for (const raw of slidesIn) {
    if (!raw || typeof raw !== 'object') continue;
    const imageUrl = String(raw.imageUrl || '').trim();
    const href = String(raw.href || '').trim();
    if (!isAllowedHomeLeadImageUrl(imageUrl) || !isAllowedHomeLeadHref(href)) continue;
    let id = String(raw.id || '').trim();
    if (!id || id.length > 64) id = `hl_${Date.now()}_${crypto.randomInt(1000, 9999)}`;
    const alt = String(raw.alt || '').trim().slice(0, 120);
    const detailTitle = String(raw.detailTitle || '').trim().slice(0, 120);
    let detailHtml = sanitizeHomeLeadDetailHtml(String(raw.detailHtml || ''));
    if (detailHtml.length > 12000) detailHtml = detailHtml.slice(0, 12000);
    slides.push({
      id,
      imageUrl,
      alt: alt || '活动图示',
      href,
      detailTitle,
      detailHtml
    });
  }
  if (!slides.length) return { ...base, clickEnabled, enabled };
  return { intervalMs, clickEnabled, enabled, slides };
}

function defaultPublisherAds() {
  return { homeAdEnabled: true, forumAdEnabled: true, toolAdEnabled: true, rangeAdEnabled: true };
}

function normalizePublisherAds(input) {
  if (!input || typeof input !== 'object') return defaultPublisherAds();
  const hasHome = Object.prototype.hasOwnProperty.call(input, 'homeAdEnabled');
  const hasForum = Object.prototype.hasOwnProperty.call(input, 'forumAdEnabled');
  const hasTool = Object.prototype.hasOwnProperty.call(input, 'toolAdEnabled')
    || Object.prototype.hasOwnProperty.call(input, 'rangeAdEnabled');
  const legacyOn = input.adEnabled !== false;
  const toolOn = Object.prototype.hasOwnProperty.call(input, 'toolAdEnabled')
    ? input.toolAdEnabled !== false
    : Object.prototype.hasOwnProperty.call(input, 'rangeAdEnabled')
      ? input.rangeAdEnabled !== false
      : true;
  return {
    homeAdEnabled: hasHome ? input.homeAdEnabled !== false : legacyOn,
    forumAdEnabled: hasForum ? input.forumAdEnabled !== false : legacyOn,
    toolAdEnabled: hasTool ? toolOn : true,
    rangeAdEnabled: hasTool ? toolOn : true
  };
}

async function getPublisherAds() {
  const stored = await getSetting(PUBLISHER_ADS_SETTING_KEY, null);
  if (stored && typeof stored === 'object') return normalizePublisherAds(stored);
  const lead = await getSetting(HOME_LEAD_SETTING_KEY, null);
  if (lead && typeof lead === 'object' && Object.prototype.hasOwnProperty.call(lead, 'adEnabled')) {
    return normalizePublisherAds({ adEnabled: lead.adEnabled });
  }
  return defaultPublisherAds();
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/image/thumb', async (req, res) => {
  try {
    if (!sharp) return res.status(501).json({ error: 'THUMB_NOT_AVAILABLE' });
    // 默认不缓存，成功返回图片时再覆盖为可缓存
    res.setHeader('Cache-Control', 'no-store');
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) return res.status(400).json({ error: 'BAD_URL' });
    const widthRaw = Number(req.query.w || 360);
    const qualityRaw = Number(req.query.q || 50);
    const width = Math.max(120, Math.min(1200, Number.isFinite(widthRaw) ? Math.floor(widthRaw) : 360));
    const quality = Math.max(30, Math.min(85, Number.isFinite(qualityRaw) ? Math.floor(qualityRaw) : 50));

    // SSRF 防护：只允许本站 /uploads 下的图片
    const base = `${req.protocol}://${req.get('host') || 'localhost'}`;
    let u = null;
    try { u = new URL(rawUrl, base); } catch (_e) { return res.status(400).json({ error: 'BAD_URL' }); }
    if (u.origin !== new URL(base).origin) return res.status(403).json({ error: 'FORBIDDEN_URL' });
    if (!u.pathname.startsWith('/uploads/')) return res.status(403).json({ error: 'FORBIDDEN_PATH' });

    // Windows 下如果 join 的后段以 "\" 开头会被当成“绝对路径”，需要去掉开头的 "/"
    const relPath = u.pathname.replace(/^\/+/, '').replace(/\//g, path.sep);
    const normalized = path.normalize(relPath);
    const sourcePath = path.join(__dirname, normalized);
    // 防止目录穿越：必须落在站点根目录内
    if (!sourcePath.startsWith(__dirname)) return res.status(403).json({ error: 'FORBIDDEN_PATH' });
    const ext = path.extname(sourcePath).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return res.status(400).json({ error: 'BAD_TYPE' });

    const accept = String(req.headers.accept || '');
    const fmt = accept.includes('image/webp') ? 'webp' : 'jpeg';

    const cacheDir = path.join(__dirname, 'cache', 'thumbs');
    await fs.promises.mkdir(cacheDir, { recursive: true });
    const key = crypto.createHash('sha1').update(`${u.pathname}|w=${width}|q=${quality}|fmt=${fmt}`).digest('hex');
    const outFile = path.join(cacheDir, `${key}.${fmt === 'webp' ? 'webp' : 'jpg'}`);

    try {
      const stat = await fs.promises.stat(outFile);
      if (stat && stat.isFile()) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Vary', 'Accept');
        res.type(fmt === 'webp' ? 'image/webp' : 'image/jpeg');
        return fs.createReadStream(outFile).pipe(res);
      }
    } catch (_e) {}

    let buf = null;
    try {
      buf = await fs.promises.readFile(sourcePath);
    } catch (_e) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    const pipeline = sharp(buf).resize({ width, withoutEnlargement: true });
    const outBuf = fmt === 'webp'
      ? await pipeline.webp({ quality })
      : await pipeline.jpeg({ quality, mozjpeg: true });

    await fs.promises.writeFile(outFile, outBuf);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Vary', 'Accept');
    res.type(fmt === 'webp' ? 'image/webp' : 'image/jpeg');
    return res.end(outBuf);
  } catch (err) {
    console.error('thumb get failed:', err);
    // 错误响应严禁缓存（否则会把 500 缓存 1 天）
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

function resolveUploadImagePathFromRequest(req, rawUrl) {
  const urlText = String(rawUrl || '').trim();
  if (!urlText) return { error: 'BAD_URL' };
  const base = `${req.protocol}://${req.get('host') || 'localhost'}`;
  let u = null;
  try { u = new URL(urlText, base); } catch (_e) { return { error: 'BAD_URL' }; }
  if (u.origin !== new URL(base).origin) return { error: 'FORBIDDEN_URL' };
  if (!u.pathname.startsWith('/uploads/')) return { error: 'FORBIDDEN_PATH' };
  const relPath = u.pathname.replace(/^\/+/, '').replace(/\//g, path.sep);
  const normalized = path.normalize(relPath);
  const sourcePath = path.join(__dirname, normalized);
  if (!sourcePath.startsWith(__dirname)) return { error: 'FORBIDDEN_PATH' };
  const ext = path.extname(sourcePath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return { error: 'BAD_TYPE' };
  return { pathname: u.pathname, sourcePath };
}

app.get('/api/image/meta', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    const resolved = resolveUploadImagePathFromRequest(req, req.query.url);
    if (resolved.error) return res.status(resolved.error === 'BAD_URL' || resolved.error === 'BAD_TYPE' ? 400 : 403).json({ error: resolved.error });
    let stat = null;
    try {
      stat = await fs.promises.stat(resolved.sourcePath);
    } catch (_e) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    if (!stat || !stat.isFile()) return res.status(404).json({ error: 'NOT_FOUND' });
    return res.json({
      url: resolved.pathname,
      size: Math.max(0, Number(stat.size || 0))
    });
  } catch (err) {
    console.error('image meta get failed:', err);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

function parseCookies(header) {
  const result = {};
  if (!header) return result;
  String(header).split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx <= 0) return;
    result[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return result;
}

function getSessionToken(req) {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME] || '';
}

function getClientIp(req) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req?.socket?.remoteAddress || '');
}

function hashAnalyticsValue(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return crypto.createHash('sha256').update(text).digest('hex');
}

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function sessionExpiryDate(expiresAt) {
  return new Date(Number(expiresAt));
}

function parseSessionExpiry(value) {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

async function persistNewSession(token, userId, expiresAt) {
  await execute(
    'INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
    [hashSessionToken(token), Number(userId), sessionExpiryDate(expiresAt)],
  );
}

async function persistSessionExpiry(token, expiresAt) {
  await execute(
    'UPDATE auth_sessions SET expires_at = ? WHERE token_hash = ?',
    [sessionExpiryDate(expiresAt), hashSessionToken(token)],
  );
}

async function deletePersistedSession(token) {
  if (!token) return;
  await execute('DELETE FROM auth_sessions WHERE token_hash = ?', [hashSessionToken(token)]);
}

async function loadPersistedSession(token) {
  const row = await queryOne(
    'SELECT user_id, expires_at FROM auth_sessions WHERE token_hash = ? LIMIT 1',
    [hashSessionToken(token)],
  );
  if (!row) return null;
  return {
    userId: Number(row.user_id),
    expiresAt: parseSessionExpiry(row.expires_at),
    persistedExpiresAt: parseSessionExpiry(row.expires_at),
  };
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const sess = { userId: Number(userId), expiresAt, persistedExpiresAt: expiresAt };
  await persistNewSession(token, sess.userId, expiresAt);
  sessions.set(token, sess);
  return token;
}

async function deleteSessionFromRequest(req) {
  const token = getSessionToken(req);
  if (!token) return;
  sessions.delete(token);
  await deletePersistedSession(token);
}

async function deleteSessionsByUserId(userId) {
  const id = Number(userId);
  for (const [token, sess] of sessions.entries()) {
    if (Number(sess?.userId) === id) sessions.delete(token);
  }
  await execute('DELETE FROM auth_sessions WHERE user_id = ?', [id]);
}

setInterval(() => {
  const now = Date.now();
  for (const [token, sess] of sessions.entries()) {
    if (!sess || sess.expiresAt <= now) sessions.delete(token);
  }
  execute('DELETE FROM auth_sessions WHERE expires_at <= ?', [new Date()]).catch((err) => {
    console.warn('auth session cleanup skipped:', err.message);
  });
}, 60 * 60 * 1000).unref();

function isModerator(user) {
  return !!(user && (Number(user.is_admin) === 1 || Number(user.forum_publisher) === 1));
}

function isDefaultAdminLogin(loginId) {
  return String(loginId || '') === String(DEFAULT_ADMIN_LOGIN_ID);
}

function countChars(str) {
  return Array.from(String(str || '')).length;
}

function isValidDisplayName(name) {
  const value = String(name || '');
  if (!value || value.trim() !== value) return false;
  const len = countChars(value);
  if (len < 2 || len > 15) return false;
  try {
    return /^[\p{L}\p{N}_]+$/u.test(value);
  } catch (_e) {
    return /^[A-Za-z0-9_\u4e00-\u9fa5]+$/.test(value);
  }
}

function getLoginIdFromPayload(payload) {
  return String(payload?.loginId || payload?.username || '').trim();
}

function getRegisterMode(payload) {
  return payload?.loginId ? 'strong' : 'legacy';
}

function isValidStrongLoginId(loginId) {
  return /^[A-Za-z0-9_]{8,18}$/.test(String(loginId || ''));
}

function isValidLegacyLoginId(loginId) {
  return /^[A-Za-z0-9_]{3,32}$/.test(String(loginId || ''));
}

function getPasswordRuleError(password, mode) {
  const v = String(password || '');
  if (mode === 'legacy') return (v.length >= 6 && v.length <= 64) ? null : 'PASSWORD_RULE';
  if (v.length < 8 || v.length > 18) return 'PASSWORD_RULE';
  if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) return 'PASSWORD_RULE';
  if (WEAK_PASSWORDS.has(v.toLowerCase())) return 'PASSWORD_WEAK';
  return null;
}

function normalizeMembershipStatus(value) {
  const status = String(value || '').trim();
  return MEMBERSHIP_STATUSES.has(status) ? status : 'none';
}

function hasVipMembership(status, expiresAt) {
  const membershipStatus = normalizeMembershipStatus(status);
  if (membershipStatus === 'lifetime') return true;
  if (membershipStatus !== 'active') return false;
  if (!expiresAt) return true;
  const ts = new Date(expiresAt).getTime();
  if (!Number.isFinite(ts)) return true;
  return ts > Date.now();
}

function normalizeHexColor(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const m = text.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return null;
  let hex = m[1].toLowerCase();
  if (hex.length === 3) hex = `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  return `#${hex}`;
}

function normalizeUserTitleText(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (!text) return '';
  if (countChars(text) > USER_TITLE_MAX_CHARS) return null;
  return text;
}

function normalizeProfileBio(value) {
  if (value === null || value === undefined) return DEFAULT_PROFILE_BIO;
  const text = String(value).trim();
  if (!text) return DEFAULT_PROFILE_BIO;
  if (countChars(text) > PROFILE_BIO_MAX_CHARS) return null;
  return text;
}

function hashPassword(password, saltHex) {
  const salt = saltHex || crypto.randomBytes(8).toString('hex');
  const hash = crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
  return `sha256$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  const parts = String(storedHash || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'sha256') return false;
  const expected = hashPassword(password, parts[1]);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(storedHash));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function safeJsonParse(value, fallback) {
  try { return JSON.parse(value); } catch (_e) { return fallback; }
}

function parseCoverImage(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .filter(Boolean)
      .map(String)
      .filter((v) => (v.startsWith('/') || /^https?:\/\//i.test(v)) && v.length <= 2048);
  }
  const text = String(value).trim();
  if (!text) return [];
  // 忽略内联 data:image/base64 或异常超长字符串，避免缓存和数据库里存放超长路径
  if (/^data:image\//i.test(text) || text.length > 2048) return [];
  if (text.startsWith('[')) {
    const arr = safeJsonParse(text, []);
    if (Array.isArray(arr)) {
      return arr
        .filter(Boolean)
        .map(String)
        .filter((v) => (v.startsWith('/') || /^https?:\/\//i.test(v)) && v.length <= 2048);
    }
  }
  if (!(text.startsWith('/') || /^https?:\/\//i.test(text))) return [];
  return [text];
}

function toPlainSummary(post) {
  if (post?.contentText) return String(post.contentText).slice(0, 120);
  return String(post?.contentHtml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function firstDayOfNextMonthIso(nowTs) {
  const d = new Date(nowTs || Date.now());
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0)).toISOString();
}

function formatSqlDateTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function formatDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const pad = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  const text = String(value).trim();
  if (!text) return null;
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function normalizeGenderValue(value) {
  const v = String(value || '').trim().toLowerCase();
  return GENDER_VALUES.has(v) ? v : 'unknown';
}

function parseBirthdayInput(value) {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  const text = String(value).trim();
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { ok: false, error: 'BAD_BIRTHDAY' };
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return { ok: false, error: 'BAD_BIRTHDAY' };
  if (year < 1900 || year > 2100) return { ok: false, error: 'BAD_BIRTHDAY' };
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() + 1 !== month ||
    d.getUTCDate() !== day
  ) {
    return { ok: false, error: 'BAD_BIRTHDAY' };
  }
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (d.getTime() > todayUtc) return { ok: false, error: 'BAD_BIRTHDAY' };
  return { ok: true, value: `${m[1]}-${m[2]}-${m[3]}` };
}

function parseDataUrlSize(dataUrl) {
  const m = String(dataUrl || '').match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=\r\n]+)$/i);
  if (!m) return { ok: false, bytes: 0 };
  const b64 = m[2].replace(/\s+/g, '');
  const pad = b64.endsWith('==') ? 2 : (b64.endsWith('=') ? 1 : 0);
  return { ok: true, bytes: Math.floor((b64.length * 3) / 4) - pad };
}

function decodeImageDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=\r\n]+)$/i);
  if (!m) return null;
  const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  const base64 = m[2].replace(/\s+/g, '');
  return {
    ext,
    buffer: Buffer.from(base64, 'base64')
  };
}

async function saveAvatarDataUrlToFile(userId, dataUrl) {
  const decoded = decodeImageDataUrl(dataUrl);
  if (!decoded || !decoded.buffer.length) throw new Error('BAD_IMAGE');
  await fs.promises.mkdir(AVATAR_UPLOAD_DIR, { recursive: true });
  const digest = crypto.createHash('sha1').update(decoded.buffer).digest('hex').slice(0, 16);
  const filename = `avatar_${Number(userId)}_${Date.now()}_${digest}.${decoded.ext}`;
  const absolutePath = path.join(AVATAR_UPLOAD_DIR, filename);
  await fs.promises.writeFile(absolutePath, decoded.buffer);
  return `${AVATAR_PUBLIC_PREFIX}${filename}`;
}

async function saveForumImageDataUrlToFile(ownerId, dataUrl) {
  const decoded = decodeImageDataUrl(dataUrl);
  if (!decoded || !decoded.buffer.length) throw new Error('BAD_IMAGE');
  await fs.promises.mkdir(FORUM_IMAGE_UPLOAD_DIR, { recursive: true });
  const digest = crypto.createHash('sha1').update(decoded.buffer).digest('hex').slice(0, 16);
  const filename = `forum_${Number(ownerId)}_${Date.now()}_${digest}.${decoded.ext}`;
  const absolutePath = path.join(FORUM_IMAGE_UPLOAD_DIR, filename);
  await fs.promises.writeFile(absolutePath, decoded.buffer);
  return `${FORUM_IMAGE_PUBLIC_PREFIX}${filename}`;
}

function parseCoverImageInput(value) {
  // 允许 data:image（用于发布时），但不要直接把 data:image 返回给前端列表/详情
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  const text = String(value).trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    const arr = safeJsonParse(text, []);
    if (Array.isArray(arr)) return arr.filter(Boolean).map(String);
  }
  return [text];
}

async function queryRows(sql, params) {
  if (pgDatabase) return pgDatabase.queryRows(sql, params || []);
  if (!db) throw new Error('MYSQL_DB_NOT_CONFIGURED');
  const [rows] = await db.query(sql, params || []);
  return rows;
}

async function queryOne(sql, params) {
  const rows = await queryRows(sql, params);
  return rows[0] || null;
}

async function execute(sql, params) {
  if (pgDatabase) return pgDatabase.execute(sql, params || []);
  if (!db) throw new Error('MYSQL_DB_NOT_CONFIGURED');
  const [ret] = await db.query(sql, params || []);
  return ret;
}

async function runInTransaction(work) {
  if (pgDatabase && typeof pgDatabase.runInTransaction === 'function') {
    return pgDatabase.runInTransaction(work);
  }
  if (!db) throw new Error('MYSQL_DB_NOT_CONFIGURED');
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const tx = {
      queryRows: async (sql, params) => {
        const [rows] = await conn.query(sql, params || []);
        return rows;
      },
      queryOne: async (sql, params) => {
        const [rows] = await conn.query(sql, params || []);
        return rows[0] || null;
      },
      execute: async (sql, params) => {
        const [ret] = await conn.query(sql, params || []);
        return ret;
      }
    };
    const result = await work(tx);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (_rollbackErr) {}
    throw err;
  } finally {
    conn.release();
  }
}

analyticsService = createAnalyticsService({ queryOne, queryRows, execute });
dashboardHandlers = createDashboardHandlers({
  getSummary: (query) => analyticsService.getSummary(query),
  getTrends: (query) => analyticsService.getTrends(query),
  getRankings: (query) => analyticsService.getRankings(query),
  getRealtime: (query) => analyticsService.getRealtime(query),
  trackPageView: (payload) => analyticsService.trackPageView(payload)
});
governanceService = createGovernanceService({
  queryOne,
  queryRows,
  execute,
  formatSqlDateTime,
  hashValue: hashAnalyticsValue
});

function toUserPayload(row) {
  if (!row) return null;
  const remaining = Number.isFinite(Number(row.username_change_remaining)) ? Math.max(0, Number(row.username_change_remaining)) : 2;
  const membershipStatus = normalizeMembershipStatus(row.membership_status);
  const membershipExpiresAt = row.membership_expires_at || null;
  const titleText = String(row.title_text || '').trim();
  const titleBgColor = normalizeHexColor(row.title_bg_color);
  const titleColor = normalizeHexColor(row.title_color);
  const bio = normalizeProfileBio(row.bio);
  return {
    id: Number(row.id),
    loginId: row.login_id,
    username: row.username || row.login_id,
    avatarUrl: normalizeAvatarUrl(row.avatar_url),
    avatarUpdatedAt: row.avatar_updated_at || null,
    avatarNextAt: row.avatar_next_at || null,
    membershipStatus,
    membershipExpiresAt,
    titleText,
    titleBgColor,
    titleColor,
    bio: bio || DEFAULT_PROFILE_BIO,
    isVip: hasVipMembership(membershipStatus, membershipExpiresAt),
    usernameChangeRemaining: remaining,
    usernameChangeNextAt: row.username_change_next_at || null,
    gender: normalizeGenderValue(row.gender),
    birthday: formatDateOnly(row.birthday),
    birthdayPublic: Number(row.birthday_public) === 1,
    isAdmin: Number(row.is_admin) === 1,
    forumPublisher: Number(row.forum_publisher) === 1,
    isBanned: Number(row.is_banned) === 1,
    mutedUntil: row.muted_until || null,
    points: Math.max(0, Number(row.points || 0)),
    createdAt: row.created_at || null
  };
}

function normalizeAvatarUrl(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  // 忽略内联 data:image/base64 等超长头像，只保留正常 http(s) 链接，避免接口返回巨大 base64 字符串
  if (/^data:image\//i.test(text) || text.length > 2048) return null;
  if (/^https?:\/\//i.test(text)) return text;
  // 允许站内相对路径（例如 /uploads/avatars/...），配合 IIS 直接静态返回
  if (text.startsWith('/')) return text;
  return null;
}

function toForumAuthor(row) {
  const membershipStatus = normalizeMembershipStatus(row.author_membership_status);
  const membershipExpiresAt = row.author_membership_expires_at || null;
  return {
    id: Number(row.author_id),
    loginId: row.author_login_id,
    username: row.author_username,
    avatarUrl: normalizeAvatarUrl(row.author_avatar_url),
    membershipStatus,
    membershipExpiresAt,
    titleText: String(row.author_title_text || '').trim(),
    titleBgColor: normalizeHexColor(row.author_title_bg_color),
    titleColor: normalizeHexColor(row.author_title_color),
    isVip: hasVipMembership(membershipStatus, membershipExpiresAt),
    isBanned: Number(row.author_is_banned) === 1,
    mutedUntil: row.author_muted_until || null
  };
}

function toForumPostDto(row, currentUserId) {
  const images = parseCoverImage(row.coverImage);
  const author = toForumAuthor(row);
  const uidSelf = currentUserId ? Number(currentUserId) : null;
  if (uidSelf) {
    author.iFollow = Number(row.authorIFollow ?? row.authorifollow ?? 0) > 0;
    author.isSelf = Number(uidSelf) === Number(author.id);
  } else {
    author.iFollow = false;
    author.isSelf = false;
  }
  return {
    id: Number(row.id),
    section: row.section,
    type: row.type || 'article',
    title: row.title || '',
    contentText: row.contentText || '',
    contentHtml: row.contentHtml || '',
    // 只暴露经过 parseCoverImage 过滤后的封面图，避免把超长 data:image/base64 直接返回给前端
    coverImage: images.length ? images[0] : null,
    coverImages: images,
    summary: toPlainSummary(row),
    status: row.status || 'approved',
    isPinned: Number(row.is_pinned) === 1,
    createdAt: row.created_at,
    author,
    viewCount: Number(row.viewCount || 0),
    likeCount: Number(row.likeCount || 0),
    favoriteCount: Number(row.favoriteCount || 0),
    commentCount: Number(row.commentCount || 0),
    likedByMe: currentUserId ? Number(row.likedByMe || 0) > 0 : false,
    favoritedByMe: currentUserId ? Number(row.favoritedByMe || 0) > 0 : false
  };
}

function toForumPostListDto(row, currentUserId) {
  const dto = toForumPostDto(row, currentUserId);
  // 列表接口无需返回完整内容，避免响应体过大导致加载缓慢
  dto.contentHtml = '';
  dto.contentText = '';
  return dto;
}

function toForumCommentDto(row) {
  const authorMembershipStatus = normalizeMembershipStatus(row.author_membership_status);
  const authorMembershipExpiresAt = row.author_membership_expires_at || null;
  const replyMembershipStatus = normalizeMembershipStatus(row.reply_author_membership_status);
  const replyMembershipExpiresAt = row.reply_author_membership_expires_at || null;
  return {
    id: Number(row.id),
    postId: Number(row.post_id),
    content: row.content,
    isPinned: Number(row.is_pinned) === 1,
    createdAt: row.created_at,
    replyToCommentId: row.reply_to_comment_id ? Number(row.reply_to_comment_id) : null,
    author: {
      id: Number(row.author_id),
      loginId: row.author_login_id,
      username: row.author_username,
      avatarUrl: row.author_avatar_url || null,
      membershipStatus: authorMembershipStatus,
      membershipExpiresAt: authorMembershipExpiresAt,
      titleText: String(row.author_title_text || '').trim(),
      titleBgColor: normalizeHexColor(row.author_title_bg_color),
      titleColor: normalizeHexColor(row.author_title_color),
      isVip: hasVipMembership(authorMembershipStatus, authorMembershipExpiresAt),
      isBanned: Number(row.author_is_banned) === 1,
      mutedUntil: row.author_muted_until || null
    },
    replyTo: row.reply_to_comment_id
      ? {
          id: Number(row.reply_to_comment_id),
          author: {
            id: row.reply_author_id ? Number(row.reply_author_id) : null,
            loginId: row.reply_author_login_id || null,
            username: row.reply_author_username || null,
            avatarUrl: row.reply_author_avatar_url || null,
            membershipStatus: replyMembershipStatus,
            membershipExpiresAt: replyMembershipExpiresAt,
            titleText: String(row.reply_author_title_text || '').trim(),
            titleBgColor: normalizeHexColor(row.reply_author_title_bg_color),
            titleColor: normalizeHexColor(row.reply_author_title_color),
            isVip: hasVipMembership(replyMembershipStatus, replyMembershipExpiresAt)
          }
        }
      : null
  };
}

function toChatMessageDto(row, currentUserId) {
  const senderId = Number(row.sender_id);
  const receiverId = Number(row.receiver_id);
  const me = Number.isFinite(Number(currentUserId)) ? Number(currentUserId) : 0;
  return {
    id: Number(row.id),
    senderId,
    receiverId,
    content: String(row.content || ''),
    createdAt: row.created_at,
    isMine: me > 0 && senderId === me
  };
}

function toPublicUserProfile(row, currentUserId) {
  if (!row) return null;
  const profileId = Number(row.id);
  const viewerId = Number.isFinite(Number(currentUserId)) ? Number(currentUserId) : 0;
  const isSelf = viewerId > 0 && viewerId === profileId;
  const birthdayPublic = Number(row.birthday_public) === 1;
  const birthday = (isSelf || birthdayPublic) ? formatDateOnly(row.birthday) : null;
  const iFollow = Number(row.iFollow || 0) > 0;
  const followsMe = Number(row.followsMe || 0) > 0;
  const membershipStatus = normalizeMembershipStatus(row.membership_status);
  const membershipExpiresAt = row.membership_expires_at || null;
  const bio = normalizeProfileBio(row.bio);
  return {
    id: profileId,
    loginId: row.login_id,
    username: row.username || row.login_id,
    avatarUrl: row.avatar_url || null,
    membershipStatus,
    membershipExpiresAt,
    titleText: String(row.title_text || '').trim(),
    titleBgColor: normalizeHexColor(row.title_bg_color),
    titleColor: normalizeHexColor(row.title_color),
    bio: bio || DEFAULT_PROFILE_BIO,
    isVip: hasVipMembership(membershipStatus, membershipExpiresAt),
    gender: normalizeGenderValue(row.gender),
    birthday,
    birthdayPublic,
    createdAt: row.created_at || null,
    followingCount: Number(row.followingCount || 0),
    followerCount: Number(row.followerCount || 0),
    iFollow,
    followsMe,
    mutualFollow: iFollow && followsMe,
    isSelf
  };
}

async function getFollowCounts(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) {
    return { followingCount: 0, followerCount: 0 };
  }
  const row = await queryOne(
    `
    SELECT
      (SELECT COUNT(*) FROM user_follows f WHERE f.follower_id = ?) AS followingCount,
      (SELECT COUNT(*) FROM user_follows f WHERE f.following_id = ?) AS followerCount
    `,
    [uid, uid]
  );
  return {
    followingCount: Number(row?.followingCount || 0),
    followerCount: Number(row?.followerCount || 0)
  };
}

async function getFollowRelation(viewerId, targetId) {
  const v = Number(viewerId);
  const t = Number(targetId);
  if (!Number.isFinite(v) || !Number.isFinite(t) || v <= 0 || t <= 0) {
    return { iFollow: false, followsMe: false, mutualFollow: false };
  }
  const row = await queryOne(
    `
    SELECT
      (SELECT COUNT(*) FROM user_follows f WHERE f.follower_id = ? AND f.following_id = ?) AS iFollow,
      (SELECT COUNT(*) FROM user_follows f WHERE f.follower_id = ? AND f.following_id = ?) AS followsMe
    `,
    [v, t, t, v]
  );
  const iFollow = Number(row?.iFollow || 0) > 0;
  const followsMe = Number(row?.followsMe || 0) > 0;
  return { iFollow, followsMe, mutualFollow: iFollow && followsMe };
}

async function attachFollowCountsToUserPayload(userPayload) {
  if (!userPayload || !Number.isFinite(Number(userPayload.id))) return userPayload || null;
  const counts = await getFollowCounts(userPayload.id);
  return { ...userPayload, ...counts };
}

async function getUserPublicProfileById(targetUserId, currentUserId) {
  const targetId = Number(targetUserId);
  if (!Number.isFinite(targetId) || targetId <= 0) return null;
  const viewerId = Number.isFinite(Number(currentUserId)) ? Number(currentUserId) : 0;
  const row = await queryOne(
    `
    SELECT
      u.id,u.login_id,u.username,u.avatar_url,u.membership_status,u.membership_expires_at,u.title_text,u.title_bg_color,u.title_color,u.bio,u.gender,u.birthday,u.birthday_public,u.created_at,
      (SELECT COUNT(*) FROM user_follows f WHERE f.follower_id = u.id) AS followingCount,
      (SELECT COUNT(*) FROM user_follows f WHERE f.following_id = u.id) AS followerCount,
      (SELECT COUNT(*) FROM user_follows f WHERE f.follower_id = ? AND f.following_id = u.id) AS iFollow,
      (SELECT COUNT(*) FROM user_follows f WHERE f.follower_id = u.id AND f.following_id = ?) AS followsMe
    FROM users u
    WHERE u.id = ?
    LIMIT 1
    `,
    [viewerId, viewerId, targetId]
  );
  return toPublicUserProfile(row, viewerId);
}

async function hasColumn(tableName, columnName) {
  const table = String(tableName || '').trim();
  const column = String(columnName || '').trim();
  if (!table || !column) return false;
  if (pgDatabase) {
    const row = await queryOne(
      `
      SELECT 1 AS ok
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND lower(table_name) = lower(?)
        AND lower(column_name) = lower(?)
      LIMIT 1
      `,
      [table, column]
    );
    return !!row;
  }
  const row = await queryOne(
    `
    SELECT 1 AS ok
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
    LIMIT 1
    `,
    [table, column]
  );
  return !!row;
}

async function addColumnIfMissing(tableName, columnName, ddl) {
  if (await hasColumn(tableName, columnName)) return;
  if (pgDatabase) {
    await execute(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${ddl}`);
    return;
  }
  await execute(`ALTER TABLE \`${tableName}\` ADD COLUMN ${ddl}`);
}

async function getSetting(key, fallback) {
  const row = pgDatabase
    ? await queryOne('SELECT value FROM site_settings WHERE key = ? LIMIT 1', [key])
    : await queryOne('SELECT value FROM site_settings WHERE `key` = ? LIMIT 1', [key]);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch (_e) { return fallback; }
}

async function setSetting(key, value) {
  const json = JSON.stringify(value);
  if (pgDatabase) {
    await execute(
      `
      INSERT INTO site_settings (key, value)
      VALUES (?, ?)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `,
      [key, json]
    );
    return;
  }
  await execute(
    `
    INSERT INTO site_settings (\`key\`, value)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE value = VALUES(value)
    `,
    [key, json]
  );
}

async function getForumAutoApprove() {
  const value = await getSetting('forum_auto_approve', { autoApprove: true });
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'autoApprove')) {
    return !!value.autoApprove;
  }
  return !!value;
}

async function setForumAutoApprove(autoApprove) {
  await setSetting('forum_auto_approve', { autoApprove: !!autoApprove });
}

function normalizeSiteFooterCredits(payload) {
  const raw = typeof payload === 'string' ? payload : payload?.credits;
  const credits = String(raw == null ? DEFAULT_SITE_FOOTER_CREDITS : raw)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!credits) return { error: 'EMPTY_CREDITS' };
  if (credits.length > 2000) return { error: 'CREDITS_TOO_LONG' };
  return { credits };
}

async function getSiteFooterSetting() {
  const fallback = { credits: DEFAULT_SITE_FOOTER_CREDITS, updatedAt: null, updatedBy: null };
  const value = await getSetting(SITE_FOOTER_SETTING_KEY, fallback);
  const normalized = normalizeSiteFooterCredits(value);
  return {
    credits: normalized.error ? DEFAULT_SITE_FOOTER_CREDITS : normalized.credits,
    updatedAt: value && value.updatedAt ? value.updatedAt : null,
    updatedBy: value && value.updatedBy ? value.updatedBy : null
  };
}

async function getLegalDocsState() {
  const defaults = loadDefaultsFromLegalDir(LEGAL_DIR);
  const stored = await getSetting(LEGAL_DOCS_SETTING_KEY, null);
  return normalizeLegalDocs(stored, defaults);
}

async function getToolAccessAgreementState() {
  const defaults = loadToolAccessAgreementDefault(LEGAL_DIR);
  const stored = await getSetting(TOOL_ACCESS_AGREEMENT_SETTING_KEY, null);
  return normalizeToolAccessAgreement(stored, defaults);
}

async function countToolAccessAgreementAcks(version) {
  const ver = String(version || '').trim().slice(0, 32);
  if (!ver) return 0;
  const stored = await getSetting(TOOL_ACCESS_AGREEMENT_ACKS_SETTING_KEY, { acks: {} });
  const raw = stored && typeof stored === 'object' ? (stored.acks || stored) : {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 0;
  let count = 0;
  for (const value of Object.values(raw)) {
    if (String(value || '').trim() === ver) count += 1;
  }
  return count;
}

async function countLegalNoticeAcks(version) {
  const ver = String(version || '').trim().slice(0, 32);
  if (!ver) return 0;
  try {
    const row = await queryOne(
      'SELECT COUNT(*) AS c FROM legal_notice_acks WHERE notice_version = ?',
      [ver]
    );
    return Math.max(0, Number(row && row.c) || 0);
  } catch (err) {
    console.error('legal notice ack count failed:', err);
    return 0;
  }
}

async function recordLegalNoticeAck(version, visitorId, userId) {
  const ver = String(version || '').trim().slice(0, 32);
  const vid = String(visitorId || '').trim().slice(0, 32);
  if (!ver || !isValidVisitorId(vid)) return { counted: false };
  const uid = Number.isFinite(Number(userId)) && Number(userId) > 0 ? Number(userId) : null;
  if (pgDatabase) {
    await execute(
      'INSERT INTO legal_notice_acks (notice_version, visitor_id, user_id) VALUES (?, ?, ?) ON CONFLICT (notice_version, visitor_id) DO NOTHING',
      [ver, vid, uid]
    );
  } else {
    await execute(
      'INSERT IGNORE INTO legal_notice_acks (notice_version, visitor_id, user_id) VALUES (?, ?, ?)',
      [ver, vid, uid]
    );
  }
  return { counted: true };
}

const MAX_TOOL_ALLOWED_USERS = 80;

function normalizeAllowedUserRefs(input) {
  const raw = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? String(input).split(/[,，;；\s]+/)
      : [];
  const seen = new Set();
  const refs = [];
  for (const item of raw) {
    const text = String(item || '').trim();
    if (!text) continue;
    let key = '';
    let value = text;
    if (/^\d{1,10}$/.test(text) && Number(text) > 0) {
      value = String(Number(text));
      key = 'id:' + value;
    } else if (isValidLegacyLoginId(text) || isValidStrongLoginId(text)) {
      value = text;
      key = 'login:' + text.toLowerCase();
    } else {
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(value);
    if (refs.length >= MAX_TOOL_ALLOWED_USERS) break;
  }
  return refs;
}

function isToolAllowedForUser(tool, user) {
  const allowed = Array.isArray(tool?.allowedLoginIds) ? tool.allowedLoginIds : [];
  const adminOnly = tool?.adminOnly === true;
  if (!adminOnly && !allowed.length) return true;
  if (!user) return false;
  if (adminOnly && (Number(user.is_admin) === 1 || user.isAdmin === true)) return true;
  const loginId = String(user.login_id || user.loginId || '').trim().toLowerCase();
  const userId = Number(user.id);
  for (const ref of allowed) {
    const token = String(ref || '').trim();
    if (!token) continue;
    if (/^\d+$/.test(token) && Number(token) === userId) return true;
    if (token.toLowerCase() === loginId) return true;
  }
  return false;
}

function normalizeToolManagement(payload) {
  const inputTools = Array.isArray(payload) ? payload : (Array.isArray(payload?.tools) ? payload.tools : []);
  const knownIds = new Set(TOOL_CATALOG.map((tool) => tool.id));
  const inputById = new Map();

  for (const item of inputTools) {
    if (!item || typeof item !== 'object' || !knownIds.has(item.id)) continue;
    if (item.badge != null && !TOOL_BADGES.has(item.badge)) return { error: 'BAD_BADGE' };
    if (item.displayGroup != null && !TOOL_DISPLAY_GROUPS.has(item.displayGroup)) return { error: 'BAD_TOOL_GROUP' };
    if (item.toolCategory != null && !TOOL_CATEGORIES.has(item.toolCategory)) return { error: 'BAD_TOOL_CATEGORY' };
    inputById.set(item.id, item);
  }

  return {
    tools: TOOL_CATALOG.map((tool) => {
      const input = inputById.get(tool.id);
      return {
        id: tool.id,
        visible: typeof input?.visible === 'boolean' ? input.visible : tool.defaultVisible,
        enabled: typeof input?.enabled === 'boolean' ? input.enabled : true,
        adminOnly: typeof input?.adminOnly === 'boolean' ? input.adminOnly : false,
        allowedLoginIds: normalizeAllowedUserRefs(input?.allowedLoginIds),
        badge: input?.badge || tool.badge,
        displayGroup: input?.displayGroup || tool.group,
        toolCategory: input?.toolCategory || defaultToolCategory(tool),
        sortOrder: Number.isInteger(Number(input?.sortOrder)) ? Number(input.sortOrder) : TOOL_CATALOG.indexOf(tool) * 10,
        disabledMessage: String(input?.disabledMessage || '').trim().slice(0, 240)
      };
    })
  };
}

function toPublicToolManagement(tools, user) {
  return tools.map(({ id, visible, enabled, adminOnly, allowedLoginIds, badge, displayGroup, toolCategory, sortOrder }) => ({
    id,
    visible,
    enabled,
    adminOnly: !!adminOnly,
    viewerAllowed: isToolAllowedForUser({ adminOnly, allowedLoginIds }, user),
    badge,
    displayGroup,
    toolCategory,
    sortOrder
  }));
}

function toAdminToolManagement(tools) {
  const settingsById = new Map(tools.map((tool) => [tool.id, tool]));
  return TOOL_CATALOG.map(({ id, name, group, defaultVisible }) => {
    const setting = settingsById.get(id) || { visible: defaultVisible, enabled: true, adminOnly: false, allowedLoginIds: [], badge: 'none', displayGroup: group };
    return { id, name, group: setting.displayGroup || group, defaultVisible, visible: setting.visible, enabled: setting.enabled !== false, adminOnly: setting.adminOnly === true, allowedLoginIds: normalizeAllowedUserRefs(setting.allowedLoginIds), badge: setting.badge, displayGroup: setting.displayGroup || group, toolCategory: setting.toolCategory || defaultToolCategory({ id, group }), sortOrder: Number(setting.sortOrder || 0), disabledMessage: setting.disabledMessage || '' };
  });
}

async function setToolManagementSetting(value) {
  await setSetting(TOOL_MANAGEMENT_SETTING_KEY, value);
}

function createToolManagementHandlers(dependencies = {}) {
  const readSetting = dependencies.getSetting || getSetting;
  const writeSetting = dependencies.setSetting
    ? (value) => dependencies.setSetting(TOOL_MANAGEMENT_SETTING_KEY, value)
    : setToolManagementSetting;
  const authenticateAdmin = dependencies.requireAdmin || requireAdmin;
  const writeAudit = dependencies.auditAdminAction || auditAdminAction;
  const now = dependencies.now || (() => new Date().toISOString());
  const logError = dependencies.logError || ((...args) => console.error(...args));
  const defaultTools = () => normalizeToolManagement([]).tools;

  const resolveUser = dependencies.currentUserFromRequest || currentUserFromRequest;

  async function getPublic(req, res) {
    try {
      const stored = await readSetting(TOOL_MANAGEMENT_SETTING_KEY, { tools: defaultTools() });
      const normalized = normalizeToolManagement(stored);
      const tools = normalized.error ? defaultTools() : normalized.tools;
      let user = null;
      try { user = req ? await resolveUser(req) : null; } catch (_error) { user = null; }
      return res.json({ tools: toPublicToolManagement(tools, user) });
    } catch (err) {
      logError('tool management get failed:', err);
      return res.json({ tools: toPublicToolManagement(defaultTools()) });
    }
  }

  async function getAdmin(req, res) {
    const admin = await authenticateAdmin(req, res);
    if (!admin) return;
    const stored = await readSetting(TOOL_MANAGEMENT_SETTING_KEY, { tools: defaultTools() });
    const normalized = normalizeToolManagement(stored);
    const tools = normalized.error ? defaultTools() : normalized.tools;
    return res.json({
      tools: toAdminToolManagement(tools),
      updatedAt: stored?.updatedAt || null,
      updatedBy: stored?.updatedBy || null
    });
  }

  async function saveAdmin(req, res) {
    const admin = await authenticateAdmin(req, res);
    if (!admin) return;
    const inputTools = Array.isArray(req.body?.tools) ? req.body.tools : null;
    const inputIds = new Set(inputTools?.map((tool) => tool?.id) || []);
    const hasCompleteCatalog = inputTools?.length === TOOL_CATALOG.length
      && inputIds.size === TOOL_CATALOG.length
      && TOOL_CATALOG.every((tool) => inputIds.has(tool.id));
    if (!hasCompleteCatalog) return res.status(400).json({ error: 'BAD_TOOL_CATALOG' });
    const normalized = normalizeToolManagement(req.body || {});
    if (normalized.error) return res.status(400).json({ error: normalized.error });

    const updatedAt = now();
    const updatedBy = admin.username || admin.login_id || String(admin.id);
    const setting = { tools: normalized.tools, updatedAt, updatedBy };
    await writeSetting(setting);
    await writeAudit(req, {
      actor: admin,
      action: 'tool_management.update',
      targetType: 'tool_management',
      targetId: 'current',
      riskLevel: 'watch',
      summary: '更新工具展示配置',
      metadata: {
        visibleCount: normalized.tools.filter((tool) => tool.visible).length,
        enabledCount: normalized.tools.filter((tool) => tool.enabled).length,
        adminOnlyCount: normalized.tools.filter((tool) => tool.adminOnly).length,
        allowedUserCount: normalized.tools.reduce((sum, tool) => sum + (Array.isArray(tool.allowedLoginIds) ? tool.allowedLoginIds.length : 0), 0),
        badgeCount: normalized.tools.filter((tool) => tool.badge !== 'none').length
      }
    });
    return res.json({
      ok: true,
      tools: toAdminToolManagement(normalized.tools),
      updatedAt,
      updatedBy
    });
  }

  return { getPublic, getAdmin, saveAdmin };
}

function catalogToolById(toolId) {
  return TOOL_CATALOG.find((tool) => tool.id === toolId) || null;
}

function normalizeToolAccessRequests(payload) {
  const input = Array.isArray(payload) ? payload : (Array.isArray(payload?.requests) ? payload.requests : []);
  const requests = [];
  const seen = new Set();
  for (const item of input) {
    const tool = catalogToolById(item?.toolId);
    const id = String(item?.id || '').trim();
    const status = item?.status === 'approved' || item?.status === 'rejected' ? item.status : 'pending';
    const userId = Number(item?.userId);
    const loginId = String(item?.loginId || '').trim();
    if (!tool || !id || seen.has(id) || !Number.isInteger(userId) || userId <= 0 || !loginId) continue;
    seen.add(id);
    requests.push({
      id,
      toolId: tool.id,
      toolName: tool.name,
      userId,
      loginId,
      username: String(item?.username || '').trim().slice(0, 32),
      status,
      createdAt: String(item?.createdAt || ''),
      resolvedAt: item?.resolvedAt ? String(item.resolvedAt) : null,
      resolvedBy: item?.resolvedBy ? String(item.resolvedBy) : null,
      agreementVersion: String(item?.agreementVersion || '').trim() || null
    });
    if (requests.length >= MAX_TOOL_ACCESS_REQUESTS) break;
  }
  return { requests };
}

function publicToolAccessRequest(request) {
  if (!request) return null;
  return {
    id: request.id,
    toolId: request.toolId,
    status: request.status,
    createdAt: request.createdAt
  };
}

function createToolAccessRequestHandlers(dependencies = {}) {
  const readSetting = dependencies.getSetting || getSetting;
  const writeSetting = dependencies.setSetting || setSetting;
  const authenticate = dependencies.requireAuth || requireAuth;
  const authenticateAdmin = dependencies.requireAdmin || requireAdmin;
  const writeAudit = dependencies.auditAdminAction || auditAdminAction;
  const now = dependencies.now || (() => new Date().toISOString());
  const resolveUser = dependencies.currentUserFromRequest || currentUserFromRequest;
  const newId = dependencies.newId || ((userId) => `tar_${Date.now().toString(36)}_${userId}`);

  async function readRequests() {
    const stored = await readSetting(TOOL_ACCESS_REQUESTS_SETTING_KEY, { requests: [] });
    return normalizeToolAccessRequests(stored).requests;
  }

  async function writeRequests(requests) {
    await writeSetting(TOOL_ACCESS_REQUESTS_SETTING_KEY, { requests, updatedAt: now() });
  }

  function normalizeAgreementAcks(payload) {
    const raw = payload && typeof payload === 'object' ? (payload.acks || payload) : {};
    const acks = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return acks;
    for (const [userId, version] of Object.entries(raw)) {
      if (!/^\d+$/.test(userId)) continue;
      const token = String(version || '').trim().slice(0, 32);
      if (!token) continue;
      acks[userId] = token;
    }
    return acks;
  }

  async function readAgreementAcks() {
    const stored = await readSetting(TOOL_ACCESS_AGREEMENT_ACKS_SETTING_KEY, { acks: {} });
    return normalizeAgreementAcks(stored);
  }

  async function writeUserAgreementAck(userId, version) {
    const acks = await readAgreementAcks();
    acks[String(userId)] = String(version || TOOL_ACCESS_AGREEMENT_VERSION);
    await writeSetting(TOOL_ACCESS_AGREEMENT_ACKS_SETTING_KEY, { acks, updatedAt: now() });
  }

  async function currentAgreement() {
    if (typeof dependencies.getToolAccessAgreement === 'function') {
      try {
        const injected = await dependencies.getToolAccessAgreement();
        if (injected && typeof injected === 'object') {
          return normalizeToolAccessAgreement(injected, null);
        }
      } catch (_error) {}
    }
    try {
      const stored = await readSetting(TOOL_ACCESS_AGREEMENT_SETTING_KEY, null);
      if (stored && typeof stored === 'object') {
        return normalizeToolAccessAgreement(stored, null);
      }
    } catch (_error) {}
    return {
      version: TOOL_ACCESS_AGREEMENT_VERSION,
      noticeTitle: DEFAULT_TOOL_ACCESS_NOTICE_TITLE,
      noticeSummary: DEFAULT_TOOL_ACCESS_NOTICE_SUMMARY,
      href: TOOL_ACCESS_AGREEMENT_HREF
    };
  }

  function toolRequiresApplication(setting) {
    if (!setting) return false;
    if (setting.enabled === false) return true;
    if (setting.adminOnly === true) return true;
    return Array.isArray(setting.allowedLoginIds) && setting.allowedLoginIds.length > 0;
  }

  async function create(req, res) {
    const user = await authenticate(req, res);
    if (!user) return;
    const tool = catalogToolById(String(req.body?.toolId || '').trim());
    if (!tool) return res.status(400).json({ error: 'UNKNOWN_TOOL' });
    if (req.body?.acceptedAgreement !== true) return res.status(400).json({ error: 'AGREEMENT_REQUIRED' });
    const loginId = String(user.login_id || user.loginId || '').trim();
    if (!loginId) return res.status(400).json({ error: 'UNKNOWN_TOOL' });
    const storedTools = await readSetting(TOOL_MANAGEMENT_SETTING_KEY, { tools: [] });
    const tools = normalizeToolManagement(storedTools).tools || [];
    const setting = tools.find((item) => item.id === tool.id);
    if (setting && setting.enabled !== false && isToolAllowedForUser(setting, user)) {
      return res.status(409).json({ error: 'ALREADY_ALLOWED' });
    }
    const requests = await readRequests();
    const userId = Number(user.id);
    const existing = requests.find((item) => item.toolId === tool.id && item.userId === userId && item.status === 'pending');
    if (existing) return res.status(409).json({ error: 'ALREADY_PENDING', request: publicToolAccessRequest(existing) });
    const request = {
      id: newId(userId),
      toolId: tool.id,
      toolName: tool.name,
      userId,
      loginId,
      username: String(user.username || '').trim().slice(0, 32),
      status: 'pending',
      createdAt: now(),
      resolvedAt: null,
      resolvedBy: null,
      agreementVersion: (await currentAgreement()).version
    };
    const next = [request, ...requests].slice(0, MAX_TOOL_ACCESS_REQUESTS);
    await writeRequests(next);
    try { await writeUserAgreementAck(userId, request.agreementVersion); } catch (_error) {}
    return res.status(201).json({ ok: true, request: publicToolAccessRequest(request) });
  }

  async function getMine(req, res) {
    const user = await resolveUser(req);
    if (!user) return res.json({ request: null });
    const toolId = String(req.query?.toolId || '').trim();
    if (!catalogToolById(toolId)) return res.json({ request: null });
    const requests = await readRequests();
    const mine = requests.find((item) => item.toolId === toolId && item.userId === Number(user.id));
    return res.json({ request: publicToolAccessRequest(mine || null) });
  }

  async function listAdmin(req, res) {
    const admin = await authenticateAdmin(req, res);
    if (!admin) return;
    const requests = await readRequests();
    const pending = requests.filter((item) => item.status === 'pending');
    const resolved = requests.filter((item) => item.status !== 'pending').slice(0, 40);
    return res.json({ requests: pending.concat(resolved) });
  }

  async function resolveAdmin(req, res, action) {
    const admin = await authenticateAdmin(req, res);
    if (!admin) return;
    const requestId = String(req.params?.id || '').trim();
    const requests = await readRequests();
    const index = requests.findIndex((item) => item.id === requestId);
    if (index < 0) return res.status(404).json({ error: 'NOT_FOUND' });
    const request = requests[index];
    if (request.status !== 'pending') return res.status(409).json({ error: 'ALREADY_RESOLVED' });
    const resolvedBy = admin.username || admin.login_id || String(admin.id);
    const resolvedAt = now();
    if (action === 'approve') {
      const storedTools = await readSetting(TOOL_MANAGEMENT_SETTING_KEY, { tools: [] });
      const normalized = normalizeToolManagement(storedTools);
      const tools = (normalized.error ? normalizeToolManagement([]).tools : normalized.tools).map((tool) => {
        if (tool.id !== request.toolId) return tool;
        return {
          ...tool,
          allowedLoginIds: normalizeAllowedUserRefs([...(tool.allowedLoginIds || []), request.loginId, String(request.userId)])
        };
      });
      await writeSetting(TOOL_MANAGEMENT_SETTING_KEY, {
        tools,
        updatedAt: resolvedAt,
        updatedBy: resolvedBy
      });
    }
    requests[index] = { ...request, status: action === 'approve' ? 'approved' : 'rejected', resolvedAt, resolvedBy };
    await writeRequests(requests);
    await writeAudit(req, {
      actor: admin,
      action: action === 'approve' ? 'tool_access_request.approve' : 'tool_access_request.reject',
      targetType: 'tool_access_request',
      targetId: request.id,
      riskLevel: 'watch',
      summary: `${action === 'approve' ? '通过' : '驳回'}工具权限申请：${request.toolName} / ${request.loginId}`,
      metadata: { toolId: request.toolId, userId: request.userId, loginId: request.loginId }
    });
    return res.json({ ok: true, request: requests[index] });
  }

  async function getNotice(req, res) {
    const user = await resolveUser(req);
    if (!user) return res.json({ show: false });
    const pathname = String(req.query?.path || '').split('?')[0];
    const tool = findManagedToolByPath(pathname);
    if (!tool) return res.json({ show: false });
    const storedTools = await readSetting(TOOL_MANAGEMENT_SETTING_KEY, { tools: [] });
    const normalizedTools = normalizeToolManagement(storedTools);
    const tools = normalizedTools.error ? [] : (normalizedTools.tools || []);
    const setting = tools.find((item) => item.id === tool.id);
    if (!toolRequiresApplication(setting)) return res.json({ show: false });
    const hasAccess = setting.enabled !== false && isToolAllowedForUser(setting, user);
    const acks = await readAgreementAcks();
    const previous = acks[String(user.id)] || '';
    if (!previous && !hasAccess) return res.json({ show: false });
    const agreement = await currentAgreement();
    const version = String(agreement.version || TOOL_ACCESS_AGREEMENT_VERSION);
    if (previous === version) return res.json({ show: false });
    return res.json({
      show: true,
      notice: {
        version,
        title: agreement.noticeTitle || DEFAULT_TOOL_ACCESS_NOTICE_TITLE,
        summary: agreement.noticeSummary || DEFAULT_TOOL_ACCESS_NOTICE_SUMMARY,
        href: TOOL_ACCESS_AGREEMENT_HREF
      }
    });
  }

  async function ackNotice(req, res) {
    const user = await authenticate(req, res);
    if (!user) return;
    const agreement = await currentAgreement();
    const currentVersion = String(agreement.version || TOOL_ACCESS_AGREEMENT_VERSION);
    const version = String(req.body?.version || currentVersion).trim().slice(0, 32);
    if (version !== currentVersion) return res.status(400).json({ error: 'BAD_VERSION' });
    await writeUserAgreementAck(Number(user.id), version);
    return res.json({ ok: true, version });
  }

  return { create, getMine, listAdmin, resolveAdmin, getNotice, ackNotice };
}

async function normalizeUserQuota(userId) {
  const user = await queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!user) return null;
  const nextAt = user.username_change_next_at ? new Date(user.username_change_next_at).getTime() : NaN;
  const remainingRaw = Number(user.username_change_remaining);
  if (Number.isFinite(nextAt) && nextAt <= Date.now()) {
    await execute('UPDATE users SET username_change_remaining = 2, username_change_next_at = NULL WHERE id = ?', [userId]);
    return queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
  }
  if (!Number.isFinite(remainingRaw)) {
    await execute('UPDATE users SET username_change_remaining = 2 WHERE id = ?', [userId]);
    return queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
  }
  return user;
}

async function currentUserFromRequest(req) {
  const token = getSessionToken(req);
  if (!token) return null;
  let sess = sessions.get(token);
  if (!sess) {
    try {
      sess = await loadPersistedSession(token);
    } catch (err) {
      console.warn('auth session load skipped:', err.message);
      sess = null;
    }
    if (sess) sessions.set(token, sess);
  }
  if (!sess || !Number.isFinite(sess.userId) || sess.userId <= 0 || sess.expiresAt <= Date.now()) {
    sessions.delete(token);
    await deletePersistedSession(token).catch(() => {});
    return null;
  }
  const user = await normalizeUserQuota(sess.userId);
  if (!user) {
    sessions.delete(token);
    await deletePersistedSession(token).catch(() => {});
    return null;
  }
  sess.expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, sess);
  if (!sess.persistedExpiresAt || sess.expiresAt - sess.persistedExpiresAt > 60 * 60 * 1000) {
    sess.persistedExpiresAt = sess.expiresAt;
    persistSessionExpiry(token, sess.expiresAt).catch((err) => {
      console.warn('auth session refresh skipped:', err.message);
    });
  }
  return user;
}

async function requireAuth(req, res) {
  const user = await currentUserFromRequest(req);
  if (!user) {
    const token = getSessionToken(req);
    if (token) {
      try { res.clearCookie(SESSION_COOKIE_NAME, { path: '/' }); } catch {}
      res.status(401).json({ error: 'SESSION_EXPIRED' });
      return null;
    }
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return null;
  }
  return user;
}

async function requireAdmin(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  if (Number(user.is_admin) !== 1) {
    res.status(403).json({ error: 'FORBIDDEN' });
    return null;
  }
  return user;
}

async function requireModerator(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  if (!isModerator(user)) {
    res.status(403).json({ error: 'FORBIDDEN' });
    return null;
  }
  return user;
}

async function auditAdminAction(req, details) {
  if (!governanceService) return;
  try {
    const actor = details && details.actor ? details.actor : await currentUserFromRequest(req);
    await governanceService.writeAuditLog({
      actor,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || '',
      ...(details || {})
    });
  } catch (err) {
    console.error('admin audit log failed:', err);
  }
}

app.use((req, res, next) => {
  const identity = ensureVisitorIdentity(parseCookies(req.headers.cookie));
  req.analyticsVisitorId = identity.visitorId;
  if (identity.setCookieHeader) res.append('Set-Cookie', identity.setCookieHeader);
  next();
});

app.use((req, res, next) => {
  const apiMeta = classifyApiPath(req.path);
  if (!apiMeta.trackAsApiHit) return next();
  const startedAt = Date.now();
  res.on('finish', () => {
    if (!analyticsService) return;
    Promise.resolve().then(async () => {
      try {
        const user = await currentUserFromRequest(req);
        await analyticsService.recordApiHit({
          occurredAt: new Date().toISOString(),
          scopeKey: apiMeta.scopeKey,
          isAdminArea: apiMeta.isAdminArea,
          userId: user ? Number(user.id) : null,
          visitorId: req.analyticsVisitorId || null,
          sessionId: getSessionToken(req) || null,
          referrer: req.headers.referer || null,
          userAgentHash: hashAnalyticsValue(req.headers['user-agent'] || ''),
          ipHash: hashAnalyticsValue(getClientIp(req)),
          statusCode: Number(res.statusCode || 0),
          durationMs: Math.max(0, Date.now() - startedAt)
        });
      } catch (err) {
        console.error('analytics api hit failed:', err);
      }
    });
  });
  next();
});

function userIsMuted(user) {
  if (!user?.muted_until) return false;
  const ts = new Date(user.muted_until).getTime();
  return Number.isFinite(ts) && ts > Date.now();
}

async function assertCanPost(user, res) {
  if (Number(user.is_banned) === 1) {
    res.status(403).json({ error: 'BANNED' });
    return false;
  }
  if (userIsMuted(user)) {
    res.status(403).json({ error: 'MUTED', mutedUntil: user.muted_until });
    return false;
  }
  return true;
}

async function checkUserDeletionSafety(target) {
  if (!target) return { ok: false, error: 'NOT_FOUND' };
  if (isDefaultAdminLogin(target.login_id)) return { ok: false, error: 'PROTECTED_ADMIN' };
  if (Number(target.is_admin) === 1) {
    const c = await queryOne('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1', []);
    if (Number(c?.c || 0) <= 1) return { ok: false, error: 'LAST_ADMIN' };
  }
  return { ok: true };
}

async function deleteUserCascadeById(userId) {
  await execute('DELETE FROM forum_post_likes WHERE user_id = ?', [userId]);
  await execute('DELETE FROM forum_post_favorites WHERE user_id = ?', [userId]);
  await execute('DELETE FROM forum_comments WHERE author_id = ?', [userId]);
  const posts = await queryRows('SELECT id FROM forum_posts WHERE author_id = ?', [userId]);
  for (const p of posts) {
    await execute('DELETE FROM forum_comments WHERE post_id = ?', [p.id]);
    await execute('DELETE FROM forum_post_likes WHERE post_id = ?', [p.id]);
    await execute('DELETE FROM forum_post_favorites WHERE post_id = ?', [p.id]);
    await execute('DELETE FROM forum_post_views WHERE post_id = ?', [p.id]);
    await execute('DELETE FROM forum_post_reads WHERE post_id = ?', [p.id]);
  }
  await execute('DELETE FROM forum_posts WHERE author_id = ?', [userId]);
  await execute('DELETE FROM chat_messages WHERE sender_id = ? OR receiver_id = ?', [userId, userId]);
  await execute('DELETE FROM chat_read_states WHERE user_id = ? OR peer_id = ?', [userId, userId]);
  await execute('DELETE FROM user_voices WHERE user_id = ?', [userId]);
  await execute('DELETE FROM bearpit_layouts WHERE user_id = ?', [userId]);
  const collectForms = await queryRows('SELECT collect_key FROM bearpit_collect_forms WHERE user_id = ?', [userId]);
  for (const form of collectForms) {
    await execute('DELETE FROM bearpit_collect_entries WHERE collect_key = ?', [form.collect_key]);
  }
  await execute('DELETE FROM bearpit_collect_forms WHERE user_id = ?', [userId]);
  await execute('DELETE FROM user_follows WHERE follower_id = ? OR following_id = ?', [userId, userId]);
  await deleteSessionsByUserId(userId);
  await execute('DELETE FROM users WHERE id = ?', [userId]);
}

function normalizeReviewNote(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (!text) return '';
  return text.slice(0, 240);
}

async function ensureAuthSessionsSchema() {
  if (pgDatabase) {
    await execute(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        token_hash varchar(64) PRIMARY KEY,
        user_id integer NOT NULL,
        expires_at timestamptz(3) NOT NULL,
        created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      )
    `);
    await execute('CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions (user_id)');
    await execute('CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions (expires_at)');
    return;
  }
  await execute(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash CHAR(64) NOT NULL PRIMARY KEY,
      user_id INT NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY idx_auth_sessions_user (user_id),
      KEY idx_auth_sessions_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function initDB() {
  await ensureAuthSessionsSchema();
  // PostgreSQL 模式：避免执行 MySQL 方言的建表 SQL（会在 AUTO_INCREMENT 处直接语法失败），
  // 并确保我们新增的 `forum_post_views` 表也在 pg 下存在。
  if (pgDatabase) {
    const { POSTGRES_SCHEMA_SQL } = require('./postgres-schema');
    // 先按既有 pg schema 初始化（users/forum/chat 等）
    for (const sql of POSTGRES_SCHEMA_SQL) {
      await execute(sql);
    }
    // 新增：站点设置表（公告、论坛自动审核等）
    await execute(`
      CREATE TABLE IF NOT EXISTS site_settings (
        key varchar(64) PRIMARY KEY,
        value text NOT NULL
      );
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS legal_notice_acks (
        notice_version varchar(32) NOT NULL,
        visitor_id varchar(32) NOT NULL,
        user_id integer NULL,
        created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (notice_version, visitor_id)
      );
    `);
    // 新增：帖子浏览量表（PostgreSQL 版本）
    await execute(`
      CREATE TABLE IF NOT EXISTS forum_post_views (
        post_id integer NOT NULL,
        viewer_key varchar(80) NOT NULL,
        created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (post_id, viewer_key)
      );
    `);
    await execute(`
      CREATE INDEX IF NOT EXISTS idx_forum_post_views_post_created
      ON forum_post_views (post_id, created_at);
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS forum_post_reads (
        id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        post_id integer NOT NULL,
        visitor_id varchar(32) NOT NULL,
        user_id integer NULL,
        created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      );
    `);
    await execute(`
      CREATE INDEX IF NOT EXISTS idx_forum_post_reads_post_created
      ON forum_post_reads (post_id, created_at);
    `);
    await execute(`
      CREATE INDEX IF NOT EXISTS idx_forum_post_reads_visitor_post_created
      ON forum_post_reads (visitor_id, post_id, created_at);
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS aeroplane_chess_match_history (
        id serial PRIMARY KEY,
        room_code varchar(8) NOT NULL,
        game_session_id varchar(80) NOT NULL,
        winner_player integer NULL,
        rankings_json text NULL,
        players_json text NOT NULL,
        ended_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      );
    `);
    await execute(`
      CREATE INDEX IF NOT EXISTS idx_aeroplane_chess_match_history_ended
      ON aeroplane_chess_match_history (ended_at DESC);
    `);
    // 默认开启论坛自动审核（如果没设置过）
    const hasAuto = await queryOne('SELECT 1 AS ok FROM site_settings WHERE key = ? LIMIT 1', ['forum_auto_approve']);
    if (!hasAuto) await setForumAutoApprove(true);
    const giftSeedPg = await seedGiftPacksIfEmpty({
      queryOne,
      execute,
      rootDir: __dirname,
      pgDatabase
    });
    if (giftSeedPg.seeded) console.log(`Gift packs seeded: ${giftSeedPg.count}`);
    const heroSeedPg = await seedHeroGenerationsIfEmpty({
      queryOne,
      execute,
      rootDir: __dirname,
      pgDatabase
    });
    if (heroSeedPg.seeded) console.log(`Hero generations seeded: ${heroSeedPg.count}`);
    await ensureUserRewardsSchema({ execute, pgDatabase, addColumnIfMissing });
    await ensureShopSchema({ execute, pgDatabase });
    await ensureCalendarSchema({ execute, queryRows, queryOne, runInTransaction, pgDatabase: true });
    return;
  }

  await execute(RAW_EVENTS_TABLE_SQL);
  await execute(HOURLY_AGGREGATES_TABLE_SQL);
  await execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      login_id VARCHAR(64) NOT NULL UNIQUE,
      username VARCHAR(64) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      is_admin TINYINT(1) NOT NULL DEFAULT 0,
      forum_publisher TINYINT(1) NOT NULL DEFAULT 0,
      is_banned TINYINT(1) NOT NULL DEFAULT 0,
      muted_until DATETIME(3) NULL,
      membership_status VARCHAR(32) NOT NULL DEFAULT 'none',
      membership_expires_at DATETIME(3) NULL,
      title_text VARCHAR(64) NOT NULL DEFAULT '',
      title_bg_color VARCHAR(16) NULL,
      title_color VARCHAR(16) NULL,
      bio VARCHAR(255) NOT NULL DEFAULT '这个人很高冷，连个人介绍都不改！',
      username_change_remaining INT NOT NULL DEFAULT 2,
      username_change_next_at DATETIME(3) NULL,
      username_changed_at DATETIME(3) NULL,
      avatar_url MEDIUMTEXT NULL,
      avatar_updated_at DATETIME(3) NULL,
      avatar_next_at DATETIME(3) NULL,
      gender VARCHAR(16) NOT NULL DEFAULT 'unknown',
      birthday DATE NULL,
      birthday_public TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS forum_posts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      section VARCHAR(32) NOT NULL,
      type VARCHAR(16) NOT NULL DEFAULT 'article',
      title VARCHAR(120) NOT NULL,
      contentText TEXT NULL,
      contentHtml MEDIUMTEXT NULL,
      coverImage MEDIUMTEXT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'approved',
      approved_at DATETIME(3) NULL,
      approved_by INT NULL,
      is_pinned TINYINT(1) NOT NULL DEFAULT 0,
      author_id INT NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS forum_comments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      post_id INT NOT NULL,
      author_id INT NOT NULL,
      content TEXT NOT NULL,
      reply_to_comment_id INT NULL,
      is_pinned TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS forum_post_likes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      post_id INT NOT NULL,
      user_id INT NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_forum_post_like (post_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS forum_post_favorites (
      id INT AUTO_INCREMENT PRIMARY KEY,
      post_id INT NOT NULL,
      user_id INT NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_forum_post_favorite (post_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS aeroplane_chess_match_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      room_code VARCHAR(8) NOT NULL,
      game_session_id VARCHAR(80) NOT NULL,
      winner_player INT NULL,
      rankings_json TEXT NULL,
      players_json TEXT NOT NULL,
      ended_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY idx_aeroplane_chess_match_history_ended (ended_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS forum_post_views (
      post_id INT NOT NULL,
      viewer_key VARCHAR(80) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (post_id, viewer_key),
      KEY idx_forum_post_views_post_created (post_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS forum_post_reads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      post_id INT NOT NULL,
      visitor_id VARCHAR(32) NOT NULL,
      user_id INT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY idx_forum_post_reads_post_created (post_id, created_at),
      KEY idx_forum_post_reads_visitor_post_created (visitor_id, post_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sender_id INT NOT NULL,
      receiver_id INT NOT NULL,
      content VARCHAR(1000) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY idx_chat_sender_receiver_created (sender_id, receiver_id, created_at),
      KEY idx_chat_receiver_sender_created (receiver_id, sender_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS chat_read_states (
      user_id INT NOT NULL,
      peer_id INT NOT NULL,
      read_at DATETIME(3) NOT NULL,
      PRIMARY KEY (user_id, peer_id),
      KEY idx_chat_read_peer (peer_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS user_follows (
      follower_id INT NOT NULL,
      following_id INT NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (follower_id, following_id),
      KEY idx_following_id (following_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS site_settings (
      \`key\` VARCHAR(64) PRIMARY KEY,
      value MEDIUMTEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS legal_notice_acks (
      notice_version VARCHAR(32) NOT NULL,
      visitor_id VARCHAR(32) NOT NULL,
      user_id INT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (notice_version, visitor_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS user_voices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      contact VARCHAR(64) NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS calendar_schedules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      original_id VARCHAR(32) NOT NULL,
      name VARCHAR(120) NOT NULL,
      date VARCHAR(10) NOT NULL,
      start_time VARCHAR(10) NULL,
      end_time VARCHAR(10) NULL,
      color VARCHAR(16) NULL,
      description TEXT NULL,
      created_by INT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS bearpit_layouts (
      user_id INT PRIMARY KEY,
      data_json JSON NOT NULL,
      updated_at DATETIME(3) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS admin_user_delete_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      target_user_id INT NOT NULL,
      target_login_id VARCHAR(64) NOT NULL,
      target_username VARCHAR(64) NOT NULL,
      source_post_id INT NULL,
      requested_by INT NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      review_note VARCHAR(255) NULL,
      reviewed_by INT NULL,
      reviewed_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY idx_delete_requests_target (target_user_id),
      KEY idx_delete_requests_status (status),
      KEY idx_delete_requests_requested_by (requested_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      actor_id INT NULL,
      actor_login_id VARCHAR(64) NULL,
      actor_username VARCHAR(64) NULL,
      action VARCHAR(64) NOT NULL,
      target_type VARCHAR(64) NOT NULL,
      target_id VARCHAR(64) NULL,
      risk_level VARCHAR(16) NOT NULL DEFAULT 'info',
      summary VARCHAR(255) NOT NULL,
      metadata_json JSON NULL,
      ip_hash VARCHAR(64) NULL,
      user_agent_hash VARCHAR(64) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY idx_audit_created (created_at),
      KEY idx_audit_actor (actor_id, created_at),
      KEY idx_audit_action (action, created_at),
      KEY idx_audit_target (target_type, target_id),
      KEY idx_audit_risk (risk_level, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS admin_release_checks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      actor_id INT NULL,
      status VARCHAR(16) NOT NULL,
      risk_level VARCHAR(16) NOT NULL,
      summary VARCHAR(255) NOT NULL,
      items_json JSON NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY idx_release_checks_created (created_at),
      KEY idx_release_checks_actor (actor_id, created_at),
      KEY idx_release_checks_risk (risk_level, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execute(GIFT_PACKS_DDL_MYSQL);
  await execute(BEARPIT_BACKUPS_DDL_MYSQL);
  await execute(pgDatabase ? BEARPIT_SHARES_DDL_PG : BEARPIT_SHARES_DDL_MYSQL);
  await execute(pgDatabase ? BEARPIT_SIMPLE_BACKUPS_DDL_PG : BEARPIT_SIMPLE_BACKUPS_DDL_MYSQL);
  await execute(pgDatabase ? BEARPIT_COLLECT_FORMS_DDL_PG : BEARPIT_COLLECT_FORMS_DDL_MYSQL);
  await execute(pgDatabase ? BEARPIT_COLLECT_ENTRIES_DDL_PG : BEARPIT_COLLECT_ENTRIES_DDL_MYSQL);
  await execute(HERO_GENERATIONS_DDL_MYSQL);

  await addColumnIfMissing('users', 'forum_publisher', 'forum_publisher TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfMissing('users', 'is_banned', 'is_banned TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfMissing('users', 'muted_until', 'muted_until DATETIME(3) NULL');
  await addColumnIfMissing('users', 'membership_status', "membership_status VARCHAR(32) NOT NULL DEFAULT 'none'");
  await addColumnIfMissing('users', 'membership_expires_at', 'membership_expires_at DATETIME(3) NULL');
  await addColumnIfMissing('users', 'title_text', "title_text VARCHAR(64) NOT NULL DEFAULT ''");
  await addColumnIfMissing('users', 'title_bg_color', 'title_bg_color VARCHAR(16) NULL');
  await addColumnIfMissing('users', 'title_color', 'title_color VARCHAR(16) NULL');
  await addColumnIfMissing('users', 'bio', "bio VARCHAR(255) NOT NULL DEFAULT '这个人很高冷，连个人介绍都不改！'");
  await addColumnIfMissing('users', 'username_change_remaining', 'username_change_remaining INT NOT NULL DEFAULT 2');
  await addColumnIfMissing('users', 'username_change_next_at', 'username_change_next_at DATETIME(3) NULL');
  await addColumnIfMissing('users', 'avatar_url', 'avatar_url MEDIUMTEXT NULL');
  await addColumnIfMissing('users', 'avatar_updated_at', 'avatar_updated_at DATETIME(3) NULL');
  await addColumnIfMissing('users', 'avatar_next_at', 'avatar_next_at DATETIME(3) NULL');
  await addColumnIfMissing('users', 'gender', "gender VARCHAR(16) NOT NULL DEFAULT 'unknown'");
  await addColumnIfMissing('users', 'birthday', 'birthday DATE NULL');
  await addColumnIfMissing('users', 'birthday_public', 'birthday_public TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfMissing('users', 'created_at', 'created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)');
  await addColumnIfMissing('forum_comments', 'reply_to_comment_id', 'reply_to_comment_id INT NULL');

  try { await execute('ALTER TABLE users MODIFY COLUMN login_id VARCHAR(64) NOT NULL'); } catch (_e) {}

  const hasAuto = await queryOne('SELECT 1 AS ok FROM site_settings WHERE `key` = ? LIMIT 1', ['forum_auto_approve']);
  if (!hasAuto) await setForumAutoApprove(true);

  const countRow = await queryOne('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1', []);
  if (Number(countRow?.c || 0) === 0) {
    const def = await queryOne('SELECT id FROM users WHERE login_id = ? LIMIT 1', [DEFAULT_ADMIN_LOGIN_ID]);
    if (def) await execute('UPDATE users SET is_admin = 1 WHERE id = ?', [def.id]);
  }

  const giftSeed = await seedGiftPacksIfEmpty({
    queryOne,
    execute,
    rootDir: __dirname,
    pgDatabase
  });
  if (giftSeed.seeded) console.log(`Gift packs seeded: ${giftSeed.count}`);

  const heroSeed = await seedHeroGenerationsIfEmpty({
    queryOne,
    execute,
    rootDir: __dirname,
    pgDatabase
  });
  if (heroSeed.seeded) console.log(`Hero generations seeded: ${heroSeed.count}`);

  await ensureUserRewardsSchema({ execute, pgDatabase, addColumnIfMissing });
  await ensureShopSchema({ execute, pgDatabase });
  await ensureCalendarSchema({ execute, queryRows, queryOne, runInTransaction, pgDatabase: false });
}

async function getPostById(postId) {
  return queryOne(
    `
    SELECT
      p.*,
      u.id AS author_id,
      u.login_id AS author_login_id,
      u.username AS author_username,
      u.avatar_url AS author_avatar_url,
      u.membership_status AS author_membership_status,
      u.membership_expires_at AS author_membership_expires_at,
      u.title_text AS author_title_text,
      u.title_bg_color AS author_title_bg_color,
      u.title_color AS author_title_color,
      u.is_banned AS author_is_banned,
      u.muted_until AS author_muted_until,
      ${FORUM_VISIBLE_VIEW_COUNT_EXPR('p')} AS viewCount,
      (SELECT COUNT(*) FROM forum_post_likes l WHERE l.post_id = p.id) AS likeCount,
      (SELECT COUNT(*) FROM forum_post_favorites f WHERE f.post_id = p.id) AS favoriteCount,
      (SELECT COUNT(*) FROM forum_comments c WHERE c.post_id = p.id) AS commentCount
    FROM forum_posts p
    INNER JOIN users u ON u.id = p.author_id
    WHERE p.id = ?
    LIMIT 1
    `,
    [postId]
  );
}

async function getCommentsByPostId(postId) {
  const rows = await queryRows(
    `
    SELECT
      c.*,
      u.login_id AS author_login_id,
      u.username AS author_username,
      u.avatar_url AS author_avatar_url,
      u.membership_status AS author_membership_status,
      u.membership_expires_at AS author_membership_expires_at,
      u.title_text AS author_title_text,
      u.title_bg_color AS author_title_bg_color,
      u.title_color AS author_title_color,
      u.is_banned AS author_is_banned,
      u.muted_until AS author_muted_until,
      ru.id AS reply_author_id,
      ru.login_id AS reply_author_login_id,
      ru.username AS reply_author_username,
      ru.avatar_url AS reply_author_avatar_url,
      ru.membership_status AS reply_author_membership_status,
      ru.membership_expires_at AS reply_author_membership_expires_at,
      ru.title_text AS reply_author_title_text,
      ru.title_bg_color AS reply_author_title_bg_color,
      ru.title_color AS reply_author_title_color
    FROM forum_comments c
    INNER JOIN users u ON u.id = c.author_id
    LEFT JOIN forum_comments rc ON rc.id = c.reply_to_comment_id
    LEFT JOIN users ru ON ru.id = rc.author_id
    WHERE c.post_id = ?
    ORDER BY c.is_pinned DESC, c.created_at ASC, c.id ASC
    `,
    [postId]
  );
  return rows.map(toForumCommentDto);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.post('/api/analytics/page-view', async (req, res) => {
  try {
    const pageMeta = classifyRequestPath(req.body?.pagePath || req.path || '/');
    const user = await currentUserFromRequest(req);
    req.body = {
      ...(req.body || {}),
      pagePath: req.body?.pagePath || '/',
      pageKey: req.body?.pageKey || pageMeta.pageKey,
      isAdminArea: pageMeta.isAdminArea,
      userId: user ? Number(user.id) : null,
      sessionId: getSessionToken(req) || null,
      userAgentHash: hashAnalyticsValue(req.headers['user-agent'] || ''),
      ipHash: hashAnalyticsValue(getClientIp(req))
    };
    const result = await analyticsService.trackPageView({
      pagePath: req.body.pagePath,
      pageKey: req.body.pageKey,
      scopeKey: req.body.scopeKey || req.body.pageKey,
      referrer: req.body?.referrer || req.headers.referer || null,
      visitorId: req.analyticsVisitorId || null,
      userId: req.body.userId,
      sessionId: req.body.sessionId,
      userAgentHash: req.body.userAgentHash,
      ipHash: req.body.ipHash,
      isAdminArea: !!req.body.isAdminArea
    });
    return res.status(202).json({
      ok: true,
      visitorId: result.visitorId || req.analyticsVisitorId || ''
    });
  } catch (err) {
    console.error('analytics page view failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/admin/dashboard/summary', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    return await dashboardHandlers.summary(req, res);
  } catch (err) {
    console.error('dashboard summary failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/admin/dashboard/trends', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    return await dashboardHandlers.trends(req, res);
  } catch (err) {
    console.error('dashboard trends failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/admin/dashboard/rankings', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    return await dashboardHandlers.rankings(req, res);
  } catch (err) {
    console.error('dashboard rankings failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/admin/dashboard/realtime', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    return await dashboardHandlers.realtime(req, res);
  } catch (err) {
    console.error('dashboard realtime failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/admin/aeroplane-chess/overview', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const snapshot = aeroplaneChessPollingService.getAdminSnapshot();
    return res.json({ ok: true, overview: snapshot.overview, generatedAt: snapshot.generatedAt });
  } catch (err) {
    console.error('admin aeroplane chess overview failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/admin/aeroplane-chess/rooms', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const snapshot = aeroplaneChessPollingService.getAdminSnapshot();
    return res.json({ ok: true, rooms: snapshot.rooms, generatedAt: snapshot.generatedAt });
  } catch (err) {
    console.error('admin aeroplane chess rooms failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/admin/aeroplane-chess/history', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const rows = await queryRows(
      `
      SELECT id, room_code, game_session_id, winner_player, rankings_json, players_json, ended_at
      FROM aeroplane_chess_match_history
      ORDER BY ended_at DESC, id DESC
      LIMIT ?
      `,
      [limit]
    );
    return res.json({
      ok: true,
      history: rows.map((row) => ({
        id: Number(row.id),
        roomCode: row.room_code || '',
        gameSessionId: row.game_session_id || '',
        winnerPlayer: row.winner_player == null ? null : Number(row.winner_player),
        rankings: parseJsonMaybe(row.rankings_json, null),
        players: parseJsonMaybe(row.players_json, []),
        endedAt: row.ended_at
      }))
    });
  } catch (err) {
    console.error('admin aeroplane chess history failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.post('/api/admin/aeroplane-chess/rooms/:code/destroy', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const result = aeroplaneChessPollingService.destroyRoomForAdmin(req.params.code, 'admin_destroy');
    if (!result.ok) return res.status(404).json(result);
    return res.json(result);
  } catch (err) {
    console.error('admin aeroplane chess destroy room failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.post('/api/admin/aeroplane-chess/cleanup', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    return res.json(aeroplaneChessPollingService.cleanupRoomsForAdmin());
  } catch (err) {
    console.error('admin aeroplane chess cleanup failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/admin/governance/overview', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    return res.json(await governanceService.getOverview(admin));
  } catch (err) {
    console.error('governance overview failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.post('/api/admin/release-checks/run', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    return res.json({ check: await governanceService.runReleaseCheck(admin) });
  } catch (err) {
    console.error('release check run failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/admin/release-checks', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    return res.json(await governanceService.getReleaseChecks(req.query || {}));
  } catch (err) {
    console.error('release checks list failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/admin/audit-logs', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    return res.json(await governanceService.getAuditLogs(req.query || {}));
  } catch (err) {
    console.error('audit logs list failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/admin/risks', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    return res.json({ risks: await governanceService.getRisks(admin) });
  } catch (err) {
    console.error('governance risks failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const mode = getRegisterMode(req.body || {});
    const loginId = getLoginIdFromPayload(req.body || {});
    const password = String(req.body?.password || '');
    if (!loginId) return res.status(400).json({ error: 'USERNAME_RULE' });
    if (mode === 'strong' && !isValidStrongLoginId(loginId)) return res.status(400).json({ error: 'USERNAME_RULE' });
    if (mode === 'legacy' && !isValidLegacyLoginId(loginId)) return res.status(400).json({ error: 'USERNAME_RULE' });

    const pwdErr = getPasswordRuleError(password, mode);
    if (pwdErr) return res.status(400).json({ error: pwdErr });

    const exists = await queryOne('SELECT id FROM users WHERE login_id = ? LIMIT 1', [loginId]);
    if (exists) return res.status(409).json({ error: 'USERNAME_TAKEN' });

    let username = `user${loginId.slice(-4)}${crypto.randomInt(1000, 9999)}`.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 15);
    if (!username) username = `user${Date.now().toString().slice(-6)}`;
    let idx = 0;
    while (true) {
      const probe = idx === 0 ? username : `${username.slice(0, Math.max(1, 15 - String(idx).length))}${idx}`;
      const taken = await queryOne('SELECT id FROM users WHERE username = ? LIMIT 1', [probe]);
      if (!taken) { username = probe; break; }
      idx += 1;
      if (idx > 9999) { username = `user${Date.now().toString().slice(-8)}`; break; }
    }

    const isAdmin = isDefaultAdminLogin(loginId) ? 1 : 0;
    await runInTransaction(async (tx) => {
      const ret = await tx.execute(
        `
        INSERT INTO users
        (login_id, username, password_hash, is_admin, forum_publisher, is_banned, membership_status, username_change_remaining)
        VALUES (?, ?, ?, ?, 0, 0, 'none', 2)
        `,
        [loginId, username, hashPassword(password), isAdmin]
      );

      let newUserId = Number(ret && ret.insertId);
      if (!Number.isFinite(newUserId) || newUserId <= 0) {
        const created = await tx.queryOne('SELECT id FROM users WHERE login_id = ? LIMIT 1', [loginId]);
        newUserId = Number(created && created.id);
      }
      if (!Number.isFinite(newUserId) || newUserId <= 0) return;

      // 新注册用户自动关注指定账号（login_id/username 任一匹配）
      const targetKey = 'admin';
      const target = await tx.queryOne(
        'SELECT id FROM users WHERE login_id = ? OR username = ? LIMIT 1',
        [targetKey, targetKey]
      );
      const targetId = Number(target && target.id);
      if (!Number.isFinite(targetId) || targetId <= 0) return;
      if (targetId === newUserId) return;

      if (pgDatabase) {
        await tx.execute(
          `
          INSERT INTO user_follows (follower_id, following_id, created_at)
          VALUES ($1, $2, CURRENT_TIMESTAMP)
          ON CONFLICT (follower_id, following_id) DO NOTHING
          `,
          [newUserId, targetId]
        );
      } else {
        await tx.execute(
          `
          INSERT INTO user_follows (follower_id, following_id, created_at)
          VALUES (?, ?, CURRENT_TIMESTAMP(3))
          ON DUPLICATE KEY UPDATE created_at = created_at
          `,
          [newUserId, targetId]
        );
      }
    });
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error('register failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const loginId = getLoginIdFromPayload(req.body || {});
    const password = String(req.body?.password || '');
    if (!loginId || !password) return res.status(400).json({ error: 'INVALID_CREDENTIALS' });
    const user = await queryOne('SELECT * FROM users WHERE login_id = ? LIMIT 1', [loginId]);
    if (!user || !verifyPassword(password, user.password_hash)) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    if (Number(user.is_banned) === 1) return res.status(403).json({ error: 'BANNED' });
    const token = await createSession(user.id);
    res.cookie(SESSION_COOKIE_NAME, token, { httpOnly: true, sameSite: 'lax', secure: isHttpsRequest(req), maxAge: SESSION_TTL_MS, path: '/' });
    const fresh = await normalizeUserQuota(user.id);
    const payload = await attachFollowCountsToUserPayload(toUserPayload(fresh || user));
    return res.json({ ok: true, user: payload });
  } catch (err) {
    console.error('login failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const user = await currentUserFromRequest(req);
    if (!user) return res.json({ authenticated: false });
    const payload = await attachFollowCountsToUserPayload(toUserPayload(user));
    return res.json({ authenticated: true, user: payload });
  } catch (err) {
    console.error('auth me failed:', err);
    return res.status(500).json({ authenticated: false });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  await deleteSessionFromRequest(req);
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

const toolManagementHandlers = createToolManagementHandlers();

app.get('/api/tool-management', async (req, res) => {
  await toolManagementHandlers.getPublic(req, res);
});

app.get('/api/admin/tool-management', async (req, res) => {
  try {
    await toolManagementHandlers.getAdmin(req, res);
  } catch (err) {
    console.error('admin tool management get failed:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

async function updateToolManagement(req, res) {
  try {
    await toolManagementHandlers.saveAdmin(req, res);
  } catch (err) {
    console.error('admin tool management update failed:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

app.put('/api/admin/tool-management', updateToolManagement);
app.post('/api/admin/tool-management', updateToolManagement);

const toolAccessRequestHandlers = createToolAccessRequestHandlers();

app.post('/api/tool-access-requests', async (req, res) => {
  try {
    await toolAccessRequestHandlers.create(req, res);
  } catch (err) {
    console.error('tool access request create failed:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/tool-access-requests/mine', async (req, res) => {
  try {
    await toolAccessRequestHandlers.getMine(req, res);
  } catch (err) {
    console.error('tool access request mine failed:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/admin/tool-access-requests', async (req, res) => {
  try {
    await toolAccessRequestHandlers.listAdmin(req, res);
  } catch (err) {
    console.error('admin tool access requests get failed:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

async function resolveToolAccessRequest(req, res, action) {
  try {
    await toolAccessRequestHandlers.resolveAdmin(req, res, action);
  } catch (err) {
    console.error('admin tool access request resolve failed:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

app.post('/api/admin/tool-access-requests/:id/approve', (req, res) => resolveToolAccessRequest(req, res, 'approve'));
app.post('/api/admin/tool-access-requests/:id/reject', (req, res) => resolveToolAccessRequest(req, res, 'reject'));

app.get('/api/tool-access-agreement-notice', async (req, res) => {
  try {
    await toolAccessRequestHandlers.getNotice(req, res);
  } catch (err) {
    console.error('tool access agreement notice get failed:', err);
    res.json({ show: false });
  }
});

app.post('/api/tool-access-agreement-notice/ack', async (req, res) => {
  try {
    await toolAccessRequestHandlers.ackNotice(req, res);
  } catch (err) {
    console.error('tool access agreement notice ack failed:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/neighbor-progress', async (_req, res) => {
  try {
    const stored = await getSetting(NEIGHBOR_PROGRESS_SETTING_KEY, null);
    return res.json(normalizeNeighborProgressConfig(stored || defaultNeighborProgressConfig()));
  } catch (err) {
    console.error('neighbor progress get failed:', err);
    return res.json(defaultNeighborProgressConfig());
  }
});

app.get('/api/admin/neighbor-progress', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const stored = await getSetting(NEIGHBOR_PROGRESS_SETTING_KEY, null);
    return res.json(normalizeNeighborProgressConfig(stored || defaultNeighborProgressConfig()));
  } catch (err) {
    console.error('admin neighbor progress get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

async function updateNeighborProgress(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const normalized = normalizeNeighborProgressConfig(req.body || {});
  if (!normalized.stages.length && Array.isArray(req.body?.stages) && req.body.stages.length) {
    return res.status(400).json({ error: 'BAD_STAGES' });
  }
  const setting = { ...normalized, updatedAt: new Date().toISOString(), updatedBy: admin.username || admin.login_id || String(admin.id) };
  await setSetting(NEIGHBOR_PROGRESS_SETTING_KEY, setting);
  await auditAdminAction(req, { actor: admin, action: 'neighbor_progress.update', targetType: 'neighbor_progress', targetId: 'current', riskLevel: 'watch', summary: '更新邻邦进度配置', metadata: { stageCount: normalized.stages.length, intervalDays: normalized.intervalDays } });
  return res.json({ ok: true, ...normalized, updatedAt: setting.updatedAt, updatedBy: setting.updatedBy });
}

app.post('/api/admin/neighbor-progress', async (req, res) => {
  try { await updateNeighborProgress(req, res); }
  catch (err) { console.error('admin neighbor progress update failed:', err); res.status(500).json({ error: 'INTERNAL_ERROR' }); }
});
app.put('/api/admin/neighbor-progress', async (req, res) => {
  try { await updateNeighborProgress(req, res); }
  catch (err) { console.error('admin neighbor progress put failed:', err); res.status(500).json({ error: 'INTERNAL_ERROR' }); }
});

async function getHistoryImmigrationConfig() {
  const neighbor = normalizeNeighborProgressConfig(await getSetting(NEIGHBOR_PROGRESS_SETTING_KEY, null) || defaultNeighborProgressConfig());
  const stored = await getSetting(HISTORY_IMMIGRATION_SETTING_KEY, null);
  const source = stored || defaultHistoryImmigrationConfig();
  const normalized = normalizeHistoryImmigrationConfig(source, neighbor.ranges);
  // Older saved configurations predate the 2026-08-16 record. Backfill it so
  // the 1~13 range correctly shows the 12th-generation grouping (+1 display day).
  const latestDate = DEFAULT_HISTORY_IMMIGRATION_DATES[DEFAULT_HISTORY_IMMIGRATION_DATES.length - 1];
  if (stored && Array.isArray(stored.dates) && stored.dates.length >= DEFAULT_HISTORY_IMMIGRATION_DATES.length - 1 && !normalized.dates.some((item) => item.date === latestDate)) {
    normalized.dates.push({ date: latestDate, enabled: true, unopened: false, note: '', overrides: {} });
    normalized.dates.sort((a, b) => a.date.localeCompare(b.date));
  }
  return normalized;
}

app.get('/api/history-immigration', async (_req, res) => {
  try { return res.json(await getHistoryImmigrationConfig()); }
  catch (err) { console.error('history immigration get failed:', err); return res.json(defaultHistoryImmigrationConfig()); }
});

app.get('/api/admin/history-immigration', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    return res.json(await getHistoryImmigrationConfig());
  } catch (err) { console.error('admin history immigration get failed:', err); return res.status(500).json({ error: 'INTERNAL_ERROR' }); }
});

async function updateHistoryImmigration(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const neighbor = normalizeNeighborProgressConfig(await getSetting(NEIGHBOR_PROGRESS_SETTING_KEY, null) || defaultNeighborProgressConfig());
  const normalized = normalizeHistoryImmigrationConfig(req.body || {}, neighbor.ranges);
  const setting = { ...normalized, updatedAt: new Date().toISOString(), updatedBy: admin.username || admin.login_id || String(admin.id) };
  await setSetting(HISTORY_IMMIGRATION_SETTING_KEY, setting);
  await auditAdminAction(req, { actor: admin, action: 'history_immigration.update', targetType: 'history_immigration', targetId: 'current', riskLevel: 'watch', summary: '更新历史移民分组配置', metadata: { dateCount: normalized.dates.length, overrideCount: normalized.dates.reduce((sum, item) => sum + Object.keys(item.overrides).length, 0) } });
  return res.json({ ok: true, ...normalized, updatedAt: setting.updatedAt, updatedBy: setting.updatedBy });
}

app.post('/api/admin/history-immigration', async (req, res) => {
  try { await updateHistoryImmigration(req, res); } catch (err) { console.error('admin history immigration update failed:', err); res.status(500).json({ error: 'INTERNAL_ERROR' }); }
});
app.put('/api/admin/history-immigration', async (req, res) => {
  try { await updateHistoryImmigration(req, res); } catch (err) { console.error('admin history immigration put failed:', err); res.status(500).json({ error: 'INTERNAL_ERROR' }); }
});

app.get('/api/site-footer', async (_req, res) => {
  try {
    return res.json({ siteFooter: await getSiteFooterSetting() });
  } catch (err) {
    console.error('site footer get failed:', err);
    return res.json({ siteFooter: { credits: DEFAULT_SITE_FOOTER_CREDITS, updatedAt: null, updatedBy: null } });
  }
});

app.get('/api/admin/site-footer', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    return res.json({ siteFooter: await getSiteFooterSetting() });
  } catch (err) {
    console.error('admin site footer get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

async function updateSiteFooter(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const normalized = normalizeSiteFooterCredits(req.body || {});
  if (normalized.error) return res.status(400).json({ error: normalized.error });
  const siteFooter = {
    credits: normalized.credits,
    updatedAt: new Date().toISOString(),
    updatedBy: admin.username || admin.login_id || String(admin.id)
  };
  await setSetting('site_footer', siteFooter);
  await auditAdminAction(req, {
    actor: admin,
    action: 'site_footer.update',
    targetType: 'site_footer',
    targetId: 'current',
    riskLevel: 'watch',
    summary: '更新底部致谢内容',
    metadata: { length: normalized.credits.length }
  });
  return res.json({ ok: true, siteFooter });
}

app.put('/api/admin/site-footer', async (req, res) => {
  try { await updateSiteFooter(req, res); } catch (err) { console.error('admin site footer put failed:', err); res.status(500).json({ error: 'INTERNAL_ERROR' }); }
});

app.post('/api/admin/site-footer', async (req, res) => {
  try { await updateSiteFooter(req, res); } catch (err) { console.error('admin site footer post failed:', err); res.status(500).json({ error: 'INTERNAL_ERROR' }); }
});

app.get('/api/legal-notice', async (_req, res) => {
  try {
    const docs = await getLegalDocsState();
    return res.json({ notice: toPublicNotice(docs) });
  } catch (err) {
    console.error('legal notice get failed:', err);
    return res.json({ notice: toPublicNotice(loadDefaultsFromLegalDir(LEGAL_DIR)) });
  }
});

app.post('/api/legal-notice/ack', async (req, res) => {
  try {
    const docs = await getLegalDocsState();
    const version = String((req.body && req.body.version) || '').trim().slice(0, 32);
    if (!version || version !== String(docs.version || '')) {
      return res.json({ ok: true, counted: false });
    }
    const user = await currentUserFromRequest(req);
    const recorded = await recordLegalNoticeAck(
      version,
      req.analyticsVisitorId,
      user && user.id
    );
    return res.json({ ok: true, counted: !!recorded.counted });
  } catch (err) {
    console.error('legal notice ack failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/admin/legal-docs', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const legalDocs = await getLegalDocsState();
    return res.json({
      legalDocs,
      ackCount: await countLegalNoticeAcks(legalDocs.version)
    });
  } catch (err) {
    console.error('admin legal docs get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

async function saveLegalDocs(req, res, publish) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const actorName = admin.username || admin.login_id || String(admin.id);
  const current = await getLegalDocsState();
  const applied = applyAdminPayload(current, req.body || {}, {
    publish: !!publish,
    actorName,
    defaults: loadDefaultsFromLegalDir(LEGAL_DIR)
  });
  if (applied.error) return res.status(400).json({ error: applied.error });
  await setSetting(LEGAL_DOCS_SETTING_KEY, applied.docs);
  if (publish) {
    try {
      writeLegalHtmlFiles(LEGAL_DIR, applied.docs);
    } catch (err) {
      console.error('legal html write failed:', err);
      return res.status(500).json({ error: 'WRITE_FAILED' });
    }
  }
  await auditAdminAction(req, {
    actor: admin,
    action: publish ? 'legal_docs.publish' : 'legal_docs.save',
    targetType: 'legal_docs',
    targetId: String(applied.docs.version || 'current'),
    riskLevel: 'watch',
    summary: publish ? '发布用户协议与隐私政策更新' : '保存用户协议与隐私政策草稿',
    metadata: { version: applied.docs.version, publish: !!publish }
  });
  return res.json({
    ok: true,
    legalDocs: applied.docs,
    ackCount: await countLegalNoticeAcks(applied.docs.version)
  });
}

app.put('/api/admin/legal-docs', async (req, res) => {
  try { await saveLegalDocs(req, res, false); } catch (err) { console.error('admin legal docs put failed:', err); res.status(500).json({ error: 'INTERNAL_ERROR' }); }
});

app.post('/api/admin/legal-docs', async (req, res) => {
  try { await saveLegalDocs(req, res, false); } catch (err) { console.error('admin legal docs post failed:', err); res.status(500).json({ error: 'INTERNAL_ERROR' }); }
});

app.post('/api/admin/legal-docs/publish', async (req, res) => {
  try { await saveLegalDocs(req, res, true); } catch (err) { console.error('admin legal docs publish failed:', err); res.status(500).json({ error: 'INTERNAL_ERROR' }); }
});

app.get('/api/admin/tool-access-agreement', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const agreement = await getToolAccessAgreementState();
    return res.json({
      agreement,
      ackCount: await countToolAccessAgreementAcks(agreement.version)
    });
  } catch (err) {
    console.error('admin tool access agreement get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

async function saveToolAccessAgreement(req, res, publish) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const actorName = admin.username || admin.login_id || String(admin.id);
  const current = await getToolAccessAgreementState();
  const applied = applyToolAccessAgreementPayload(current, req.body || {}, {
    publish: !!publish,
    actorName,
    defaults: loadToolAccessAgreementDefault(LEGAL_DIR)
  });
  if (applied.error) return res.status(400).json({ error: applied.error });
  await setSetting(TOOL_ACCESS_AGREEMENT_SETTING_KEY, applied.doc);
  if (publish) {
    try {
      writeToolAccessAgreementHtmlFile(LEGAL_DIR, applied.doc);
    } catch (err) {
      console.error('tool access agreement html write failed:', err);
      return res.status(500).json({ error: 'WRITE_FAILED' });
    }
  }
  await auditAdminAction(req, {
    actor: admin,
    action: publish ? 'tool_access_agreement.publish' : 'tool_access_agreement.save',
    targetType: 'tool_access_agreement',
    targetId: String(applied.doc.version || 'current'),
    riskLevel: 'watch',
    summary: publish ? '发布功能申请协议更新' : '保存功能申请协议草稿',
    metadata: { version: applied.doc.version, publish: !!publish }
  });
  return res.json({
    ok: true,
    agreement: applied.doc,
    ackCount: await countToolAccessAgreementAcks(applied.doc.version)
  });
}

app.put('/api/admin/tool-access-agreement', async (req, res) => {
  try { await saveToolAccessAgreement(req, res, false); } catch (err) { console.error('admin tool access agreement put failed:', err); res.status(500).json({ error: 'INTERNAL_ERROR' }); }
});

app.post('/api/admin/tool-access-agreement', async (req, res) => {
  try { await saveToolAccessAgreement(req, res, false); } catch (err) { console.error('admin tool access agreement post failed:', err); res.status(500).json({ error: 'INTERNAL_ERROR' }); }
});

app.post('/api/admin/tool-access-agreement/publish', async (req, res) => {
  try { await saveToolAccessAgreement(req, res, true); } catch (err) { console.error('admin tool access agreement publish failed:', err); res.status(500).json({ error: 'INTERNAL_ERROR' }); }
});

const handleProfileUpdate = async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    const body = req.body || {};
    const hasUsername = Object.prototype.hasOwnProperty.call(body, 'username');
    const hasBio = Object.prototype.hasOwnProperty.call(body, 'bio');
    const hasGender = Object.prototype.hasOwnProperty.call(body, 'gender');
    const hasBirthday = Object.prototype.hasOwnProperty.call(body, 'birthday');
    const hasBirthdayPublic = Object.prototype.hasOwnProperty.call(body, 'birthdayPublic');
    if (!hasUsername && !hasBio && !hasGender && !hasBirthday && !hasBirthdayPublic) {
      const payload = await attachFollowCountsToUserPayload(toUserPayload(user));
      return res.json({ ok: true, user: payload });
    }

    const updates = [];
    const params = [];

    if (hasGender) {
      const nextGender = normalizeGenderValue(body.gender);
      if (!GENDER_VALUES.has(nextGender)) return res.status(400).json({ error: 'BAD_GENDER' });
      updates.push('gender = ?');
      params.push(nextGender);
    }

    if (hasBirthday) {
      const birthdayParsed = parseBirthdayInput(body.birthday);
      if (!birthdayParsed.ok) return res.status(400).json({ error: birthdayParsed.error || 'BAD_BIRTHDAY' });
      if (birthdayParsed.value === null) {
        updates.push('birthday = NULL');
      } else {
        updates.push('birthday = ?');
        params.push(birthdayParsed.value);
      }
    }

    if (hasBirthdayPublic) {
      updates.push('birthday_public = ?');
      params.push(body.birthdayPublic ? 1 : 0);
    }

    if (hasBio) {
      const nextBio = normalizeProfileBio(body.bio);
      if (nextBio === null) return res.status(400).json({ error: 'BAD_BIO' });
      updates.push('bio = ?');
      params.push(nextBio || DEFAULT_PROFILE_BIO);
    }

    if (hasUsername) {
      const nextName = String(body.username || '').trim();
      if (!isValidDisplayName(nextName)) return res.status(400).json({ error: 'BAD_NAME' });
      if (nextName !== String(user.username || '')) {
        const taken = await queryOne('SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1', [nextName, user.id]);
        if (taken) return res.status(409).json({ error: 'USERNAME_TAKEN' });

        const fresh = await normalizeUserQuota(user.id);
        let remaining = Number.isFinite(Number(fresh?.username_change_remaining)) ? Number(fresh.username_change_remaining) : 2;
        let nextAt = fresh?.username_change_next_at || null;
        if (nextAt && new Date(nextAt).getTime() <= Date.now()) { remaining = 2; nextAt = null; }
        if (remaining <= 0) {
          if (!nextAt) nextAt = firstDayOfNextMonthIso();
          return res.status(429).json({ error: 'TOO_SOON', nextAt });
        }
        remaining -= 1;
        if (remaining <= 0) nextAt = firstDayOfNextMonthIso();

        updates.push('username = ?');
        params.push(nextName);
        updates.push('username_change_remaining = ?');
        params.push(remaining);
        updates.push('username_change_next_at = ?');
        params.push(nextAt ? formatSqlDateTime(nextAt) : null);
        updates.push('username_changed_at = CURRENT_TIMESTAMP(3)');
      }
    }

    if (!updates.length) {
      const payload = await attachFollowCountsToUserPayload(toUserPayload(user));
      return res.json({ ok: true, user: payload });
    }

    params.push(user.id);
    await execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    const updated = await queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [user.id]);
    const payload = await attachFollowCountsToUserPayload(toUserPayload(updated));
    return res.json({ ok: true, user: payload });
  } catch (err) {
    console.error('profile patch failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
};

app.patch('/api/profile', handleProfileUpdate);
app.post('/api/profile', handleProfileUpdate);

app.post('/api/profile/avatar', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    const nextTs = user.avatar_next_at ? new Date(user.avatar_next_at).getTime() : NaN;
    if (Number.isFinite(nextTs) && nextTs > Date.now()) return res.status(429).json({ error: 'TOO_SOON', nextAt: new Date(nextTs).toISOString() });
    const dataUrl = String(req.body?.imageDataUrl || '');
    const info = parseDataUrlSize(dataUrl);
    if (!info.ok || info.bytes <= 0 || info.bytes > 2 * 1024 * 1024) return res.status(400).json({ error: 'BAD_IMAGE' });
    const avatarUrl = await saveAvatarDataUrlToFile(user.id, dataUrl);
    const updatedAt = new Date();
    const nextAt = new Date(updatedAt.getTime() + AVATAR_COOLDOWN_MS);
    await execute(
      'UPDATE users SET avatar_url = ?, avatar_updated_at = ?, avatar_next_at = ? WHERE id = ?',
      [avatarUrl, formatSqlDateTime(updatedAt), formatSqlDateTime(nextAt), user.id]
    );
    return res.json({ ok: true, avatarUrl, updatedAt: updatedAt.toISOString(), nextAt: nextAt.toISOString() });
  } catch (err) {
    console.error('avatar post failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/users/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 40);
    if (!q) return res.json({ ok: true, users: [] });
    const rows = await queryRows(
      `
      SELECT id,username,avatar_url,membership_status,membership_expires_at,title_text,title_bg_color,title_color
      FROM users
      WHERE COALESCE(is_banned, 0) = 0
        AND username IS NOT NULL
        AND LOWER(username) LIKE ?
      ORDER BY CASE WHEN LOWER(username) = ? THEN 0 ELSE 1 END, username ASC, id ASC
      LIMIT 10
      `,
      [`%${q.toLowerCase()}%`, q.toLowerCase()]
    );
    return res.json({
      ok: true,
      users: rows.map((row) => {
        const membershipStatus = normalizeMembershipStatus(row.membership_status);
        const membershipExpiresAt = row.membership_expires_at || null;
        return {
          id: Number(row.id),
          username: String(row.username || `用户${row.id}`),
          avatarUrl: row.avatar_url || null,
          membershipStatus,
          membershipExpiresAt,
          titleText: String(row.title_text || '').trim(),
          titleBgColor: normalizeHexColor(row.title_bg_color),
          titleColor: normalizeHexColor(row.title_color),
          isVip: hasVipMembership(membershipStatus, membershipExpiresAt)
        };
      })
    });
  } catch (err) {
    console.error('user search failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/users/:id/profile', async (req, res) => {
  try {
    const current = await currentUserFromRequest(req);
    const currentUserId = current ? Number(current.id) : 0;
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(400).json({ error: 'BAD_ID' });
    const profile = await getUserPublicProfileById(userId, currentUserId);
    if (!profile) return res.status(404).json({ error: 'NOT_FOUND' });
    return res.json({ ok: true, profile });
  } catch (err) {
    console.error('user profile get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/users/:id/posts', async (req, res) => {
  try {
    const current = await currentUserFromRequest(req);
    const currentUserId = current ? Number(current.id) : 0;
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(400).json({ error: 'BAD_ID' });
    const exists = await queryOne('SELECT id FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!exists) return res.status(404).json({ error: 'NOT_FOUND' });
    const rows = await queryRows(
      `
      SELECT
        p.*,
        u.id AS author_id,u.login_id AS author_login_id,u.username AS author_username,u.avatar_url AS author_avatar_url,u.membership_status AS author_membership_status,u.membership_expires_at AS author_membership_expires_at,u.title_text AS author_title_text,u.title_bg_color AS author_title_bg_color,u.title_color AS author_title_color,u.is_banned AS author_is_banned,u.muted_until AS author_muted_until,
        ${FORUM_VISIBLE_VIEW_COUNT_EXPR('p')} AS viewCount,
        ${FORUM_VISIBLE_VIEW_COUNT_EXPR('p')} AS viewCount,
        (SELECT COUNT(*) FROM forum_post_likes l WHERE l.post_id = p.id) AS likeCount,
        (SELECT COUNT(*) FROM forum_post_favorites f WHERE f.post_id = p.id) AS favoriteCount,
        (SELECT COUNT(*) FROM forum_comments c WHERE c.post_id = p.id) AS commentCount,
        (SELECT COUNT(*) FROM forum_post_likes me WHERE me.post_id = p.id AND me.user_id = ?) AS likedByMe,
        (SELECT COUNT(*) FROM forum_post_favorites mf WHERE mf.post_id = p.id AND mf.user_id = ?) AS favoritedByMe
      FROM forum_posts p
      INNER JOIN users u ON u.id = p.author_id
      WHERE p.status = 'approved' AND p.author_id = ?
      ORDER BY p.is_pinned DESC, p.created_at DESC, p.id DESC
      LIMIT 200
      `,
      [currentUserId, currentUserId, userId]
    );
    return res.json({ ok: true, posts: rows.map((r) => toForumPostDto(r, currentUserId || null)) });
  } catch (err) {
    console.error('user posts get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/me/likes', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    const currentUserId = Number(user.id);
    const rows = await queryRows(
      `
      SELECT
        p.*,
        u.id AS author_id,u.login_id AS author_login_id,u.username AS author_username,u.avatar_url AS author_avatar_url,u.membership_status AS author_membership_status,u.membership_expires_at AS author_membership_expires_at,u.title_text AS author_title_text,u.title_bg_color AS author_title_bg_color,u.title_color AS author_title_color,u.is_banned AS author_is_banned,u.muted_until AS author_muted_until,
        ${FORUM_VISIBLE_VIEW_COUNT_EXPR('p')} AS viewCount,
        (SELECT COUNT(*) FROM forum_post_likes l WHERE l.post_id = p.id) AS likeCount,
        (SELECT COUNT(*) FROM forum_post_favorites f WHERE f.post_id = p.id) AS favoriteCount,
        (SELECT COUNT(*) FROM forum_comments c WHERE c.post_id = p.id) AS commentCount,
        1 AS likedByMe,
        (SELECT COUNT(*) FROM forum_post_favorites mf WHERE mf.post_id = p.id AND mf.user_id = ?) AS favoritedByMe
      FROM forum_post_likes my
      INNER JOIN forum_posts p ON p.id = my.post_id
      INNER JOIN users u ON u.id = p.author_id
      WHERE my.user_id = ? AND p.status = 'approved'
      ORDER BY my.created_at DESC, my.id DESC
      LIMIT 500
      `,
      [currentUserId, currentUserId]
    );
    return res.json({ ok: true, posts: rows.map((r) => toForumPostDto(r, currentUserId)) });
  } catch (err) {
    console.error('me likes get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/me/favorites', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    const currentUserId = Number(user.id);
    const rows = await queryRows(
      `
      SELECT
        p.*,
        u.id AS author_id,u.login_id AS author_login_id,u.username AS author_username,u.avatar_url AS author_avatar_url,u.membership_status AS author_membership_status,u.membership_expires_at AS author_membership_expires_at,u.title_text AS author_title_text,u.title_bg_color AS author_title_bg_color,u.title_color AS author_title_color,u.is_banned AS author_is_banned,u.muted_until AS author_muted_until,
        ${FORUM_VISIBLE_VIEW_COUNT_EXPR('p')} AS viewCount,
        (SELECT COUNT(*) FROM forum_post_likes l WHERE l.post_id = p.id) AS likeCount,
        (SELECT COUNT(*) FROM forum_post_favorites f WHERE f.post_id = p.id) AS favoriteCount,
        (SELECT COUNT(*) FROM forum_comments c WHERE c.post_id = p.id) AS commentCount,
        (SELECT COUNT(*) FROM forum_post_likes me WHERE me.post_id = p.id AND me.user_id = ?) AS likedByMe,
        1 AS favoritedByMe
      FROM forum_post_favorites my
      INNER JOIN forum_posts p ON p.id = my.post_id
      INNER JOIN users u ON u.id = p.author_id
      WHERE my.user_id = ? AND p.status = 'approved'
      ORDER BY my.created_at DESC, my.id DESC
      LIMIT 500
      `,
      [currentUserId, currentUserId]
    );
    return res.json({ ok: true, posts: rows.map((r) => toForumPostDto(r, currentUserId)) });
  } catch (err) {
    console.error('me favorites get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * 聊天等接口路径不含「当前登录用户」，同一 URL（如 `/api/chat/users/5/messages`）对不同账号应返回不同内容。
 * 若中间代理 / CDN / 浏览器对 GET 做「仅按 URL」缓存且未区分 Cookie，会出现 A 的响应被拿去给 B 的严重串号问题。
 */
function applyAuthenticatedApiNoStoreHeaders(req, res, next) {
  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
}
app.use('/api/chat', applyAuthenticatedApiNoStoreHeaders);
app.use('/api/me', applyAuthenticatedApiNoStoreHeaders);

async function getChatDirectionCounts(dbApi, uid, peerId) {
  const row = await dbApi.queryOne(
    `
    SELECT
      SUM(CASE WHEN sender_id = ? AND receiver_id = ? THEN 1 ELSE 0 END) AS incoming_count,
      SUM(CASE WHEN sender_id = ? AND receiver_id = ? THEN 1 ELSE 0 END) AS outgoing_count
    FROM chat_messages
    WHERE (sender_id = ? AND receiver_id = ?)
       OR (sender_id = ? AND receiver_id = ?)
    `,
    [peerId, uid, uid, peerId, peerId, uid, uid, peerId]
  );
  return {
    incomingCount: Math.max(0, Number(row?.incoming_count || 0)),
    outgoingCount: Math.max(0, Number(row?.outgoing_count || 0))
  };
}

app.get('/api/chat/conversations', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    const uid = Number(user.id);
    const rows = await queryRows(
      `
      SELECT
        c.peer_id,
        c.last_at,
        u.login_id,u.username,u.avatar_url,u.membership_status,u.membership_expires_at,u.title_text,u.title_bg_color,u.title_color,
        (SELECT m2.content
         FROM chat_messages m2
         WHERE (m2.sender_id = ? AND m2.receiver_id = c.peer_id)
            OR (m2.sender_id = c.peer_id AND m2.receiver_id = ?)
         ORDER BY m2.created_at DESC, m2.id DESC
         LIMIT 1) AS last_content,
        (SELECT COUNT(*) FROM user_follows f WHERE f.follower_id = ? AND f.following_id = c.peer_id) AS iFollow,
        (SELECT COUNT(*) FROM user_follows f WHERE f.follower_id = c.peer_id AND f.following_id = ?) AS followsMe,
        (SELECT COUNT(*)
         FROM chat_messages mu
         WHERE mu.sender_id = c.peer_id
           AND mu.receiver_id = ?
           AND mu.created_at > COALESCE(
             (SELECT rs.read_at
              FROM chat_read_states rs
              WHERE rs.user_id = ? AND rs.peer_id = c.peer_id
              LIMIT 1),
             '1970-01-01 00:00:00'
           )
        ) AS unread_count
      FROM (
        SELECT
          CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END AS peer_id,
          MAX(m.created_at) AS last_at
        FROM chat_messages m
        WHERE m.sender_id = ? OR m.receiver_id = ?
        GROUP BY peer_id
      ) c
      INNER JOIN users u ON u.id = c.peer_id
      ORDER BY c.last_at DESC, c.peer_id DESC
      LIMIT 200
      `,
      [uid, uid, uid, uid, uid, uid, uid, uid, uid]
    );
    const conversations = rows.map((row) => {
      const iFollow = Number(row.iFollow || 0) > 0;
      const followsMe = Number(row.followsMe || 0) > 0;
      const membershipStatus = normalizeMembershipStatus(row.membership_status);
      const membershipExpiresAt = row.membership_expires_at || null;
      return {
        peerId: Number(row.peer_id),
        peer: {
          id: Number(row.peer_id),
          loginId: row.login_id,
          username: row.username || row.login_id,
          avatarUrl: row.avatar_url || null,
          membershipStatus,
          membershipExpiresAt,
          titleText: String(row.title_text || '').trim(),
          titleBgColor: normalizeHexColor(row.title_bg_color),
          titleColor: normalizeHexColor(row.title_color),
          isVip: hasVipMembership(membershipStatus, membershipExpiresAt)
        },
        lastAt: row.last_at || null,
        lastContent: String(row.last_content || ''),
        unreadCount: Math.max(0, Number(row.unread_count || 0)),
        iFollow,
        followsMe,
        mutualFollow: iFollow && followsMe
      };
    });
    return res.json({ ok: true, conversations });
  } catch (err) {
    console.error('chat conversations get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/chat/users/:id/messages', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    const uid = Number(user.id);
    const peerId = Number(req.params.id);
    if (!Number.isFinite(peerId) || peerId <= 0 || peerId === uid) return res.status(400).json({ error: 'BAD_ID' });
    const exists = await queryOne('SELECT id FROM users WHERE id = ? LIMIT 1', [peerId]);
    if (!exists) return res.status(404).json({ error: 'NOT_FOUND' });
    const relation = await getFollowRelation(uid, peerId);
    const directionCounts = await getChatDirectionCounts({ queryOne }, uid, peerId);
    if (!canReadChatThread({ ...relation, ...directionCounts })) {
      return res.status(403).json({ error: 'CHAT_FOLLOW_REQUIRED' });
    }
    const readPolicy = getChatSendPolicy({ ...relation, ...directionCounts });
    relation.canSend = readPolicy.allowed;
    relation.chatEstablished = readPolicy.established;
    const rows = await queryRows(
      `
      SELECT id,sender_id,receiver_id,content,created_at
      FROM chat_messages
      WHERE (sender_id = ? AND receiver_id = ?)
         OR (sender_id = ? AND receiver_id = ?)
      ORDER BY created_at DESC, id DESC
      LIMIT 200
      `,
      [uid, peerId, peerId, uid]
    );
    const incomingRow = await queryOne(
      `
      SELECT MAX(created_at) AS last_incoming_at
      FROM chat_messages
      WHERE sender_id = ? AND receiver_id = ?
      `,
      [peerId, uid]
    );
    if (incomingRow?.last_incoming_at) {
      const incomingAt = new Date(incomingRow.last_incoming_at);
      if (!Number.isFinite(incomingAt.getTime())) {
        // 若数据库驱动返回了不可解析的时间字符串，跳过已读更新，避免 500。
        const messages = rows.reverse().map((row) => toChatMessageDto(row, uid));
        return res.json({ ok: true, relation, messages });
      }
      // 兼容 MySQL 与 PostgreSQL：手动实现「若存在则只在较晚时间时更新，否则插入」的语义，
      // 避免使用 MySQL 专有的 ON DUPLICATE KEY 语法导致 PG 报错。
      await runInTransaction(async (tx) => {
        const updated = await tx.execute(
          `
          UPDATE chat_read_states
          SET read_at = GREATEST(read_at, ?)
          WHERE user_id = ? AND peer_id = ?
          `,
          [incomingAt, uid, peerId]
        );
        if (!updated || Number(updated.affectedRows || 0) === 0) {
          await tx.execute(
            `
            INSERT INTO chat_read_states (user_id, peer_id, read_at)
            VALUES (?, ?, ?)
            `,
            [uid, peerId, incomingAt]
          );
        }
      });
    }
    const messages = rows.reverse().map((row) => toChatMessageDto(row, uid));
    return res.json({ ok: true, relation, messages });
  } catch (err) {
    console.error('chat messages get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.post('/api/chat/users/:id/messages', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    const uid = Number(user.id);
    const peerId = Number(req.params.id);
    if (!Number.isFinite(peerId) || peerId <= 0 || peerId === uid) return res.status(400).json({ error: 'BAD_ID' });
    const exists = await queryOne('SELECT id FROM users WHERE id = ? LIMIT 1', [peerId]);
    if (!exists) return res.status(404).json({ error: 'NOT_FOUND' });
    const content = String(req.body?.content || '').trim();
    if (!content) return res.status(400).json({ error: 'EMPTY_CONTENT' });
    if (content.length > 1000) return res.status(400).json({ error: 'CONTENT_TOO_LONG' });

    const lockKey = [uid, peerId].sort((a, b) => a - b).join(':');
    return await runChatSendSerial(lockKey, async () => {
      const relation = await getFollowRelation(uid, peerId);
      const directionCounts = await getChatDirectionCounts({ queryOne }, uid, peerId);
      const policy = getChatSendPolicy({ ...relation, ...directionCounts });
      if (!policy.allowed) return res.status(403).json({ error: 'CHAT_FOLLOW_REQUIRED' });

      if (policy.limit === 'minute') {
        const row = await queryOne(
          `
          SELECT COUNT(*) AS c
          FROM chat_messages
          WHERE sender_id = ? AND receiver_id = ?
            AND created_at >= ?
          `,
          [uid, peerId, new Date(Date.now() - 60 * 1000)]
        );
        if (Number(row?.c || 0) >= 10) {
          return res.status(429).json({ error: 'CHAT_RATE_LIMIT', limit: 10, windowSeconds: 60 });
        }
      } else {
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const row = await queryOne(
          `
          SELECT COUNT(*) AS c
          FROM chat_messages
          WHERE sender_id = ? AND receiver_id = ?
            AND created_at >= ?
          `,
          [uid, peerId, dayStart]
        );
        if (Number(row?.c || 0) >= 1) {
          return res.status(429).json({ error: 'CHAT_DAILY_LIMIT', limit: 1, period: 'day' });
        }
      }

      let created = null;
      if (pgDatabase) {
        created = await queryOne(
          `
          INSERT INTO chat_messages (sender_id, receiver_id, content, created_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP(3))
          RETURNING id,sender_id,receiver_id,content,created_at
          `,
          [uid, peerId, content]
        );
      } else {
        const ret = await execute(
          'INSERT INTO chat_messages (sender_id, receiver_id, content, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP(3))',
          [uid, peerId, content]
        );
        created = await queryOne(
          'SELECT id,sender_id,receiver_id,content,created_at FROM chat_messages WHERE id = ? LIMIT 1',
          [ret.insertId]
        );
      }
      if (!created) return res.status(500).json({ error: 'INTERNAL_ERROR' });
      relation.canSend = true;
      relation.chatEstablished = policy.established || (directionCounts.incomingCount > 0);
      return res.status(201).json({ ok: true, relation, message: toChatMessageDto(created, uid) });
    });
  } catch (err) {
    console.error('chat message post failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/users/:id/following', async (req, res) => {
  try {
    const current = await requireAuth(req, res);
    if (!current) return;
    const currentUserId = Number(current.id);
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(400).json({ error: 'BAD_ID' });
    if (currentUserId !== userId) return res.status(403).json({ error: 'FORBIDDEN' });
    const exists = await queryOne('SELECT id FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!exists) return res.status(404).json({ error: 'NOT_FOUND' });
    const rows = await queryRows(
      `
      SELECT
        u.id,u.login_id,u.username,u.avatar_url,u.membership_status,u.membership_expires_at,u.title_text,u.title_bg_color,u.title_color,u.gender,u.birthday,u.birthday_public,u.created_at,
        (SELECT COUNT(*) FROM user_follows f2 WHERE f2.follower_id = u.id) AS followingCount,
        (SELECT COUNT(*) FROM user_follows f2 WHERE f2.following_id = u.id) AS followerCount,
        (SELECT COUNT(*) FROM user_follows f2 WHERE f2.follower_id = ? AND f2.following_id = u.id) AS iFollow,
        (SELECT COUNT(*) FROM user_follows f2 WHERE f2.follower_id = u.id AND f2.following_id = ?) AS followsMe
      FROM user_follows f
      INNER JOIN users u ON u.id = f.following_id
      WHERE f.follower_id = ?
      ORDER BY f.created_at DESC, u.id DESC
      LIMIT 500
      `,
      [currentUserId, currentUserId, userId]
    );
    return res.json({ ok: true, users: rows.map((r) => toPublicUserProfile(r, currentUserId)) });
  } catch (err) {
    console.error('user following get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/users/:id/followers', async (req, res) => {
  try {
    const current = await requireAuth(req, res);
    if (!current) return;
    const currentUserId = Number(current.id);
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(400).json({ error: 'BAD_ID' });
    if (currentUserId !== userId) return res.status(403).json({ error: 'FORBIDDEN' });
    const exists = await queryOne('SELECT id FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!exists) return res.status(404).json({ error: 'NOT_FOUND' });
    const rows = await queryRows(
      `
      SELECT
        u.id,u.login_id,u.username,u.avatar_url,u.membership_status,u.membership_expires_at,u.title_text,u.title_bg_color,u.title_color,u.gender,u.birthday,u.birthday_public,u.created_at,
        (SELECT COUNT(*) FROM user_follows f2 WHERE f2.follower_id = u.id) AS followingCount,
        (SELECT COUNT(*) FROM user_follows f2 WHERE f2.following_id = u.id) AS followerCount,
        (SELECT COUNT(*) FROM user_follows f2 WHERE f2.follower_id = ? AND f2.following_id = u.id) AS iFollow,
        (SELECT COUNT(*) FROM user_follows f2 WHERE f2.follower_id = u.id AND f2.following_id = ?) AS followsMe
      FROM user_follows f
      INNER JOIN users u ON u.id = f.follower_id
      WHERE f.following_id = ?
      ORDER BY f.created_at DESC, u.id DESC
      LIMIT 500
      `,
      [currentUserId, currentUserId, userId]
    );
    return res.json({ ok: true, users: rows.map((r) => toPublicUserProfile(r, currentUserId)) });
  } catch (err) {
    console.error('user followers get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.post('/api/users/:id/follow', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    const targetId = Number(req.params.id);
    if (!Number.isFinite(targetId) || targetId <= 0) return res.status(400).json({ error: 'BAD_ID' });
    if (targetId === Number(user.id)) return res.status(400).json({ error: 'BAD_TARGET' });
    const exists = await queryOne('SELECT id FROM users WHERE id = ? LIMIT 1', [targetId]);
    if (!exists) return res.status(404).json({ error: 'NOT_FOUND' });
    const followerId = Number(user.id);
    await runInTransaction(async (tx) => {
      const updated = await tx.execute(
        `
        UPDATE user_follows
        SET created_at = created_at
        WHERE follower_id = ? AND following_id = ?
        `,
        [followerId, targetId]
      );
      if (!updated || Number(updated.affectedRows || 0) === 0) {
        await tx.execute(
          `
          INSERT INTO user_follows (follower_id, following_id, created_at)
          VALUES (?, ?, CURRENT_TIMESTAMP(3))
          `,
          [followerId, targetId]
        );
      }
    });
    return res.json({ ok: true, following: true });
  } catch (err) {
    console.error('user follow post failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.delete('/api/users/:id/follow', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    const targetId = Number(req.params.id);
    if (!Number.isFinite(targetId) || targetId <= 0) return res.status(400).json({ error: 'BAD_ID' });
    if (targetId === Number(user.id)) return res.status(400).json({ error: 'BAD_TARGET' });
    await execute('DELETE FROM user_follows WHERE follower_id = ? AND following_id = ?', [Number(user.id), targetId]);
    return res.json({ ok: true, following: false });
  } catch (err) {
    console.error('user follow delete failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

require('./mini-program-promotion').registerMiniProgramPromotion(app, {
  getSetting, setSetting, requireAdmin, auditAdminAction
});

function normalizeStoredAnnouncement(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return { ...raw, enabled: raw.enabled !== false };
}
app.get('/api/announcement', async (_req, res) => {
  try {
    const normalizedAnnouncement = normalizeStoredAnnouncement(await getSetting('announcement', null));
    return res.json({ announcement: normalizedAnnouncement && normalizedAnnouncement.enabled ? normalizedAnnouncement : null });
  } catch (err) {
    console.error('announcement get failed:', err);
    return res.status(500).json({ announcement: null });
  }
});

app.get('/api/admin/announcement', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    return res.json({ announcement: normalizeStoredAnnouncement(await getSetting('announcement', null)) });
  } catch (err) {
    console.error('admin announcement get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.post('/api/admin/announcement/images', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const dataUrl = String(req.body?.dataUrl || '').trim();
    const info = parseDataUrlSize(dataUrl);
    if (!info.ok || info.bytes <= 0 || info.bytes > 3 * 1024 * 1024) return res.status(400).json({ error: 'BAD_IMAGE' });
    const url = await saveForumImageDataUrlToFile(admin.id, dataUrl);
    return res.status(201).json({ ok: true, url });
  } catch (err) {
    console.error('announcement image upload failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

async function upsertAnnouncement(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const title = String(req.body?.title || '').trim() || '系统公告';
  const content = String(req.body?.content || '').trim();
  const contentHtmlRaw = String(req.body?.contentHtml || '').trim();
  const contentHtml = sanitizeAnnouncementHtml(contentHtmlRaw || (content ? escapeHtml(content).replace(/\n/g, '<br>') : ''));
  const contentText = String(req.body?.contentText || '').trim() || String(content || '').trim() || String(contentHtml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!contentHtml) return res.status(400).json({ error: 'EMPTY_CONTENT' });
  if (contentHtml.length > 12000) return res.status(400).json({ error: 'CONTENT_TOO_LONG' });
  const announcement = {
    id: `${Date.now()}_${crypto.randomInt(100, 999)}`,
    enabled: req.body?.enabled !== false,
    title: title.slice(0, 120),
    // 兼容旧前端：保留 content（纯文本）
    content: contentText.slice(0, 4000),
    contentText: contentText.slice(0, 4000),
    contentHtml,
    publishedAt: new Date().toISOString(),
    publisherUsername: admin.username,
    publisherLoginId: admin.login_id
  };
  await setSetting('announcement', announcement);
  await auditAdminAction(req, {
    actor: admin,
    action: 'announcement.publish',
    targetType: 'announcement',
    targetId: String(announcement.id || 'current'),
    riskLevel: 'watch',
    summary: `发布公告：${announcement.title}`,
    metadata: { title: announcement.title }
  });
  return res.json({ ok: true, announcement });
}

app.put('/api/admin/announcement', async (req, res) => {
  try { await upsertAnnouncement(req, res); } catch (err) { console.error('announcement put failed:', err); res.status(500).json({ error: 'INTERNAL_ERROR' }); }
});

app.post('/api/admin/announcement', async (req, res) => {
  try { await upsertAnnouncement(req, res); } catch (err) { console.error('announcement post failed:', err); res.status(500).json({ error: 'INTERNAL_ERROR' }); }
});

app.get('/api/home-lead', async (_req, res) => {
  try {
    const stored = await getSetting(HOME_LEAD_SETTING_KEY, null);
    const publisher = await getPublisherAds();
    return res.json({
      ...normalizeHomeLeadCarousel(stored),
      adEnabled: publisher.homeAdEnabled,
      homeAdEnabled: publisher.homeAdEnabled,
      forumAdEnabled: publisher.forumAdEnabled,
      toolAdEnabled: publisher.toolAdEnabled,
      rangeAdEnabled: publisher.toolAdEnabled
    });
  } catch (err) {
    console.error('home-lead get failed:', err);
    return res.json({
      ...defaultHomeLeadCarousel(),
      adEnabled: true,
      homeAdEnabled: true,
      forumAdEnabled: true,
      toolAdEnabled: true,
      rangeAdEnabled: true
    });
  }
});

app.get('/api/publisher', async (_req, res) => {
  try {
    return res.json(await getPublisherAds());
  } catch (err) {
    console.error('publisher get failed:', err);
    return res.json(defaultPublisherAds());
  }
});

app.get('/api/admin/publisher', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    return res.json(await getPublisherAds());
  } catch (err) {
    console.error('admin publisher get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.put('/api/admin/publisher', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const normalized = normalizePublisherAds(req.body);
    await setSetting(PUBLISHER_ADS_SETTING_KEY, normalized);
    await auditAdminAction(req, {
      actor: admin,
      action: 'publisher.update',
      targetType: 'publisher_ads',
      targetId: 'current',
      riskLevel: 'watch',
      summary: `更新流量主广告位（首页${normalized.homeAdEnabled ? '开' : '关'} / 帖子页${normalized.forumAdEnabled ? '开' : '关'} / 工具页${normalized.toolAdEnabled ? '开' : '关'}）`,
      metadata: {
        homeAdEnabled: normalized.homeAdEnabled,
        forumAdEnabled: normalized.forumAdEnabled,
        toolAdEnabled: normalized.toolAdEnabled,
        rangeAdEnabled: normalized.toolAdEnabled
      }
    });
    return res.json({ ok: true, publisher: normalized });
  } catch (err) {
    console.error('admin publisher put failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

const publisherForumStats = createPublisherForumStatsService({
  queryRows,
  queryOne,
  execute,
  getSetting,
  setSetting,
  likeOp: pgDatabase ? 'ILIKE' : 'LIKE'
});

app.get('/api/admin/publisher/forum-views', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    return res.json(await publisherForumStats.getAuthorViewStats(req.query || {}));
  } catch (err) {
    console.error('admin publisher forum-views failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/admin/home-lead', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const stored = await getSetting(HOME_LEAD_SETTING_KEY, null);
    return res.json(normalizeHomeLeadCarousel(stored));
  } catch (err) {
    console.error('admin home-lead get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.put('/api/admin/home-lead', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const normalized = normalizeHomeLeadCarousel(req.body);
    await setSetting(HOME_LEAD_SETTING_KEY, normalized);
    await auditAdminAction(req, {
      actor: admin,
      action: 'home_lead.publish',
      targetType: 'home_lead_carousel',
      targetId: 'current',
      riskLevel: 'watch',
      summary: `更新首页活动横幅（轮播${normalized.enabled ? '开' : '关'}，${normalized.slides.length} 张）`,
      metadata: { slideCount: normalized.slides.length, enabled: normalized.enabled }
    });
    return res.json({ ok: true, homeLead: normalized });
  } catch (err) {
    console.error('admin home-lead put failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.post('/api/user-voices', async (req, res) => {
  try {
    const user = await currentUserFromRequest(req);
    const userId = user ? Number(user.id) : null;
    const contact = String(req.body?.contact || '').trim().slice(0, 64);
    const content = String(req.body?.content || '').trim();
    if (!content) return res.status(400).json({ error: 'EMPTY_CONTENT' });
    if (content.length > 1000) return res.status(400).json({ error: 'CONTENT_TOO_LONG' });
    const ret = await execute('INSERT INTO user_voices (user_id, contact, content) VALUES (?, ?, ?)', [userId, contact, content]);
    return res.status(201).json({ ok: true, id: Number(ret.insertId) });
  } catch (err) {
    console.error('user voices post failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/admin/user-voices', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const takeRaw = Number(req.query.take || 100);
    const take = Math.max(1, Math.min(500, Number.isFinite(takeRaw) ? takeRaw : 100));
    const rows = await queryRows(
      `
      SELECT v.id,v.contact,v.content,v.created_at,u.id AS user_id,u.login_id AS user_login_id,u.username AS user_username
      FROM user_voices v
      LEFT JOIN users u ON u.id = v.user_id
      ORDER BY v.created_at DESC, v.id DESC
      LIMIT ?
      `,
      [take]
    );
    return res.json({
      voices: rows.map((r) => ({
        id: Number(r.id),
        contact: r.contact || '',
        content: r.content || '',
        createdAt: r.created_at,
        user: r.user_id ? { id: Number(r.user_id), loginId: r.user_login_id, username: r.user_username } : null
      }))
    });
  } catch (err) {
    console.error('admin user voices get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/forum/posts', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Vary', 'Cookie');
    const current = await currentUserFromRequest(req);
    const currentUserId = current ? Number(current.id) : null;
    const section = String(req.query.section || '').trim();
    const pageRaw = Number(req.query.page || 1);
    const pageSizeRaw = Number(req.query.pageSize || 10);
    const page = Math.max(1, Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 1);
    const pageSize = Math.max(1, Math.min(50, Number.isFinite(pageSizeRaw) ? Math.floor(pageSizeRaw) : 10));
    const offset = (page - 1) * pageSize;
    const searchQ = String(req.query.q || req.query.search || '').trim().slice(0, 80);
    const where = ['p.status = \'approved\''];
    const params = [];
    if (section === 'migration') {
      const placeholders = MIGRATION_GROUP_SECTIONS.map(() => '?').join(',');
      where.push(`p.section IN (${placeholders})`);
      params.push(...MIGRATION_GROUP_SECTIONS);
    } else if (section && section !== 'all' && FORUM_SECTIONS.has(section)) {
      where.push('p.section = ?');
      params.push(section);
    }
    if (searchQ) {
      const like = `%${searchQ.replace(/[%_]/g, ' ').trim()}%`;
      const likeOp = pgDatabase ? 'ILIKE' : 'LIKE';
      where.push(`(p.title ${likeOp} ? OR p.contentText ${likeOp} ? OR p.contentHtml ${likeOp} ? OR u.username ${likeOp} ?)`);
      params.push(like, like, like, like);
    }
    const totalRow = await queryOne(
      `
      SELECT COUNT(*) AS total
      FROM forum_posts p
      INNER JOIN users u ON u.id = p.author_id
      WHERE ${where.join(' AND ')}
      `,
      params
    );
    const total = Math.max(0, Number(totalRow?.total || 0));
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const safeOffset = (safePage - 1) * pageSize;
    const rows = await queryRows(
      `
      SELECT
        p.*,
        u.id AS author_id,u.login_id AS author_login_id,u.username AS author_username,u.avatar_url AS author_avatar_url,u.membership_status AS author_membership_status,u.membership_expires_at AS author_membership_expires_at,u.title_text AS author_title_text,u.title_bg_color AS author_title_bg_color,u.title_color AS author_title_color,u.is_banned AS author_is_banned,u.muted_until AS author_muted_until,
        ${FORUM_VISIBLE_VIEW_COUNT_EXPR('p')} AS viewCount,
        (SELECT COUNT(*) FROM forum_post_likes l WHERE l.post_id = p.id) AS likeCount,
        (SELECT COUNT(*) FROM forum_post_favorites f WHERE f.post_id = p.id) AS favoriteCount,
        (SELECT COUNT(*) FROM forum_comments c WHERE c.post_id = p.id) AS commentCount,
        ${currentUserId ? '(SELECT COUNT(*) FROM forum_post_likes me WHERE me.post_id = p.id AND me.user_id = ?) AS likedByMe' : '0 AS likedByMe'},
        ${currentUserId ? '(SELECT COUNT(*) FROM forum_post_favorites mf WHERE mf.post_id = p.id AND mf.user_id = ?) AS favoritedByMe' : '0 AS favoritedByMe'}
      FROM forum_posts p
      INNER JOIN users u ON u.id = p.author_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.is_pinned DESC, p.created_at DESC, p.id DESC
      LIMIT ? OFFSET ?
      `,
      currentUserId ? [currentUserId, currentUserId, ...params, pageSize, safeOffset] : [...params, pageSize, safeOffset]
    );
    return res.json({
      posts: rows.map((r) => toForumPostListDto(r, currentUserId)),
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages,
        hasPrev: safePage > 1,
        hasNext: safePage < totalPages
      }
    });
  } catch (err) {
    console.error('forum posts get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.post('/api/forum/posts', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!(await assertCanPost(user, res))) return;
    const section = String(req.body?.section || '').trim();
    const title = String(req.body?.title || '').trim();
    const type = String(req.body?.type || 'article').trim() === 'image' ? 'image' : 'article';
    let contentText = String(req.body?.contentText || '').trim();
    let contentHtml = String(req.body?.contentHtml || '').trim();
    let coverImage = req.body?.coverImage || null;
    if (!FORUM_SECTIONS.has(section)) return res.status(400).json({ error: 'BAD_SECTION' });
    if (ADMIN_ONLY_SECTIONS.has(section) && !isModerator(user)) return res.status(403).json({ error: 'FORBIDDEN' });
    if (!title || title.length > 120) return res.status(400).json({ error: 'BAD_TITLE' });
    if (type === 'image') {
      if (!contentText) contentText = String(contentHtml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!contentText) return res.status(400).json({ error: 'EMPTY_CONTENT' });
      const rawImages = parseCoverImageInput(coverImage);
      const images = [];
      for (const v of rawImages) {
        const s = String(v || '').trim();
        if (!s) continue;
        if (/^data:image\//i.test(s)) {
          images.push(await saveForumImageDataUrlToFile(user.id, s));
          continue;
        }
        if (s.startsWith('/') || /^https?:\/\//i.test(s)) images.push(s);
      }
      if (!images.length) return res.status(400).json({ error: 'NO_IMAGE' });
      coverImage = images.length === 1 ? images[0] : JSON.stringify(images);
    } else {
      if (!contentHtml) return res.status(400).json({ error: 'EMPTY_CONTENT' });
      coverImage = null;
    }
    contentHtml = sanitizeForumPostHtml(contentHtml);
    if (type !== 'image' && !String(contentHtml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) {
      return res.status(400).json({ error: 'EMPTY_CONTENT' });
    }
    if (contentHtml.length > 20000) return res.status(400).json({ error: 'CONTENT_TOO_LONG' });
    const autoApprove = await getForumAutoApprove();
    const approved = isModerator(user) || autoApprove;
    let newPostId = 0;
    if (pgDatabase) {
      const inserted = await queryOne(
        `
        INSERT INTO forum_posts
        (section,type,title,contentText,contentHtml,coverImage,status,approved_at,approved_by,is_pinned,author_id)
        VALUES (?,?,?,?,?,?,?,?,?,0,?)
        RETURNING id
        `,
        [section, type, title, contentText || null, contentHtml || null, coverImage, approved ? 'approved' : 'pending', approved ? formatSqlDateTime(new Date()) : null, approved ? Number(user.id) : null, Number(user.id)]
      );
      newPostId = Number(inserted?.id || 0);
    } else {
      const ret = await execute(
        `
        INSERT INTO forum_posts
        (section,type,title,contentText,contentHtml,coverImage,status,approved_at,approved_by,is_pinned,author_id)
        VALUES (?,?,?,?,?,?,?,?,?,0,?)
        `,
        [section, type, title, contentText || null, contentHtml || null, coverImage, approved ? 'approved' : 'pending', approved ? formatSqlDateTime(new Date()) : null, approved ? Number(user.id) : null, Number(user.id)]
      );
      newPostId = Number(ret?.insertId || 0);
    }
    if (!Number.isFinite(newPostId) || newPostId <= 0) throw new Error('FORUM_POST_INSERT_FAILED');
    const row = await getPostById(newPostId);
    return res.status(201).json({ ok: true, post: toForumPostDto(row, Number(user.id)) });
  } catch (err) {
    console.error('forum post create failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

const handleForumPostUpdate = async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!(await assertCanPost(user, res))) return;
    const postId = Number(req.params.id);
    if (!Number.isFinite(postId) || postId <= 0) return res.status(400).json({ error: 'BAD_ID' });
    const current = await getPostById(postId);
    if (!current) return res.status(404).json({ error: 'NOT_FOUND' });
    const canModerate = isModerator(user);
    if (!canModerate && Number(current.author_id) !== Number(user.id)) return res.status(403).json({ error: 'FORBIDDEN' });

    const section = String(req.body?.section || current.section || '').trim();
    const title = String(req.body?.title || '').trim();
    const type = String(req.body?.type || current.type || 'article').trim() === 'image' ? 'image' : 'article';
    let contentText = String(req.body?.contentText || '').trim();
    let contentHtml = String(req.body?.contentHtml || '').trim();
    let coverImage = req.body?.coverImage || null;
    if (!FORUM_SECTIONS.has(section)) return res.status(400).json({ error: 'BAD_SECTION' });
    if (ADMIN_ONLY_SECTIONS.has(section) && !canModerate) return res.status(403).json({ error: 'FORBIDDEN' });
    if (!title || title.length > 120) return res.status(400).json({ error: 'BAD_TITLE' });
    if (type === 'image') {
      if (!contentText) contentText = String(contentHtml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!contentText) return res.status(400).json({ error: 'EMPTY_CONTENT' });
      const rawImages = parseCoverImageInput(coverImage);
      const images = [];
      for (const v of rawImages) {
        const s = String(v || '').trim();
        if (!s) continue;
        if (/^data:image\//i.test(s)) {
          images.push(await saveForumImageDataUrlToFile(user.id, s));
          continue;
        }
        if (s.startsWith('/') || /^https?:\/\//i.test(s)) images.push(s);
      }
      if (!images.length) return res.status(400).json({ error: 'NO_IMAGE' });
      coverImage = images.length === 1 ? images[0] : JSON.stringify(images);
    } else {
      if (!contentHtml) return res.status(400).json({ error: 'EMPTY_CONTENT' });
      coverImage = null;
    }
    contentHtml = sanitizeForumPostHtml(contentHtml);
    if (type !== 'image' && !String(contentHtml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) {
      return res.status(400).json({ error: 'EMPTY_CONTENT' });
    }
    if (contentHtml.length > 20000) return res.status(400).json({ error: 'CONTENT_TOO_LONG' });
    const autoApprove = await getForumAutoApprove();
    const approved = canModerate || autoApprove;
    await execute(
      `
      UPDATE forum_posts
      SET section=?,type=?,title=?,contentText=?,contentHtml=?,coverImage=?,status=?,approved_at=?,approved_by=?
      WHERE id=?
      `,
      [section, type, title, contentText || null, contentHtml || null, coverImage, approved ? 'approved' : 'pending', approved ? formatSqlDateTime(new Date()) : null, approved ? Number(user.id) : null, postId]
    );
    const row = await getPostById(postId);
    return res.json({ ok: true, post: toForumPostDto(row, Number(user.id)) });
  } catch (err) {
    console.error('forum post update failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
};
app.patch('/api/forum/posts/:id', handleForumPostUpdate);
app.post('/api/forum/posts/:id/update', handleForumPostUpdate);

async function recordForumPostQualifiedRead(req, row, postId) {
  const mayCount =
    row.status === 'approved' ||
    !!(req && req._forumReadCurrent && (isModerator(req._forumReadCurrent) || Number(req._forumReadCurrent.id) === Number(row.author_id)));
  if (!mayCount) return { recorded: false, viewCount: Math.max(0, Number(row.viewCount || 0)) };
  const current = req._forumReadCurrent || null;
  return applyQualifiedForumRead({
    queryOne,
    execute,
    buildForumViewRows,
    pgDatabase
  }, {
    postId,
    visitorId: req.analyticsVisitorId || '',
    userId: current ? Number(current.id) : null,
    isAuthor: !!(current && Number(current.id) === Number(row.author_id)),
    isAdmin: !!(current && current.isAdmin)
  });
}

app.get('/api/forum/posts/:id/read', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
    const current = await currentUserFromRequest(req);
    const postId = Number(req.params.id);
    if (!Number.isFinite(postId) || postId <= 0) return res.status(400).json({ error: 'BAD_ID' });
    const row = await queryOne(
      `SELECT id, author_id, status, ${FORUM_VISIBLE_VIEW_COUNT_EXPR('p')} AS viewCount FROM forum_posts p WHERE p.id = ? LIMIT 1`,
      [postId]
    );
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    if (row.status !== 'approved') {
      const canView = current && (isModerator(current) || Number(current.id) === Number(row.author_id));
      if (!canView) return res.status(404).json({ error: 'NOT_FOUND' });
    }
    req._forumReadCurrent = current;
    const counted = await recordForumPostQualifiedRead(req, row, postId);
    return res.json({ ok: true, recorded: !!counted.recorded, viewCount: counted.viewCount });
  } catch (err) {
    console.error('forum post read failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/forum/posts/:id', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Vary', 'Cookie');
    const current = await currentUserFromRequest(req);
    const currentUserId = current ? Number(current.id) : null;
    const postId = Number(req.params.id);
    if (!Number.isFinite(postId) || postId <= 0) return res.status(400).json({ error: 'BAD_ID' });
    const row = await queryOne(
      `
      SELECT
        p.*,
        u.id AS author_id,u.login_id AS author_login_id,u.username AS author_username,u.avatar_url AS author_avatar_url,u.membership_status AS author_membership_status,u.membership_expires_at AS author_membership_expires_at,u.title_text AS author_title_text,u.title_bg_color AS author_title_bg_color,u.title_color AS author_title_color,u.is_banned AS author_is_banned,u.muted_until AS author_muted_until,
        ${FORUM_VISIBLE_VIEW_COUNT_EXPR('p')} AS viewCount,
        (SELECT COUNT(*) FROM forum_post_likes l WHERE l.post_id = p.id) AS likeCount,
        (SELECT COUNT(*) FROM forum_post_favorites f WHERE f.post_id = p.id) AS favoriteCount,
        (SELECT COUNT(*) FROM forum_comments c WHERE c.post_id = p.id) AS commentCount,
        ${currentUserId ? '(SELECT COUNT(*) FROM user_follows af WHERE af.follower_id = ? AND af.following_id = u.id) AS authorIFollow' : '0 AS authorIFollow'},
        ${currentUserId ? '(SELECT COUNT(*) FROM forum_post_likes me WHERE me.post_id = p.id AND me.user_id = ?) AS likedByMe' : '0 AS likedByMe'},
        ${currentUserId ? '(SELECT COUNT(*) FROM forum_post_favorites mf WHERE mf.post_id = p.id AND mf.user_id = ?) AS favoritedByMe' : '0 AS favoritedByMe'}
      FROM forum_posts p
      INNER JOIN users u ON u.id = p.author_id
      WHERE p.id = ?
      LIMIT 1
      `,
      currentUserId ? [currentUserId, currentUserId, currentUserId, postId] : [postId]
    );
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    if (row.status !== 'approved') {
      const canView = current && (isModerator(current) || Number(current.id) === Number(row.author_id));
      if (!canView) return res.status(404).json({ error: 'NOT_FOUND' });
    }
    // IIS/部分代理对 POST /api/** 转发不完整时会导致「只看 GET、不计浏览」。改用 GET + incrementView=1（与其它详情请求同一路径）。
    // 评论后刷新详情勿带 incrementView，避免发一条评也算一次阅读。
    const incRaw = String(req.query.incrementView || '').trim().toLowerCase();
    const shouldIncrementView = incRaw === '1' || incRaw === 'true';
    if (shouldIncrementView) {
      req._forumReadCurrent = current;
      const counted = await recordForumPostQualifiedRead(req, row, postId);
      if (counted && counted.viewCount != null) row.viewCount = counted.viewCount;
    }
    return res.json({ post: toForumPostDto(row, currentUserId), comments: await getCommentsByPostId(postId) });
  } catch (err) {
    console.error('forum post detail failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.delete('/api/forum/posts/:id', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    const postId = Number(req.params.id);
    if (!Number.isFinite(postId) || postId <= 0) return res.status(400).json({ error: 'BAD_ID' });
    const post = await queryOne('SELECT id,author_id FROM forum_posts WHERE id = ? LIMIT 1', [postId]);
    if (!post) return res.status(404).json({ error: 'NOT_FOUND' });
    if (!isModerator(user) && Number(post.author_id) !== Number(user.id)) return res.status(403).json({ error: 'FORBIDDEN' });
    await execute('DELETE FROM forum_comments WHERE post_id = ?', [postId]);
    await execute('DELETE FROM forum_post_likes WHERE post_id = ?', [postId]);
    await execute('DELETE FROM forum_post_favorites WHERE post_id = ?', [postId]);
    await execute('DELETE FROM forum_post_views WHERE post_id = ?', [postId]);
    await execute('DELETE FROM forum_post_reads WHERE post_id = ?', [postId]);
    await execute('DELETE FROM forum_posts WHERE id = ?', [postId]);
    if (isModerator(user)) {
      await auditAdminAction(req, {
        actor: user,
        action: 'forum.post.delete',
        targetType: 'forum_post',
        targetId: String(postId),
        riskLevel: 'danger',
        summary: `删除帖子 #${postId}`,
        metadata: { postId, authorId: Number(post.author_id) }
      });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('forum post delete failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.post('/api/forum/comments', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!(await assertCanPost(user, res))) return;
    const postId = Number(req.body?.postId);
    const content = String(req.body?.content || '').trim();
    const replyToCommentId = req.body?.replyToCommentId ? Number(req.body.replyToCommentId) : null;
    if (!Number.isFinite(postId) || postId <= 0) return res.status(400).json({ error: 'BAD_POST_ID' });
    if (!content) return res.status(400).json({ error: 'EMPTY_CONTENT' });
    const post = await queryOne('SELECT id,status FROM forum_posts WHERE id = ? LIMIT 1', [postId]);
    if (!post) return res.status(404).json({ error: 'POST_NOT_FOUND' });
    if (post.status !== 'approved') return res.status(403).json({ error: 'POST_NOT_APPROVED' });
    let replyId = null;
    if (Number.isFinite(replyToCommentId) && replyToCommentId > 0) {
      const parent = await queryOne('SELECT id FROM forum_comments WHERE id = ? AND post_id = ? LIMIT 1', [replyToCommentId, postId]);
      if (parent) replyId = Number(parent.id);
    }
    let newCommentId = 0;
    if (pgDatabase) {
      const inserted = await queryOne(
        'INSERT INTO forum_comments (post_id,author_id,content,reply_to_comment_id,is_pinned) VALUES (?,?,?,?,0) RETURNING id',
        [postId, Number(user.id), content, replyId]
      );
      newCommentId = Number(inserted?.id || 0);
    } else {
      const ret = await execute(
        'INSERT INTO forum_comments (post_id,author_id,content,reply_to_comment_id,is_pinned) VALUES (?,?,?,?,0)',
        [postId, Number(user.id), content, replyId]
      );
      newCommentId = Number(ret?.insertId || 0);
    }
    if (!Number.isFinite(newCommentId) || newCommentId <= 0) throw new Error('FORUM_COMMENT_INSERT_FAILED');
    const created = await queryOne(
      `
      SELECT
        c.*,
        u.login_id AS author_login_id,u.username AS author_username,u.avatar_url AS author_avatar_url,u.membership_status AS author_membership_status,u.membership_expires_at AS author_membership_expires_at,u.title_text AS author_title_text,u.title_bg_color AS author_title_bg_color,u.title_color AS author_title_color,u.is_banned AS author_is_banned,u.muted_until AS author_muted_until,
        ru.id AS reply_author_id,ru.login_id AS reply_author_login_id,ru.username AS reply_author_username,ru.avatar_url AS reply_author_avatar_url,ru.membership_status AS reply_author_membership_status,ru.membership_expires_at AS reply_author_membership_expires_at,ru.title_text AS reply_author_title_text,ru.title_bg_color AS reply_author_title_bg_color,ru.title_color AS reply_author_title_color
      FROM forum_comments c
      INNER JOIN users u ON u.id = c.author_id
      LEFT JOIN forum_comments rc ON rc.id = c.reply_to_comment_id
      LEFT JOIN users ru ON ru.id = rc.author_id
      WHERE c.id = ?
      LIMIT 1
      `,
      [newCommentId]
    );
    return res.status(201).json({ ok: true, comment: toForumCommentDto(created) });
  } catch (err) {
    console.error('forum comment post failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.delete('/api/forum/comments/:id', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    const commentId = Number(req.params.id);
    if (!Number.isFinite(commentId) || commentId <= 0) return res.status(400).json({ error: 'BAD_ID' });
    const row = await queryOne(
      `
      SELECT c.id,c.post_id,c.author_id,p.author_id AS post_author_id
      FROM forum_comments c
      INNER JOIN forum_posts p ON p.id = c.post_id
      WHERE c.id = ?
      LIMIT 1
      `,
      [commentId]
    );
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    const allowed = isModerator(user) || Number(row.author_id) === Number(user.id) || Number(row.post_author_id) === Number(user.id);
    if (!allowed) return res.status(403).json({ error: 'FORBIDDEN' });
    await execute('DELETE FROM forum_comments WHERE id = ?', [commentId]);
    const c = await queryOne('SELECT COUNT(*) AS c FROM forum_comments WHERE post_id = ?', [row.post_id]);
    return res.json({ ok: true, commentCount: Number(c?.c || 0) });
  } catch (err) {
    console.error('forum comment delete failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

const handleForumCommentPin = async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    const commentId = Number(req.params.id);
    if (!Number.isFinite(commentId) || commentId <= 0) return res.status(400).json({ error: 'BAD_ID' });
    const row = await queryOne(
      `
      SELECT c.id,c.is_pinned,p.author_id AS post_author_id
      FROM forum_comments c
      INNER JOIN forum_posts p ON p.id = c.post_id
      WHERE c.id = ?
      LIMIT 1
      `,
      [commentId]
    );
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    const canPin = Number(user.is_admin) === 1 || Number(user.id) === Number(row.post_author_id);
    if (!canPin) return res.status(403).json({ error: 'FORBIDDEN' });
    const next = Number(row.is_pinned) === 1 ? 0 : 1;
    await execute('UPDATE forum_comments SET is_pinned = ? WHERE id = ?', [next, commentId]);
    return res.json({ ok: true, isPinned: next === 1 });
  } catch (err) {
    console.error('forum comment pin failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
};
app.patch('/api/forum/comments/:id/pin', handleForumCommentPin);
app.post('/api/forum/comments/:id/pin', handleForumCommentPin);

app.post('/api/forum/posts/:id/like', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    const postId = Number(req.params.id);
    if (!Number.isFinite(postId) || postId <= 0) return res.status(400).json({ error: 'BAD_ID' });
    const post = await queryOne('SELECT id,status FROM forum_posts WHERE id = ? LIMIT 1', [postId]);
    if (!post) return res.status(404).json({ error: 'NOT_FOUND' });
    if (post.status !== 'approved') return res.status(403).json({ error: 'FORBIDDEN' });
    const hit = await queryOne('SELECT id FROM forum_post_likes WHERE post_id = ? AND user_id = ? LIMIT 1', [postId, user.id]);
    let liked = false;
    if (hit) {
      await execute('DELETE FROM forum_post_likes WHERE id = ?', [hit.id]);
    } else {
      await execute('INSERT INTO forum_post_likes (post_id,user_id) VALUES (?,?)', [postId, user.id]);
      liked = true;
    }
    const c = await queryOne('SELECT COUNT(*) AS c FROM forum_post_likes WHERE post_id = ?', [postId]);
    return res.json({ liked, likeCount: Number(c?.c || 0) });
  } catch (err) {
    console.error('forum like failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.post('/api/forum/posts/:id/favorite', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    const postId = Number(req.params.id);
    if (!Number.isFinite(postId) || postId <= 0) return res.status(400).json({ error: 'BAD_ID' });
    const post = await queryOne('SELECT id,status FROM forum_posts WHERE id = ? LIMIT 1', [postId]);
    if (!post) return res.status(404).json({ error: 'NOT_FOUND' });
    if (post.status !== 'approved') return res.status(403).json({ error: 'FORBIDDEN' });
    const hit = await queryOne('SELECT id FROM forum_post_favorites WHERE post_id = ? AND user_id = ? LIMIT 1', [postId, user.id]);
    let favorited = false;
    if (hit) {
      await execute('DELETE FROM forum_post_favorites WHERE id = ?', [hit.id]);
    } else {
      await execute('INSERT INTO forum_post_favorites (post_id,user_id) VALUES (?,?)', [postId, user.id]);
      favorited = true;
    }
    const c = await queryOne('SELECT COUNT(*) AS c FROM forum_post_favorites WHERE post_id = ?', [postId]);
    return res.json({ favorited, favoriteCount: Number(c?.c || 0) });
  } catch (err) {
    console.error('forum favorite failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

const handleForumPostPin = async (req, res) => {
  try {
    const mod = await requireModerator(req, res);
    if (!mod) return;
    const postId = Number(req.params.id);
    if (!Number.isFinite(postId) || postId <= 0) return res.status(400).json({ error: 'BAD_ID' });
    const pinned = !!req.body?.pinned;
    const ret = await execute('UPDATE forum_posts SET is_pinned = ? WHERE id = ?', [pinned ? 1 : 0, postId]);
    if (!Number(ret.affectedRows)) return res.status(404).json({ error: 'NOT_FOUND' });
    return res.json({ ok: true, pinned });
  } catch (err) {
    console.error('forum post pin failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
};
app.patch('/api/forum/posts/:id/pin', handleForumPostPin);
app.post('/api/forum/posts/:id/pin', handleForumPostPin);

app.get('/api/admin/forum/settings', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    return res.json({ autoApprove: await getForumAutoApprove() });
  } catch (err) {
    console.error('forum settings get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

const handleAdminForumSettingsUpdate = async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const autoApprove = !!req.body?.autoApprove;
    await setForumAutoApprove(autoApprove);
    return res.json({ ok: true, autoApprove });
  } catch (err) {
    console.error('forum settings patch failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
};

app.patch('/api/admin/forum/settings', handleAdminForumSettingsUpdate);
app.post('/api/admin/forum/settings', handleAdminForumSettingsUpdate);

app.get('/api/admin/forum/pending', async (req, res) => {
  try {
    const mod = await requireModerator(req, res);
    if (!mod) return;
    const statusRaw = String(req.query.status || 'pending').trim().toLowerCase();
    const status = (statusRaw === 'approved' || statusRaw === 'all') ? statusRaw : 'pending';
    const where = status === 'all' ? 'p.status <> \'rejected\'' : 'p.status = ?';
    const params = status === 'all' ? [] : [status];
    const rows = await queryRows(
      `
      SELECT
        p.*,
        u.id AS author_id,u.login_id AS author_login_id,u.username AS author_username,u.avatar_url AS author_avatar_url,u.membership_status AS author_membership_status,u.membership_expires_at AS author_membership_expires_at,u.title_text AS author_title_text,u.title_bg_color AS author_title_bg_color,u.title_color AS author_title_color,u.is_banned AS author_is_banned,u.muted_until AS author_muted_until,
        ${FORUM_VISIBLE_VIEW_COUNT_EXPR('p')} AS viewCount,
        (SELECT COUNT(*) FROM forum_post_likes l WHERE l.post_id = p.id) AS likeCount,
        (SELECT COUNT(*) FROM forum_post_favorites f WHERE f.post_id = p.id) AS favoriteCount,
        (SELECT COUNT(*) FROM forum_comments c WHERE c.post_id = p.id) AS commentCount,
        0 AS likedByMe,
        0 AS favoritedByMe
      FROM forum_posts p
      INNER JOIN users u ON u.id = p.author_id
      WHERE ${where}
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT 300
      `
      ,
      params
    );
    return res.json({ posts: rows.map((r) => toForumPostDto(r, null)) });
  } catch (err) {
    console.error('forum pending get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/admin/forum/posts', async (req, res) => {
  try {
    const mod = await requireModerator(req, res);
    if (!mod) return;
    const section = String(req.query.section || '').trim();
    const where = ["p.status <> 'rejected'"];
    const params = [];
    if (section === 'migration') {
      const placeholders = MIGRATION_GROUP_SECTIONS.map(() => '?').join(',');
      where.push(`p.section IN (${placeholders})`);
      params.push(...MIGRATION_GROUP_SECTIONS);
    } else if (section && FORUM_SECTIONS.has(section)) {
      where.push('p.section = ?');
      params.push(section);
    }
    const rows = await queryRows(
      `
      SELECT
        p.*,
        u.id AS author_id,u.login_id AS author_login_id,u.username AS author_username,u.avatar_url AS author_avatar_url,u.membership_status AS author_membership_status,u.membership_expires_at AS author_membership_expires_at,u.title_text AS author_title_text,u.title_bg_color AS author_title_bg_color,u.title_color AS author_title_color,u.is_banned AS author_is_banned,u.muted_until AS author_muted_until,
        (SELECT COUNT(*) FROM forum_post_likes l WHERE l.post_id = p.id) AS likeCount,
        (SELECT COUNT(*) FROM forum_post_favorites f WHERE f.post_id = p.id) AS favoriteCount,
        (SELECT COUNT(*) FROM forum_comments c WHERE c.post_id = p.id) AS commentCount,
        0 AS likedByMe,
        0 AS favoritedByMe
      FROM forum_posts p
      INNER JOIN users u ON u.id = p.author_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT 500
      `,
      params
    );
    return res.json({
      posts: rows.map((r) => {
        const p = toForumPostDto(r, null);
        p.contentPreview = (p.contentText || toPlainSummary(p)).slice(0, 240);
        p.previewOnly = true;
        return p;
      })
    });
  } catch (err) {
    console.error('admin forum posts get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

const handleAdminForumPostReview = async (req, res) => {
  try {
    const mod = await requireModerator(req, res);
    if (!mod) return;
    const postId = Number(req.params.id);
    const action = String(req.body?.action || '').trim();
    if (!Number.isFinite(postId) || postId <= 0) return res.status(400).json({ error: 'BAD_ID' });
    if (action !== 'approve' && action !== 'reject') return res.status(400).json({ error: 'BAD_ACTION' });
    if (action === 'approve') {
      await execute('UPDATE forum_posts SET status = \'approved\', approved_at = CURRENT_TIMESTAMP(3), approved_by = ? WHERE id = ?', [Number(mod.id), postId]);
    } else {
      await execute('UPDATE forum_posts SET status = \'rejected\', approved_at = NULL, approved_by = ? WHERE id = ?', [Number(mod.id), postId]);
    }
    await auditAdminAction(req, {
      actor: mod,
      action: action === 'approve' ? 'forum.post.approve' : 'forum.post.reject',
      targetType: 'forum_post',
      targetId: String(postId),
      riskLevel: action === 'approve' ? 'info' : 'watch',
      summary: action === 'approve' ? `通过帖子 #${postId}` : `驳回帖子 #${postId}`,
      metadata: { postId, action }
    });
    return res.json({ ok: true, action });
  } catch (err) {
    console.error('forum review patch failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
};

app.patch('/api/admin/forum/posts/:id/review', handleAdminForumPostReview);
app.post('/api/admin/forum/posts/:id/review', handleAdminForumPostReview);

app.get('/api/admin/blackroom/users', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const q = String(req.query.q || '').trim();
    const where = ['(is_banned = 1 OR (muted_until IS NOT NULL AND muted_until > CURRENT_TIMESTAMP(3)))'];
    const params = [];
    if (q) {
      where.push('(login_id LIKE ? OR username LIKE ? OR CAST(id AS CHAR) LIKE ?)');
      const token = `%${q}%`;
      params.push(token, token, token);
    }
    const rows = await queryRows(
      `
      SELECT id,login_id,username,is_admin,is_banned,muted_until,created_at
      FROM users
      WHERE ${where.join(' AND ')}
      ORDER BY is_banned DESC, muted_until DESC, created_at DESC, id DESC
      LIMIT 500
      `,
      params
    );
    return res.json({
      users: rows.map((row) => ({
        id: Number(row.id),
        loginId: row.login_id,
        username: row.username || row.login_id,
        isAdmin: Number(row.is_admin) === 1,
        isBanned: Number(row.is_banned) === 1,
        mutedUntil: row.muted_until || null,
        createdAt: row.created_at || null
      }))
    });
  } catch (err) {
    console.error('admin blackroom users get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.post('/api/admin/user-delete-requests', async (req, res) => {
  try {
    const mod = await requireModerator(req, res);
    if (!mod) return;
    const userId = Number(req.body?.userId);
    const sourcePostId = Number(req.body?.sourcePostId);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(400).json({ error: 'BAD_USER_ID' });
    const target = await queryOne('SELECT id,login_id,username,is_admin FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!target) return res.status(404).json({ error: 'NOT_FOUND' });
    const safe = await checkUserDeletionSafety(target);
    if (!safe.ok) return res.status(400).json({ error: safe.error });
    const pending = await queryOne(
      'SELECT id FROM admin_user_delete_requests WHERE target_user_id = ? AND status = \'pending\' LIMIT 1',
      [userId]
    );
    if (pending) return res.status(409).json({ error: 'ALREADY_PENDING', requestId: Number(pending.id) });
    const postId = Number.isFinite(sourcePostId) && sourcePostId > 0 ? sourcePostId : null;
    const ret = await execute(
      `
      INSERT INTO admin_user_delete_requests
      (target_user_id, target_login_id, target_username, source_post_id, requested_by, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
      `,
      [Number(target.id), String(target.login_id || ''), String(target.username || target.login_id || ''), postId, Number(mod.id)]
    );
    await auditAdminAction(req, {
      actor: mod,
      action: 'user.delete_request.submit',
      targetType: 'user',
      targetId: String(target.id),
      riskLevel: 'watch',
      summary: `提交删号申请：${target.login_id || target.id}`,
      metadata: { requestId: Number(ret.insertId), targetUserId: Number(target.id), sourcePostId: postId }
    });
    return res.status(201).json({
      ok: true,
      request: {
        id: Number(ret.insertId),
        targetUserId: Number(target.id),
        targetLoginId: String(target.login_id || ''),
        targetUsername: String(target.username || target.login_id || ''),
        sourcePostId: postId,
        requestedBy: Number(mod.id),
        status: 'pending'
      }
    });
  } catch (err) {
    console.error('admin user delete request create failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/admin/user-delete-requests', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const status = String(req.query.status || 'pending').trim().toLowerCase();
    const q = String(req.query.q || '').trim();
    const where = [];
    const params = [];
    if (status !== 'all') {
      if (status !== 'pending' && status !== 'approved' && status !== 'rejected') {
        return res.status(400).json({ error: 'BAD_STATUS' });
      }
      where.push('r.status = ?');
      params.push(status);
    }
    if (q) {
      where.push('(r.target_login_id LIKE ? OR r.target_username LIKE ? OR CAST(r.target_user_id AS CHAR) LIKE ? OR CAST(r.id AS CHAR) LIKE ?)');
      const token = `%${q}%`;
      params.push(token, token, token, token);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await queryRows(
      `
      SELECT
        r.*,
        rb.login_id AS requested_by_login_id,
        rb.username AS requested_by_username,
        rv.login_id AS reviewed_by_login_id,
        rv.username AS reviewed_by_username
      FROM admin_user_delete_requests r
      LEFT JOIN users rb ON rb.id = r.requested_by
      LEFT JOIN users rv ON rv.id = r.reviewed_by
      ${whereSql}
      ORDER BY
        CASE r.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END ASC,
        r.created_at DESC,
        r.id DESC
      LIMIT 500
      `,
      params
    );
    return res.json({
      requests: rows.map((row) => ({
        id: Number(row.id),
        targetUserId: Number(row.target_user_id),
        targetLoginId: row.target_login_id || '',
        targetUsername: row.target_username || row.target_login_id || '',
        sourcePostId: row.source_post_id ? Number(row.source_post_id) : null,
        status: String(row.status || 'pending'),
        reviewNote: row.review_note || '',
        requestedBy: Number(row.requested_by),
        requestedByLoginId: row.requested_by_login_id || '',
        requestedByUsername: row.requested_by_username || row.requested_by_login_id || '',
        reviewedBy: row.reviewed_by ? Number(row.reviewed_by) : null,
        reviewedByLoginId: row.reviewed_by_login_id || '',
        reviewedByUsername: row.reviewed_by_username || row.reviewed_by_login_id || '',
        reviewedAt: row.reviewed_at || null,
        createdAt: row.created_at || null
      }))
    });
  } catch (err) {
    console.error('admin user delete request list failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

const handleAdminUserDeleteRequestReview = async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const requestId = Number(req.params.id);
    const action = String(req.body?.action || '').trim().toLowerCase();
    if (!Number.isFinite(requestId) || requestId <= 0) return res.status(400).json({ error: 'BAD_ID' });
    if (action !== 'approve' && action !== 'reject') return res.status(400).json({ error: 'BAD_ACTION' });
    const row = await queryOne('SELECT * FROM admin_user_delete_requests WHERE id = ? LIMIT 1', [requestId]);
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    if (String(row.status) !== 'pending') return res.status(409).json({ error: 'ALREADY_REVIEWED' });
    const note = normalizeReviewNote(req.body?.note);
    if (action === 'reject') {
      await execute(
        'UPDATE admin_user_delete_requests SET status = \'rejected\', review_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP(3) WHERE id = ?',
        [note || '', Number(admin.id), requestId]
      );
      await auditAdminAction(req, {
        actor: admin,
        action: 'user.delete_request.reject',
        targetType: 'delete_request',
        targetId: String(requestId),
        riskLevel: 'watch',
        summary: `驳回删号申请 #${requestId}`,
        metadata: { requestId, targetUserId: Number(row.target_user_id), note }
      });
      return res.json({ ok: true, action: 'reject' });
    }
    const target = await queryOne('SELECT id,login_id,is_admin FROM users WHERE id = ? LIMIT 1', [Number(row.target_user_id)]);
    if (!target) {
      await execute(
        'UPDATE admin_user_delete_requests SET status = \'rejected\', review_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP(3) WHERE id = ?',
        [note || 'TARGET_NOT_FOUND', Number(admin.id), requestId]
      );
      return res.status(409).json({ error: 'TARGET_NOT_FOUND' });
    }
    const safe = await checkUserDeletionSafety(target);
    if (!safe.ok) {
      await execute(
      'UPDATE admin_user_delete_requests SET status = \'rejected\', review_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP(3) WHERE id = ?',
        [note || (`APPROVAL_FAILED:${safe.error}`), Number(admin.id), requestId]
      );
      return res.status(400).json({ error: safe.error });
    }
    await deleteUserCascadeById(Number(target.id));
    await execute(
      'UPDATE admin_user_delete_requests SET status = \'approved\', review_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP(3) WHERE id = ?',
      [note || '', Number(admin.id), requestId]
    );
    await execute(
      'UPDATE admin_user_delete_requests SET status = \'rejected\', review_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP(3) WHERE target_user_id = ? AND status = \'pending\' AND id <> ?',
      ['TARGET_ALREADY_DELETED', Number(admin.id), Number(target.id), requestId]
    );
    await auditAdminAction(req, {
      actor: admin,
      action: 'user.delete_request.approve',
      targetType: 'user',
      targetId: String(target.id),
      riskLevel: 'danger',
      summary: `批准删号申请 #${requestId}`,
      metadata: { requestId, targetUserId: Number(target.id), targetLoginId: target.login_id || '', note }
    });
    return res.json({ ok: true, action: 'approve' });
  } catch (err) {
    console.error('admin user delete request patch failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
};

app.patch('/api/admin/user-delete-requests/:id', handleAdminUserDeleteRequestReview);
app.post('/api/admin/user-delete-requests/:id', handleAdminUserDeleteRequestReview);

app.get('/api/admin/users', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const q = String(req.query.q || '').trim();
    const params = [];
    let where = '';
    if (q) {
      where = 'WHERE login_id LIKE ? OR username LIKE ? OR CAST(id AS CHAR) LIKE ?';
      const token = `%${q}%`;
      params.push(token, token, token);
    }
    const rows = await queryRows(
      `
      SELECT
        id,login_id,username,created_at,is_admin,forum_publisher,is_banned,muted_until,
        membership_status,membership_expires_at,title_text,title_bg_color,title_color,
        bio,gender,birthday,birthday_public,
        username_change_remaining,username_change_next_at,points
      FROM users
      ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT 500
      `,
      params
    );
    return res.json({ users: rows.map((r) => toUserPayload(r)) });
  } catch (err) {
    console.error('admin users get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

const handleAdminUserUpdate = async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(400).json({ error: 'BAD_ID' });
    const target = await queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!target) return res.status(404).json({ error: 'NOT_FOUND' });
    let adminPatch = null;
    try {
      adminPatch = normalizeAdminUserPatchPayload(req.body || {});
    } catch (err) {
      return res.status(400).json({ error: err && err.code ? err.code : 'BAD_PATCH_PAYLOAD' });
    }
    const updates = [];
    const params = [];
    if (Object.prototype.hasOwnProperty.call(adminPatch, 'loginId')) {
      if (isDefaultAdminLogin(target.login_id) && adminPatch.loginId !== String(target.login_id || '')) {
        return res.status(400).json({ error: 'PROTECTED_ADMIN' });
      }
      const exists = await queryOne('SELECT id FROM users WHERE login_id = ? AND id <> ? LIMIT 1', [adminPatch.loginId, userId]);
      if (exists) return res.status(409).json({ error: 'LOGIN_ID_TAKEN' });
      updates.push('login_id = ?');
      params.push(adminPatch.loginId);
    }
    if (Object.prototype.hasOwnProperty.call(adminPatch, 'username')) {
      const exists = await queryOne('SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1', [adminPatch.username, userId]);
      if (exists) return res.status(409).json({ error: 'USERNAME_TAKEN' });
      updates.push('username = ?');
      params.push(adminPatch.username);
    }
    if (Object.prototype.hasOwnProperty.call(adminPatch, 'bio')) {
      updates.push('bio = ?');
      params.push(adminPatch.bio);
    }
    if (Object.prototype.hasOwnProperty.call(adminPatch, 'newPassword')) {
      updates.push('password_hash = ?');
      params.push(hashPassword(adminPatch.newPassword));
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'membershipStatus')) {
      const status = String(req.body.membershipStatus || '').trim();
      if (!MEMBERSHIP_STATUSES.has(status)) return res.status(400).json({ error: 'BAD_MEMBERSHIP_STATUS' });
      updates.push('membership_status = ?');
      params.push(status);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'membershipExpiresAt')) {
      const value = req.body.membershipExpiresAt;
      if (value === null || value === '') {
        updates.push('membership_expires_at = NULL');
      } else {
        const ts = new Date(String(value)).getTime();
        if (!Number.isFinite(ts)) return res.status(400).json({ error: 'BAD_EXPIRES_AT' });
        updates.push('membership_expires_at = ?');
        params.push(formatSqlDateTime(new Date(ts)));
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'titleText')) {
      const titleText = normalizeUserTitleText(req.body.titleText);
      if (titleText === null) return res.status(400).json({ error: 'BAD_TITLE_TEXT' });
      updates.push('title_text = ?');
      params.push(titleText);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'titleBgColor')) {
      const raw = req.body.titleBgColor;
      const color = normalizeHexColor(raw);
      if (!(raw === null || raw === '' || raw === undefined) && !color) return res.status(400).json({ error: 'BAD_TITLE_BG_COLOR' });
      if (color) {
        updates.push('title_bg_color = ?');
        params.push(color);
      } else {
        updates.push('title_bg_color = NULL');
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'titleColor')) {
      const raw = req.body.titleColor;
      const color = normalizeHexColor(raw);
      if (!(raw === null || raw === '' || raw === undefined) && !color) return res.status(400).json({ error: 'BAD_TITLE_COLOR' });
      if (color) {
        updates.push('title_color = ?');
        params.push(color);
      } else {
        updates.push('title_color = NULL');
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'isBanned')) {
      updates.push('is_banned = ?');
      params.push(req.body.isBanned ? 1 : 0);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'mutedUntil')) {
      const value = req.body.mutedUntil;
      if (!value) {
        updates.push('muted_until = NULL');
      } else {
        const ts = new Date(String(value)).getTime();
        if (!Number.isFinite(ts)) return res.status(400).json({ error: 'BAD_MUTED_UNTIL' });
        updates.push('muted_until = ?');
        params.push(formatSqlDateTime(new Date(ts)));
      }
    }
    if (!updates.length) return res.json({ ok: true, user: toUserPayload(target) });
    params.push(userId);
    await execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    const fresh = await queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'isBanned')) {
      await auditAdminAction(req, {
        actor: admin,
        action: req.body.isBanned ? 'user.ban' : 'user.unban',
        targetType: 'user',
        targetId: String(userId),
        riskLevel: req.body.isBanned ? 'danger' : 'watch',
        summary: `${req.body.isBanned ? '封禁' : '解除封禁'}用户 ${target.login_id || userId}`,
        metadata: { userId, loginId: target.login_id || '', username: target.username || '', isBanned: !!req.body.isBanned }
      });
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'mutedUntil')) {
      await auditAdminAction(req, {
        actor: admin,
        action: req.body.mutedUntil ? 'user.mute' : 'user.unmute',
        targetType: 'user',
        targetId: String(userId),
        riskLevel: 'watch',
        summary: `${req.body.mutedUntil ? '禁言' : '解除禁言'}用户 ${target.login_id || userId}`,
        metadata: { userId, loginId: target.login_id || '', username: target.username || '', mutedUntil: req.body.mutedUntil || null }
      });
    }
    return res.json({ ok: true, user: toUserPayload(fresh) });
  } catch (err) {
    console.error('admin users patch failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
};

app.patch('/api/admin/users/:id', handleAdminUserUpdate);
app.post('/api/admin/users/:id', handleAdminUserUpdate);

app.post('/api/admin/users/batch', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const validated = validateBatchAdminUserAction(req.body || {});
    if (!validated.ok) return res.status(400).json({ error: validated.error });
    const payload = req.body?.payload || {};
    const uniqueUserIds = Array.from(new Set(validated.userIds));
    const placeholders = uniqueUserIds.map(() => '?').join(',');

    const result = await runInTransaction(async (tx) => {
      const users = await tx.queryRows(
        `SELECT id,login_id,username FROM users WHERE id IN (${placeholders}) ORDER BY id ASC`,
        uniqueUserIds
      );
      if (users.length !== uniqueUserIds.length) {
        const err = new Error('NOT_FOUND');
        err.code = 'NOT_FOUND';
        throw err;
      }

      if (validated.action === 'mute') {
        const value = payload.mutedUntil;
        const ts = new Date(String(value || '')).getTime();
        if (!Number.isFinite(ts)) {
          const err = new Error('BAD_MUTED_UNTIL');
          err.code = 'BAD_MUTED_UNTIL';
          throw err;
        }
        await tx.execute(
          `UPDATE users SET muted_until = ? WHERE id IN (${placeholders})`,
          [formatSqlDateTime(new Date(ts)), ...uniqueUserIds]
        );
        return { ok: true, action: validated.action, count: uniqueUserIds.length };
      }

      if (validated.action === 'reset_bio') {
        await tx.execute(
          `UPDATE users SET bio = ? WHERE id IN (${placeholders})`,
          [DEFAULT_PROFILE_BIO, ...uniqueUserIds]
        );
        return { ok: true, action: validated.action, count: uniqueUserIds.length };
      }

      if (validated.action === 'reset_username') {
        for (const user of users) {
          const nextUsername = buildBatchResetUsername('user', user.id);
          const exists = await tx.queryOne(
            'SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1',
            [nextUsername, Number(user.id)]
          );
          if (exists) {
            const err = new Error('USERNAME_TAKEN');
            err.code = 'USERNAME_TAKEN';
            throw err;
          }
        }
        for (const user of users) {
          const nextUsername = buildBatchResetUsername('user', user.id);
          await tx.execute('UPDATE users SET username = ? WHERE id = ?', [nextUsername, Number(user.id)]);
        }
        return { ok: true, action: validated.action, count: uniqueUserIds.length };
      }

      const err = new Error('BAD_BATCH_ACTION');
      err.code = 'BAD_BATCH_ACTION';
      throw err;
    });

    await auditAdminAction(req, {
      actor: admin,
      action: `user.batch.${result.action}`,
      targetType: 'users',
      targetId: uniqueUserIds.join(','),
      riskLevel: result.action === 'mute' ? 'watch' : 'danger',
      summary: `批量用户操作：${result.action}，${result.count} 个用户`,
      metadata: { action: result.action, userIds: uniqueUserIds, count: result.count }
    });
    return res.json(result);
  } catch (err) {
    if (err && err.code) {
      const statusCode = err.code === 'NOT_FOUND' ? 404 : 400;
      return res.status(statusCode).json({ error: err.code });
    }
    console.error('admin users batch failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(400).json({ error: 'BAD_ID' });
    const target = await queryOne('SELECT id,login_id,is_admin FROM users WHERE id = ? LIMIT 1', [userId]);
    const safe = await checkUserDeletionSafety(target);
    if (!safe.ok) {
      const statusCode = safe.error === 'NOT_FOUND' ? 404 : 400;
      return res.status(statusCode).json({ error: safe.error });
    }
    await deleteUserCascadeById(userId);
    await execute(
      'UPDATE admin_user_delete_requests SET status = \'approved\', review_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP(3) WHERE target_user_id = ? AND status = \'pending\'',
      ['DELETED_DIRECTLY_BY_ADMIN', Number(admin.id), userId]
    );
    await auditAdminAction(req, {
      actor: admin,
      action: 'user.delete',
      targetType: 'user',
      targetId: String(userId),
      riskLevel: 'danger',
      summary: `直接删除用户 ${target.login_id || userId}`,
      metadata: { userId, loginId: target.login_id || '', wasAdmin: Number(target.is_admin) === 1 }
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('admin users delete failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/admin/admins', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const rows = await queryRows('SELECT id,login_id,username,created_at FROM users WHERE is_admin = 1 ORDER BY created_at ASC,id ASC');
    return res.json({
      admins: rows.map((r) => ({
        id: Number(r.id),
        loginId: r.login_id,
        username: r.username,
        createdAt: r.created_at,
        isProtected: isDefaultAdminLogin(r.login_id)
      }))
    });
  } catch (err) {
    console.error('admin admins get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.post('/api/admin/admins', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const loginId = String(req.body?.loginId || '').trim();
    if (!loginId) return res.status(400).json({ error: 'BAD_LOGIN_ID' });
    const target = await queryOne('SELECT id FROM users WHERE login_id = ? LIMIT 1', [loginId]);
    if (!target) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    await execute('UPDATE users SET is_admin = 1 WHERE id = ?', [target.id]);
    await auditAdminAction(req, {
      actor: admin,
      action: 'role.admin.add',
      targetType: 'user',
      targetId: String(target.id),
      riskLevel: 'watch',
      summary: `添加管理员 ${loginId}`,
      metadata: { userId: Number(target.id), loginId }
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('admin admins post failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.delete('/api/admin/admins/:id', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(400).json({ error: 'BAD_ID' });
    const target = await queryOne('SELECT id,login_id,is_admin FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!target) return res.status(404).json({ error: 'NOT_FOUND' });
    if (isDefaultAdminLogin(target.login_id)) return res.status(400).json({ error: 'PROTECTED_ADMIN' });
    const c = await queryOne('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1', []);
    if (Number(c?.c || 0) <= 1 && Number(target.is_admin) === 1) return res.status(400).json({ error: 'LAST_ADMIN' });
    await execute('UPDATE users SET is_admin = 0 WHERE id = ?', [userId]);
    await auditAdminAction(req, {
      actor: admin,
      action: 'role.admin.remove',
      targetType: 'user',
      targetId: String(userId),
      riskLevel: 'danger',
      summary: `移除管理员 ${target.login_id || userId}`,
      metadata: { userId, loginId: target.login_id || '' }
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('admin admins delete failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/admin/moderators', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const rows = await queryRows('SELECT id,login_id,username,created_at FROM users WHERE forum_publisher = 1 ORDER BY created_at ASC,id ASC');
    return res.json({ moderators: rows.map((r) => ({ id: Number(r.id), loginId: r.login_id, username: r.username, createdAt: r.created_at })) });
  } catch (err) {
    console.error('admin moderators get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.post('/api/admin/moderators', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const loginId = String(req.body?.loginId || '').trim();
    if (!loginId) return res.status(400).json({ error: 'BAD_LOGIN_ID' });
    const target = await queryOne('SELECT id FROM users WHERE login_id = ? LIMIT 1', [loginId]);
    if (!target) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    await execute('UPDATE users SET forum_publisher = 1 WHERE id = ?', [target.id]);
    await auditAdminAction(req, {
      actor: admin,
      action: 'role.moderator.add',
      targetType: 'user',
      targetId: String(target.id),
      riskLevel: 'watch',
      summary: `添加版主 ${loginId}`,
      metadata: { userId: Number(target.id), loginId }
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('admin moderators post failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.delete('/api/admin/moderators/:id', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(400).json({ error: 'BAD_ID' });
    await execute('UPDATE users SET forum_publisher = 0 WHERE id = ?', [userId]);
    await auditAdminAction(req, {
      actor: admin,
      action: 'role.moderator.remove',
      targetType: 'user',
      targetId: String(userId),
      riskLevel: 'watch',
      summary: `移除版主 #${userId}`,
      metadata: { userId }
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('admin moderators delete failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

const calendarStore = createCalendarStore({ queryRows, queryOne, execute, runInTransaction, pgDatabase: !!pgDatabase });
mountCalendarRoutes(app, {
  store: calendarStore,
  requireAdmin,
  auditAdminAction,
  getSetting,
  setSetting,
  logError: (label, error) => console.error(`${label}:`, error)
});
mountHomeNavigationRoutes(app, {
  getSetting,
  setSetting,
  requireAdmin,
  auditAdminAction,
  logError: (label, error) => console.error(`${label}:`, error)
});

mountGiftPackRoutes({
  app,
  queryRows,
  queryOne,
  execute,
  requireAdmin,
  auditAdminAction,
  pgDatabase
});

const bearpitBackupApi = mountBearpitBackupRoutes({
  app,
  queryRows,
  queryOne,
  execute,
  requireAuth,
  pgDatabase
});

mountBearpitCollectRoutes({
  app,
  queryRows,
  queryOne,
  execute,
  pgDatabase,
  currentUserFromRequest,
  requireAuth
});

mountBearpitTemplateRoutes({
  app,
  queryRows,
  queryOne,
  execute,
  pgDatabase,
  requireAdmin,
  auditAdminAction
});

mountBearpitAdminRoutes({
  app,
  queryRows,
  queryOne,
  requireAdmin,
  auditAdminAction,
  pgDatabase
});

mountHeroDataRoutes({
  app,
  queryRows,
  queryOne,
  execute,
  requireAdmin,
  auditAdminAction,
  pgDatabase
});

mountLordEquipmentGemRoutes(app);

mountUserRewardsRoutes({
  app,
  queryRows,
  queryOne,
  execute,
  requireAuth,
  requireAdmin,
  auditAdminAction,
  formatSqlDateTime,
  toUserPayload,
  attachFollowCountsToUserPayload,
  applyShopItemToUser,
  mapShopItemRow,
  pgDatabase
});

mountShopRoutes({
  app,
  queryRows,
  queryOne,
  execute,
  requireAuth,
  requireAdmin,
  auditAdminAction,
  formatSqlDateTime,
  toUserPayload,
  attachFollowCountsToUserPayload
});

app.get('/api/bearpit/layout', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    const row = await queryOne('SELECT data_json, updated_at FROM bearpit_layouts WHERE user_id = ? LIMIT 1', [user.id]);
    if (!row) return res.json({ data: null, updatedAt: null });
    const data = row.data_json && typeof row.data_json === 'object' ? row.data_json : safeJsonParse(String(row.data_json || 'null'), null);
    return res.json({ data: data || null, updatedAt: row.updated_at || null });
  } catch (err) {
    console.error('bearpit get failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// 某些 IIS/WebDAV 环境会拦截 PUT；提供 POST 作为兼容保存入口
app.post('/api/bearpit/layout', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    const data = req.body?.data;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'BAD_DATA' });
    if (pgDatabase) {
      // PostgreSQL 使用 ON CONFLICT（MySQL 的 ON DUPLICATE KEY 在 pg 会语法失败）
      await execute(
        `
        INSERT INTO bearpit_layouts (user_id,data_json,updated_at)
        VALUES (?, ?::jsonb, CURRENT_TIMESTAMP(3))
        ON CONFLICT (user_id) DO UPDATE
          SET data_json = EXCLUDED.data_json, updated_at = CURRENT_TIMESTAMP(3)
        `,
        [Number(user.id), JSON.stringify(data)]
      );
    } else {
      await execute(
        `
        INSERT INTO bearpit_layouts (user_id,data_json,updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP(3))
        ON DUPLICATE KEY UPDATE data_json = VALUES(data_json), updated_at = CURRENT_TIMESTAMP(3)
        `,
        [Number(user.id), JSON.stringify(data)]
      );
    }
    if (req.body?.createBackup !== false) {
      const backupTitle =
        typeof req.body?.backupTitle === 'string' && req.body.backupTitle.trim()
          ? req.body.backupTitle.trim()
          : bearpitBackupApi.defaultBackupTitle();
      await bearpitBackupApi.insertBackup(user.id, backupTitle, data);
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('bearpit post failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.put('/api/bearpit/layout', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    const data = req.body?.data;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'BAD_DATA' });
    if (pgDatabase) {
      await execute(
        `
        INSERT INTO bearpit_layouts (user_id,data_json,updated_at)
        VALUES (?, ?::jsonb, CURRENT_TIMESTAMP(3))
        ON CONFLICT (user_id) DO UPDATE
          SET data_json = EXCLUDED.data_json, updated_at = CURRENT_TIMESTAMP(3)
        `,
        [Number(user.id), JSON.stringify(data)]
      );
    } else {
      await execute(
        `
        INSERT INTO bearpit_layouts (user_id,data_json,updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP(3))
        ON DUPLICATE KEY UPDATE data_json = VALUES(data_json), updated_at = CURRENT_TIMESTAMP(3)
        `,
        [Number(user.id), JSON.stringify(data)]
      );
    }
    if (req.body?.createBackup !== false) {
      const backupTitle =
        typeof req.body?.backupTitle === 'string' && req.body.backupTitle.trim()
          ? req.body.backupTitle.trim()
          : bearpitBackupApi.defaultBackupTitle();
      await bearpitBackupApi.insertBackup(user.id, backupTitle, data);
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('bearpit put failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.post('/api/migrate', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;
    const bearpit = req.body?.bearpit;
    if (!bearpit || typeof bearpit !== 'object') return res.status(400).json({ error: 'BAD_DATA' });
    const existing = await queryOne('SELECT user_id FROM bearpit_layouts WHERE user_id = ? LIMIT 1', [user.id]);
    if (existing) return res.json({ ok: true, migrated: false });
    await execute('INSERT INTO bearpit_layouts (user_id,data_json,updated_at) VALUES (?, ?, CURRENT_TIMESTAMP(3))', [Number(user.id), JSON.stringify(bearpit)]);
    return res.json({ ok: true, migrated: true });
  } catch (err) {
    console.error('migrate post failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/users', async (_req, res) => {
  try {
    const rows = await queryRows(
      `
      SELECT id,login_id,username,created_at,is_admin,is_banned
      FROM users
      ORDER BY id DESC
      LIMIT 200
      `
    );
    return res.json({ ok: true, users: rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/add-user', async (_req, res) => {
  try {
    const now = Date.now().toString().slice(-6);
    const loginId = `test_${now}`;
    const username = `user${now}`;
    const ret = await execute(
      'INSERT INTO users (login_id, username, password_hash, username_change_remaining) VALUES (?, ?, ?, 2)',
      [loginId, username, hashPassword('Test12345')]
    );
    return res.json({ ok: true, id: Number(ret.insertId), loginId });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.use((err, req, res, next) => {
  if (!err || res.headersSent) return next(err);
  if (!String(req.path || '').startsWith('/api/')) return next(err);
  const isBadJson = err.type === 'entity.parse.failed';
  if (!isBadJson) return next(err);
  return res.status(400).json({ error: 'BAD_JSON', message: String(err.message || '') });
});

app.use((req, res) => {
  if (String(req.path || '').startsWith('/api/')) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }
  return res.status(404).send('Not found');
});

if (require.main === module) {
  app.listen(PORT, async () => {
    try {
      await initDB();
      console.log('Local server started.');
      console.log(`Site: http://localhost:${PORT}`);
      if (GIFTCODE_URL_PREFIX) {
        console.log(`Giftcode UI: http://localhost:${PORT}${GIFTCODE_URL_PREFIX}/ (${GIFTCODE_UI_MODE})`);
      }
      console.log(`Giftcode API proxy -> ${GIFTCODE_SERVICE_URL}`);
      console.log(`Auth check: http://localhost:${PORT}/api/auth/me`);
      console.log(pgDatabase ? 'PostgreSQL connected and API routes initialized.' : 'MySQL connected and API routes initialized.');
    } catch (err) {
      console.error('Database init failed:', err);
      if (pgDatabase || db) {
        const repaired = await repairUserRewardsSchema({
          execute,
          pgDatabase,
          addColumnIfMissing
        });
        if (repaired) console.log('User rewards schema repaired after init failure.');
      }
    }
  });
}

module.exports = {
  app,
  TOOL_CATALOG,
  normalizeToolManagement,
  normalizeAllowedUserRefs,
  isToolAllowedForUser,
  toPublicToolManagement,
  toAdminToolManagement,
  createToolManagementHandlers,
  createToolAccessRequestHandlers,
  renderToolGatePageHtml,
  TOOL_ACCESS_AGREEMENT_VERSION,
  findManagedToolByPath,
  HOME_NAVIGATION_CATALOG,
  normalizeHomeNavigation,
  createHomeNavigationHandlers
};

process.on('uncaughtException', (err) => {
  console.error('uncaught exception:', err);
});
