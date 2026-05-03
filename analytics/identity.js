const crypto = require('crypto');

const VISITOR_COOKIE_NAME = 'visitor_id';

function createVisitorId() {
  return crypto.randomBytes(16).toString('hex');
}

function isValidVisitorId(value) {
  return /^[a-f0-9]{32}$/.test(String(value || ''));
}

function classifyRequestPath(pathname) {
  const path = String(pathname || '');
  const clean = path.split('?')[0] || '';

  if (clean === '/function/admin.html') {
    return {
      trackAsPageView: true,
      pageKey: 'function/admin',
      isAdminArea: true
    };
  }

  if (!clean || clean === '/' || clean === '/rukou.html') {
    return {
      trackAsPageView: true,
      pageKey: 'rukou',
      isAdminArea: false
    };
  }

  if (/\.html$/i.test(clean)) {
    return {
      trackAsPageView: true,
      pageKey: clean.replace(/^\//, '').replace(/\.html$/i, ''),
      isAdminArea: false
    };
  }

  return {
    trackAsPageView: false,
    pageKey: '',
    isAdminArea: clean.startsWith('/function/admin')
  };
}

function ensureVisitorIdentity(cookies) {
  const jar = cookies || {};
  const existing = String(jar[VISITOR_COOKIE_NAME] || '').trim();
  if (isValidVisitorId(existing)) {
    return { visitorId: existing, setCookieHeader: '' };
  }
  const visitorId = createVisitorId();
  return {
    visitorId,
    setCookieHeader: `${VISITOR_COOKIE_NAME}=${visitorId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`
  };
}

function classifyApiPath(pathname) {
  const path = String(pathname || '').split('?')[0] || '';
  if (!path.startsWith('/api/')) {
    return {
      trackAsApiHit: false,
      scopeKey: '',
      isAdminArea: false
    };
  }
  if (path.startsWith('/api/analytics/')) {
    return {
      trackAsApiHit: false,
      scopeKey: '',
      isAdminArea: false
    };
  }

  const scopeKey = path.replace(/^\/api\//, '');
  return {
    trackAsApiHit: true,
    scopeKey,
    isAdminArea: scopeKey.startsWith('admin/')
  };
}

module.exports = {
  VISITOR_COOKIE_NAME,
  createVisitorId,
  isValidVisitorId,
  classifyRequestPath,
  ensureVisitorIdentity,
  classifyApiPath
};
