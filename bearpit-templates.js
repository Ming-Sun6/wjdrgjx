'use strict';

const { generateShareKey, countLayoutItems, sanitizeShareData, MAX_MP_SHARE_ITEMS, MAX_MP_SHARE_JSON } = require('./bearpit-backups');
const { generateHostToken, KEY_RE, TOKEN_RE } = require('./bearpit-collect');

const MAX_TITLE_LEN = 16;
const MAX_MARKET = 50;
const MAX_REJECT_REASON = 80;
const ADMIN_LIST_LIMIT = 200;
const STATUS_PENDING = 'pending';
const STATUS_APPROVED = 'approved';
const STATUS_REJECTED = 'rejected';
const SUBMIT_KIND_NEW = 'new';
const SUBMIT_KIND_UPDATE = 'update';

const BEARPIT_TEMPLATES_DDL_MYSQL = `
  CREATE TABLE IF NOT EXISTS bearpit_templates (
    template_key VARCHAR(16) PRIMARY KEY,
    owner_token VARCHAR(32) NOT NULL,
    title VARCHAR(16) NOT NULL,
    data_json JSON NOT NULL,
    item_count INT NOT NULL DEFAULT 0,
    grid_size INT NOT NULL DEFAULT 20,
    download_count INT NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    reject_reason VARCHAR(80) NOT NULL DEFAULT '',
    reviewed_at DATETIME(3) NULL,
    reviewed_by VARCHAR(64) NOT NULL DEFAULT '',
    submit_kind VARCHAR(16) NOT NULL DEFAULT 'new',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    KEY idx_bearpit_templates_updated (updated_at),
    KEY idx_bearpit_templates_status_updated (status, updated_at)
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
    status varchar(16) NOT NULL DEFAULT 'pending',
    reject_reason varchar(80) NOT NULL DEFAULT '',
    reviewed_at timestamptz(3) NULL,
    reviewed_by varchar(64) NOT NULL DEFAULT '',
    submit_kind varchar(16) NOT NULL DEFAULT 'new',
    created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  );
  CREATE INDEX IF NOT EXISTS idx_bearpit_templates_updated ON bearpit_templates (updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_bearpit_templates_status_updated ON bearpit_templates (status, updated_at DESC);
`;

function normalizeTemplateTitle(value) {
  const title = Array.from(String(value || '').trim().replace(/\s+/g, ' ')).slice(0, MAX_TITLE_LEN).join('');
  return title || null;
}

function normalizeTemplateStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (status === STATUS_APPROVED || status === STATUS_REJECTED || status === STATUS_PENDING) return status;
  return STATUS_PENDING;
}

function normalizeSubmitKind(value) {
  return String(value || '').trim().toLowerCase() === SUBMIT_KIND_UPDATE ? SUBMIT_KIND_UPDATE : SUBMIT_KIND_NEW;
}

