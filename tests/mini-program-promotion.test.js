const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { registerMiniProgramPromotion } = require('../mini-program-promotion');

test('promotion defaults, authentication, validation and saved visibility', async () => {
  const app = express();
  app.use(express.json());
  let stored = null;
  let audits = 0;
  registerMiniProgramPromotion(app, {
    getSetting: async () => stored,
    setSetting: async (_, value) => { stored = value; },
    requireAdmin: async (req, res) => {
      if (req.headers.authorization === 'admin') return { id: 1 };
      res.status(403).json({ error: 'forbidden' });
      return null;
    },
    auditAdminAction: async () => { audits++; }
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const save = (body, admin = true) => fetch(base + '/api/admin/mini-program-promotion', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: 'admin' } : {}) }, body: JSON.stringify(body)
  });
  try {
    assert.equal((await (await fetch(base + '/api/mini-program-promotion')).json()).promotion.enabled, true);
    assert.equal((await save({ enabled: false, urlLink: '' }, false)).status, 403);
    assert.equal((await fetch(base + '/api/admin/mini-program-promotion')).status, 403);
    for (const urlLink of ['javascript:alert(1)', 'https://evil.com/a', 'https://wxaurl.cn.evil.com/a', 'https://user@wxaurl.cn/a']) {
      assert.equal((await save({ enabled: true, urlLink })).status, 400);
    }
    assert.equal((await save({ enabled: 'false', urlLink: '' })).status, 400);
    assert.equal((await save({ enabled: false, urlLink: 'https://wxaurl.cn/example' })).status, 200);
    assert.equal((await (await fetch(base + '/api/mini-program-promotion')).json()).promotion, null);
    const admin = await (await fetch(base + '/api/admin/mini-program-promotion', { headers: { Authorization: 'admin' } })).json();
    assert.equal(admin.promotion.urlLink, 'https://wxaurl.cn/example');
    assert.equal((await save({ enabled: true, urlLink: '' })).status, 200);
    assert.equal((await (await fetch(base + '/api/mini-program-promotion')).json()).promotion.urlLink, '');
    assert.equal(audits, 2);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
