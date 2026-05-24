const http = require('http');
const https = require('https');
const { URL } = require('url');

const GIFTCODE_SERVICE_URL = process.env.GIFTCODE_SERVICE_URL || 'http://127.0.0.1:5201';
const GIFTCODE_URL_PREFIX = normalizePrefix(process.env.GIFTCODE_URL_PREFIX || '/giftcode');
const GIFTCODE_UI_MODE = (process.env.GIFTCODE_UI_MODE || 'placeholder').trim().toLowerCase();

const GIFTCODE_EXACT_API_PATHS = new Set([
  '/api/addUser',
  '/api/delUser',
  '/api/addGiftCode',
  '/api/submitGiftCode',
  '/api/getGiftCode',
  '/api/giftCode',
  '/api/giftCodeAll',
  '/api/giftcode/health'
]);

function normalizePrefix(prefix) {
  const raw = String(prefix || '').trim();
  if (!raw || raw === '/') return '';
  return raw.startsWith('/') ? raw.replace(/\/+$/, '') : `/${raw.replace(/\/+$/, '')}`;
}

function parseGiftcodeTarget() {
  const base = new URL(GIFTCODE_SERVICE_URL);
  const isHttps = base.protocol === 'https:';
  const port = base.port || (isHttps ? '443' : '80');
  return {
    lib: isHttps ? https : http,
    hostname: base.hostname,
    port: Number(port)
  };
}

function isGiftcodeApiPath(pathname) {
  if (!pathname) return false;
  if (pathname.startsWith('/api/giftcode')) return true;
  if (GIFTCODE_EXACT_API_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/api/r/getGiftCode')) return true;
  return false;
}

function shouldProxyGiftcodeUi(pathname) {
  if (GIFTCODE_UI_MODE !== 'live') return false;
  if (!GIFTCODE_URL_PREFIX) return false;
  return pathname === GIFTCODE_URL_PREFIX || pathname.startsWith(`${GIFTCODE_URL_PREFIX}/`);
}

function proxyHttp(req, res, targetPath) {
  const target = parseGiftcodeTarget();
  const headers = { ...req.headers };
  headers.host = `${target.hostname}:${target.port}`;
  delete headers.connection;

  const proxyReq = target.lib.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: targetPath,
      method: req.method,
      headers
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (err) => {
    if (res.headersSent) return;
    res.status(502).json({
      code: 502,
      msg: `兑换服务不可用，请确认已启动 wjdr-giftcode（${GIFTCODE_SERVICE_URL}）：${err.message}`
    });
  });

  req.pipe(proxyReq);
}

function mountGiftcodeProxy(app) {
  app.use((req, res, next) => {
    const pathname = (req.path || '/').split('?')[0];

    if (shouldProxyGiftcodeUi(pathname)) {
      const rest = pathname.slice(GIFTCODE_URL_PREFIX.length) || '/';
      const qs = req.url && req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      return proxyHttp(req, res, `${rest}${qs}`);
    }

    if (isGiftcodeApiPath(pathname)) {
      const forwardPath = req.originalUrl || req.url || pathname;
      return proxyHttp(req, res, forwardPath);
    }

    return next();
  });
}

module.exports = {
  mountGiftcodeProxy,
  isGiftcodeApiPath,
  GIFTCODE_URL_PREFIX,
  GIFTCODE_SERVICE_URL,
  GIFTCODE_UI_MODE
};