function normalizeRejectReason(value) {
  return Array.from(String(value || '').trim().replace(/\s+/g, ' ')).slice(0, MAX_REJECT_REASON).join('');
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

function extractTemplatePreviewItems(data) {
  if (!data || typeof data !== 'object') return { gs: 20, items: [] };
  let items = [];
  if (Array.isArray(data.i) && Number(data.v) === 2) {
    items = data.i.map((arr) => ({
      r: Number(arr && arr[0]) || 0,
      c: Number(arr && arr[1]) || 0,
      s: Number(arr && arr[2]) || 1,
      n: String((arr && arr[3]) || ''),
      i: String((arr && arr[4]) || '')
    }));
  } else if (Array.isArray(data.items)) {
    items = data.items.map((it) => ({
      r: Number(it.r) || 0,
      c: Number(it.c) || 0,
      s: Number(it.s) || 1,
      n: String(it.n || ''),
      i: String(it.i || '')
    }));
  }
  return {
    gs: gridSizeOf(data),
    items,
    bset: !!data.bset,
    bx: Number(data.bx) || 0,
    by: Number(data.by) || 0
  };
}

function parseTemplateData(row) {
  if (!row) return null;
  if (row.data_json && typeof row.data_json === 'object') return row.data_json;
  return null;
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

function mapAdminTemplateRow(row, options) {
  const opts = options || {};
  const data = parseTemplateData(row);
  return {
    templateKey: String(row.template_key || ''),
    title: String(row.title || ''),
    itemCount: Number(row.item_count || 0),
    gs: Number(row.grid_size || 20),
    downloadCount: Number(row.download_count || 0),
    status: normalizeTemplateStatus(row.status),
    rejectReason: String(row.reject_reason || ''),
    reviewedAt: row.reviewed_at || null,
    reviewedBy: String(row.reviewed_by || ''),
    submitKind: normalizeSubmitKind(row.submit_kind),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data: opts.includeData ? data : undefined,
    preview: opts.includeData ? extractTemplatePreviewItems(data) : undefined
  };
}

function mapOwnerStatus(row) {
  return {
    templateKey: String(row.template_key || ''),
    status: normalizeTemplateStatus(row.status),
    rejectReason: String(row.reject_reason || ''),
    title: String(row.title || ''),
    submitKind: normalizeSubmitKind(row.submit_kind)
  };
}

function reviewerName(admin) {
  return String((admin && (admin.username || admin.login_id || admin.id)) || '').slice(0, 64);
}

function mountBearpitTemplateRoutes(deps) {
  const { app, queryRows, queryOne, execute, pgDatabase, requireAdmin, auditAdminAction } = deps;
  let tableReady = false;

  async function ensureReviewSchema() {
    if (pgDatabase) {
      await execute("ALTER TABLE bearpit_templates ADD COLUMN IF NOT EXISTS status varchar(16) NOT NULL DEFAULT 'approved'");
      await execute("ALTER TABLE bearpit_templates ADD COLUMN IF NOT EXISTS reject_reason varchar(80) NOT NULL DEFAULT ''");
      await execute('ALTER TABLE bearpit_templates ADD COLUMN IF NOT EXISTS reviewed_at timestamptz(3) NULL');
      await execute("ALTER TABLE bearpit_templates ADD COLUMN IF NOT EXISTS reviewed_by varchar(64) NOT NULL DEFAULT ''");
      await execute("ALTER TABLE bearpit_templates ADD COLUMN IF NOT EXISTS submit_kind varchar(16) NOT NULL DEFAULT 'new'");
      await execute('CREATE INDEX IF NOT EXISTS idx_bearpit_templates_status_updated ON bearpit_templates (status, updated_at DESC)');
      return;
    }
    const alters = [
      "ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'approved'",
      "ADD COLUMN reject_reason VARCHAR(80) NOT NULL DEFAULT ''",
      'ADD COLUMN reviewed_at DATETIME(3) NULL',
      "ADD COLUMN reviewed_by VARCHAR(64) NOT NULL DEFAULT ''",
      "ADD COLUMN submit_kind VARCHAR(16) NOT NULL DEFAULT 'new'"
    ];
    for (const ddl of alters) {
      try {
        await execute(`ALTER TABLE bearpit_templates ${ddl}`);
      } catch (_e) {}
    }
    try {
      await execute('CREATE INDEX idx_bearpit_templates_status_updated ON bearpit_templates (status, updated_at)');
    } catch (_e) {}
  }

  async function ensureTable() {
    if (tableReady) return;
    await execute(pgDatabase ? BEARPIT_TEMPLATES_DDL_PG : BEARPIT_TEMPLATES_DDL_MYSQL);
    await ensureReviewSchema();
    tableReady = true;
  }

  async function getRow(key) {
    return queryOne(
      `
      SELECT template_key, owner_token, title, data_json, item_count, grid_size, download_count,
             status, reject_reason, reviewed_at, reviewed_by, submit_kind, created_at, updated_at
      FROM bearpit_templates
      WHERE template_key = ?
      LIMIT 1
      `,
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
        WHERE status = ?
        ORDER BY updated_at DESC, created_at DESC
        LIMIT ${MAX_MARKET}
        `,
        [STATUS_APPROVED]
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
              ? "UPDATE bearpit_templates SET title = ?, data_json = ?::jsonb, item_count = ?, grid_size = ?, status = ?, submit_kind = ?, reject_reason = '', reviewed_at = NULL, reviewed_by = '', updated_at = CURRENT_TIMESTAMP(3) WHERE template_key = ?"
              : "UPDATE bearpit_templates SET title = ?, data_json = ?, item_count = ?, grid_size = ?, status = ?, submit_kind = ?, reject_reason = '', reviewed_at = NULL, reviewed_by = '', updated_at = CURRENT_TIMESTAMP(3) WHERE template_key = ?",
            [title, json, itemCount, gs, STATUS_PENDING, SUBMIT_KIND_UPDATE, existingKey]
          );
          return res.json({
            ok: true,
            updated: true,
            templateKey: existingKey,
            ownerToken: existingToken,
            title,
            status: STATUS_PENDING,
            submitKind: SUBMIT_KIND_UPDATE
          });
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
              ? 'INSERT INTO bearpit_templates (template_key, owner_token, title, data_json, item_count, grid_size, download_count, status, reject_reason, submit_kind, created_at, updated_at) VALUES (?, ?, ?, ?::jsonb, ?, ?, 0, ?, \'\', ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))'
              : 'INSERT INTO bearpit_templates (template_key, owner_token, title, data_json, item_count, grid_size, download_count, status, reject_reason, submit_kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, \'\', ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))',
            [candidate, ownerToken, title, json, itemCount, gs, STATUS_PENDING, SUBMIT_KIND_NEW]
          );
          templateKey = candidate;
          break;
        } catch (err) {
          if (!String(err?.message || '').toLowerCase().includes('duplicate') && !String(err?.code || '').toUpperCase().includes('DUP')) throw err;
        }
      }
      if (!templateKey) return res.status(503).json({ error: 'TEMPLATE_KEY_UNAVAILABLE' });
      return res.json({ ok: true, updated: false, templateKey, ownerToken, title, status: STATUS_PENDING, submitKind: SUBMIT_KIND_NEW });
    } catch (err) {
      console.error('bearpit template publish failed:', err);
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  app.post('/api/bearpit/mp/templates/status-batch', async (req, res) => {
    try {
      await ensureTable();
      const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 30) : [];
      const statuses = [];
      for (const item of items) {
        const key = String((item && (item.templateKey || item.key)) || '').trim();
        const token = String((item && (item.ownerToken || item.token)) || '').trim();
        if (!KEY_RE.test(key) || !TOKEN_RE.test(token)) {
          statuses.push({ templateKey: key, missing: true });
          continue;
        }
        const row = await getRow(key);
        if (!row || String(row.owner_token) !== token) {
          statuses.push({ templateKey: key, missing: true });
          continue;
        }
        statuses.push(mapOwnerStatus(row));
      }
      return res.json({ ok: true, statuses });
    } catch (err) {
      console.error('bearpit template status batch failed:', err);
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  app.get('/api/bearpit/mp/templates/:key', async (req, res) => {
    try {
      await ensureTable();
      const key = String(req.params.key || '').trim();
      if (!KEY_RE.test(key)) return res.status(400).json({ error: 'BAD_KEY' });
      const row = await getRow(key);
      if (!row || normalizeTemplateStatus(row.status) !== STATUS_APPROVED) return res.status(404).json({ error: 'NOT_FOUND' });
      const data = parseTemplateData(row);
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

  app.post('/api/bearpit/mp/templates/:key/unpublish', async (req, res) => {
    try {
      await ensureTable();
      const key = String(req.params.key || '').trim();
      const token = String(req.body?.ownerToken || req.body?.token || '').trim();
      if (!KEY_RE.test(key) || !TOKEN_RE.test(token)) return res.status(400).json({ error: 'BAD_REQUEST' });
      const row = await getRow(key);
      if (!row) return res.json({ ok: true, missing: true });
      if (String(row.owner_token) !== token) return res.status(403).json({ error: 'FORBIDDEN' });
      await execute('DELETE FROM bearpit_templates WHERE template_key = ?', [key]);
      return res.json({ ok: true });
    } catch (err) {
      console.error('bearpit template unpublish failed:', err);
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  if (typeof requireAdmin === 'function') {
    app.get('/api/admin/bearpit-templates', async (req, res) => {
      try {
        const admin = await requireAdmin(req, res);
        if (!admin) return;
        await ensureTable();
        const statusRaw = String(req.query.status || STATUS_PENDING).trim().toLowerCase();
        const status = statusRaw === 'all' || statusRaw === STATUS_APPROVED || statusRaw === STATUS_REJECTED || statusRaw === STATUS_PENDING
          ? statusRaw
          : STATUS_PENDING;
        const q = String(req.query.q || '').trim();
        const params = [];
        let where = 'WHERE 1=1';
        if (status !== 'all') {
          where += ' AND status = ?';
          params.push(status);
        }
        if (q) {
          where += ' AND (title LIKE ? OR template_key LIKE ?)';
          params.push(`%${q}%`, `%${q}%`);
        }
        const rows = await queryRows(
          `
          SELECT template_key, title, item_count, grid_size, download_count, status, reject_reason,
                 reviewed_at, reviewed_by, submit_kind, created_at, updated_at
          FROM bearpit_templates
          ${where}
          ORDER BY updated_at DESC, created_at DESC
          LIMIT ${ADMIN_LIST_LIMIT}
          `,
          params
        );
        const countRow = await queryOne(
          `SELECT COUNT(*) AS n FROM bearpit_templates ${where}`,
          params
        );
        return res.json({
          total: Number(countRow && countRow.n) || (rows || []).length,
          rows: (rows || []).map((row) => mapAdminTemplateRow(row))
        });
      } catch (err) {
        console.error('admin bearpit templates list failed:', err);
        return res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    });

    app.get('/api/admin/bearpit-templates/:key', async (req, res) => {
      try {
        const admin = await requireAdmin(req, res);
        if (!admin) return;
        await ensureTable();
        const key = String(req.params.key || '').trim();
        if (!KEY_RE.test(key)) return res.status(400).json({ error: 'BAD_KEY' });
        const row = await getRow(key);
        if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
        return res.json({ row: mapAdminTemplateRow(row, { includeData: true }) });
      } catch (err) {
        console.error('admin bearpit template get failed:', err);
        return res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    });

    app.post('/api/admin/bearpit-templates/:key/approve', async (req, res) => {
      try {
        const admin = await requireAdmin(req, res);
        if (!admin) return;
        await ensureTable();
        const key = String(req.params.key || '').trim();
        if (!KEY_RE.test(key)) return res.status(400).json({ error: 'BAD_KEY' });
        const row = await getRow(key);
        if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
        await execute(
          "UPDATE bearpit_templates SET status = ?, reject_reason = '', reviewed_at = CURRENT_TIMESTAMP(3), reviewed_by = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE template_key = ?",
          [STATUS_APPROVED, reviewerName(admin), key]
        );
        if (typeof auditAdminAction === 'function') {
          await auditAdminAction(req, {
            actor: admin,
            action: 'bearpit_template.approve',
            targetType: 'bearpit_template',
            targetId: key,
            riskLevel: 'info',
            summary: `通过小程序熊坑模板「${row.title}」`
          });
        }
        const updated = await getRow(key);
        return res.json({ ok: true, row: mapAdminTemplateRow(updated) });
      } catch (err) {
        console.error('admin bearpit template approve failed:', err);
        return res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    });

    app.post('/api/admin/bearpit-templates/:key/reject', async (req, res) => {
      try {
        const admin = await requireAdmin(req, res);
        if (!admin) return;
        await ensureTable();
        const key = String(req.params.key || '').trim();
        if (!KEY_RE.test(key)) return res.status(400).json({ error: 'BAD_KEY' });
        const row = await getRow(key);
        if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
        const reason = normalizeRejectReason(req.body?.reason || req.body?.rejectReason);
        await execute(
          'UPDATE bearpit_templates SET status = ?, reject_reason = ?, reviewed_at = CURRENT_TIMESTAMP(3), reviewed_by = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE template_key = ?',
          [STATUS_REJECTED, reason, reviewerName(admin), key]
        );
        if (typeof auditAdminAction === 'function') {
          await auditAdminAction(req, {
            actor: admin,
            action: 'bearpit_template.reject',
            targetType: 'bearpit_template',
            targetId: key,
            riskLevel: 'watch',
            summary: `不通过小程序熊坑模板「${row.title}」`
          });
        }
        const updated = await getRow(key);
        return res.json({ ok: true, row: mapAdminTemplateRow(updated) });
      } catch (err) {
        console.error('admin bearpit template reject failed:', err);
        return res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    });

    app.post('/api/admin/bearpit-templates/:key/delete', async (req, res) => {
      try {
        const admin = await requireAdmin(req, res);
        if (!admin) return;
        await ensureTable();
        const key = String(req.params.key || '').trim();
        if (!KEY_RE.test(key)) return res.status(400).json({ error: 'BAD_KEY' });
        const row = await getRow(key);
        if (!row) return res.json({ ok: true, missing: true });
        await execute('DELETE FROM bearpit_templates WHERE template_key = ?', [key]);
        if (typeof auditAdminAction === 'function') {
          await auditAdminAction(req, {
            actor: admin,
            action: 'bearpit_template.delete',
            targetType: 'bearpit_template',
            targetId: key,
            riskLevel: 'watch',
            summary: `删除小程序熊坑模板「${row.title}」`
          });
        }
        return res.json({ ok: true });
      } catch (err) {
        console.error('admin bearpit template delete failed:', err);
        return res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    });
  }
}

module.exports = {
  MAX_TITLE_LEN,
  MAX_MARKET,
  MAX_REJECT_REASON,
  STATUS_PENDING,
  STATUS_APPROVED,
  STATUS_REJECTED,
  SUBMIT_KIND_NEW,
  SUBMIT_KIND_UPDATE,
  BEARPIT_TEMPLATES_DDL_MYSQL,
  BEARPIT_TEMPLATES_DDL_PG,
  normalizeTemplateTitle,
  normalizeTemplateStatus,
  normalizeSubmitKind,
  normalizeRejectReason,
  isBeaPitTemplateData,
  extractTemplatePreviewItems,
  mountBearpitTemplateRoutes
};
