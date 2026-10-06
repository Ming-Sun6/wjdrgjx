'use strict';

const DEFAULTS = Object.freeze({
  enabled: true,
  urlLink: '',
  appId: 'wx3c8c6cd6c61128fb',
  qrImage: '/function/images/mini-program-qr.jpg'
});

function validLink(value) {
  if (value === '') return true;
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['wxaurl.cn', 'wxmpurl.cn'].includes(url.hostname)
      && !url.username && !url.password && !url.port;
  } catch (_) { return false; }
}

function registerMiniProgramPromotion(app, { getSetting, setSetting, requireAdmin, auditAdminAction }) {
  async function read() {
    const raw = await getSetting('mini_program_promotion', null);
    return { ...DEFAULTS, enabled: raw ? raw.enabled === true : DEFAULTS.enabled,
      urlLink: raw && validLink(raw.urlLink) ? raw.urlLink : '' };
  }
  app.get('/api/mini-program-promotion', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const promotion = await read();
      res.json({ promotion: promotion.enabled ? promotion : null });
    } catch (error) {
      console.error('Read mini program promotion failed', error);
      res.status(500).json({ promotion: null });
    }
  });
  app.get('/api/admin/mini-program-promotion', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      if (!await requireAdmin(req, res)) return;
      res.json({ promotion: await read() });
    } catch (error) {
      console.error('Read admin mini program promotion failed', error);
      res.status(500).json({ error: '读取小程序推广设置失败' });
    }
  });
  app.put('/api/admin/mini-program-promotion', async (req, res) => {
    try {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const { enabled, urlLink } = req.body || {};
      const link = typeof urlLink === 'string' ? urlLink.trim() : urlLink;
      if (typeof enabled !== 'boolean' || !validLink(link)) {
        return res.status(400).json({ error: '请填写有效的微信 URL Link（https://wxaurl.cn/ 或 https://wxmpurl.cn/），或留空使用扫码体验。' });
      }
      const promotion = { ...DEFAULTS, enabled, urlLink: link };
      await setSetting('mini_program_promotion', promotion);
      await auditAdminAction(req, { actor: admin, action: 'mini_program_promotion.update',
        targetType: 'setting', targetId: 'mini_program_promotion', riskLevel: 'watch',
        summary: enabled ? '开启小程序推广' : '关闭小程序推广', metadata: { enabled, urlLink: link } });
      res.json({ promotion });
    } catch (error) {
      console.error('Save mini program promotion failed', error);
      res.status(500).json({ error: '保存小程序推广设置失败，请刷新确认后重试' });
    }
  });
}

module.exports = { registerMiniProgramPromotion };
