'use strict';

const { generateShareKey, countLayoutItems, sanitizeShareData, MAX_MP_SHARE_ITEMS, MAX_MP_SHARE_JSON } = require('./bearpit-backups');
const { generateHostToken, KEY_RE, TOKEN_RE } = require('./bearpit-collect');

const MAX_TITLE_LEN = 16;
const MAX_MARKET = 50;

const BEARPIT_TEMPLATES_DDL_MYSQL = `
  CREATE TABLE IF NOT EXISTS bearpit_templates (
    template_key VARCHAR(16) PRIMARY KEY,
    owner_token VARCHAR(32) NOT NULL,
    title VARCHAR(16) NOT NULL,
    data_json JSON NOT NULL,
    item_count INT NOT NULL DEFAULT 0,
    grid_size INT NOT NULL DEFAULT 20,
    download_count INT NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    KEY idx_bearpit_templates_updated (updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

const BEARPIT_TEMPLATES_DDL_PG = `
  CREATE TABLE IF NOT EXISTS bearpit_templates (
    template_key varchar(16) PRIMARY KEY,
    owner_token varchar(32) NOT NULL,
    title varchar(16) NOT NULL,
    data_json jsonb NOT NULL,
    item_count integer NOT NULL DEFAULT 0,
    grid_size integer NOT NULL DEFAULT 20,
    download_count integer NOT NULL DEFAULT 0,
    created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  );
  CREATE INDEX IF NOT EXISTS idx_bearpit_templates_updated ON bearpit_templates (updated_at DESC);
`;

function normalizeTemplateTitle(value) {
  const title = Array.from(String(value || '').trim().replace(/\s+/g, ' ')).slice(0, MAX_TITLE_LEN).join('');
  return title || null;
}

function isBeaPitTemplateData(data) {
  if (!data || typeof data !== 'object') return false;
  if (Array.isArray(data.items) && data.items.length > 0) return true;
  if (Number(data.v) === 2 && Array.isArray(data.i) && data.i.length > 0) return true;
  return false;
}

function gridSizeOf(data) {
  const n = Number(data && (data.gs || data.gridSize));
  if (Number.isFinite(n) && n >= 20 && n <= 100) return Math.round(n);
  return 20;
}

function mapMarketRow(row) {
  if (!row) return null;
  return {
    templateKey: String(row.template_key || ''),
    title: String(row.title || ''),
    itemCount: Number(row.item_count || 0),
    gs: Number(row.grid_size || 20),
    downloadCount: Number(row.download_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mountBearpitTemplateRoutes(deps) {
  const { app, queryRows, queryOne, execute, pgDatabase } = deps;
  let tableReady = false;

  async function ensureTable() {
    if (tableReady) return;
    await execute(pgDatabase ? BEARPIT_TEMPLATES_DDL_PG : BEARPIT_TEMPLATES_DDL_MYSQL);
    tableReady = true;
  }

  async function getRow(key) {
    return queryOne(
      'SELECT template_key, owner_token, title, data_json, item_count, grid_size, download_count, created_at, updated_at FROM bearpit_templates WHERE template_key = ? LIMIT 1',
      [key]
    );
  }

  app.get('/api/bearpit/mp/templates', async (req, res) => {
    try {
      await ensureTable();
      const rows = await queryRows(
        `
        SELECT template_key, title, item_count, grid_size, download_count, created_at, updated_at
        FROM bearpit_templates
        ORDER BY updated_at DESC, created_at DESC
        LIMIT ${MAX_MARKET}
        `
      );
      return res.json({ ok: true, templates: (rows || []).map(mapMarketRow) });
    } catch (err) {
      console.error('bearpit template list failed:', err);
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  app.post('/api/bearpit/mp/templates', async (req, res) => {
    try {
      await ensureTable();
      const data = sanitizeShareData(req.body?.data);
      const title = normalizeTemplateTitle(req.body?.title) || normalizeTemplateTitle(data && data.title);
      const existingKey = String(req.body?.templateKey || '').trim();
      const existingToken = String(req.body?.ownerToken || '').trim();
      if (!title) return res.status(400).json({ error: 'BAD_TITLE' });
      if (!isBeaPitTemplateData(data)) return res.status(400).json({ error: 'BAD_DATA' });
      const itemCount = countLayoutItems(data);
      if (itemCount < 1 || itemCount > MAX_MP_SHARE_ITEMS) return res.status(400).json({ error: 'TOO_MANY' });
      const json = JSON.stringify(data);
      if (json.length > MAX_MP_SHARE_JSON) return res.status(400).json({ error: 'TOO_LARGE' });
      const gs = gridSizeOf(data);

      if (KEY_RE.test(existingKey) && TOKEN_RE.test(existingToken)) {
        const row = await getRow(existingKey);
        if (row && String(row.owner_token) === existingToken) {
          await execute(
            pgDatabase
              ? 'UPDATE bearpit_templates SET title = ?, data_json = ?::jsonb, item_count = ?, grid_size = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE template_key = ?'
              : 'UPDATE bearpit_templates SET title = ?, data_json = ?, item_count = ?, grid_size = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE template_key = ?',
            [title, json, itemCount, gs, existingKey]
          );
          return res.json({ ok: true, updated: true, templateKey: existingKey, ownerToken: existingToken, title });
        }
        if (row) return res.status(403).json({ error: 'FORBIDDEN' });
      }

      let templateKey = null;
      const ownerToken = generateHostToken();
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = generateShareKey();
        try {
          await execute(
            pgDatabase
              ? 'INSERT INTO bearpit_templates (template_key, owner_token, title, data_json, item_count, grid_size, download_count, created_at, updated_at) VALUES (?, ?, ?, ?::jsonb, ?, ?, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))'
              : 'INSERT INTO bearpit_templates (template_key, owner_token, title, data_json, item_count, grid_size, download_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))',
            [candidate, ownerToken, title, json, itemCount, gs]
          );
          templateKey = candidate;
          break;
        } catch (err) {
          if (!String(err?.message || '').toLowerCase().includes('duplicate') && !String(err?.code || '').toUpperCase().includes('DUP')) throw err;
        }
      }
      if (!templateKey) return res.status(503).json({ error: 'TEMPLATE_KEY_UNAVAILABLE' });
      return res.json({ ok: true, updated: false, templateKey, ownerToken, title });
    } catch (err) {
      console.error('bearpit template publish failed:', err);
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  app.get('/api/bearpit/mp/templates/:key', async (req, res) => {
    try {
      await ensureTable();
      const key = String(req.params.key || '').trim();
      if (!KEY_RE.test(key)) return res.status(400).json({ error: 'BAD_KEY' });
      const row = await getRow(key);
      if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
      const data =
        row.data_json && typeof row.data_json === 'object'
          ? row.data_json
          : null;
      if (!data) return res.status(410).json({ error: 'BAD_DATA' });
      await execute(
        'UPDATE bearpit_templates SET download_count = download_count + 1 WHERE template_key = ?',
        [key]
      );
      return res.json({
        ok: true,
        title: String(row.title || ''),
        data,
        itemCount: Number(row.item_count || 0),
        gs: Number(row.grid_size || 20)
      });
    } catch (err) {
      console.error('bearpit template download failed:', err);
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });
}

module.exports = {
  MAX_TITLE_LEN,
  MAX_MARKET,
  BEARPIT_TEMPLATES_DDL_MYSQL,
  BEARPIT_TEMPLATES_DDL_PG,
  normalizeTemplateTitle,
  isBeaPitTemplateData,
  mountBearpitTemplateRoutes
};
