'use strict';

const { countLayoutItems } = require('./bearpit-backups');

const EXPORT_MAX_ROWS = 5000;
const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 200;

function parseListInt(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(max, Math.floor(n));
}

function buildUserFilter(q, userId) {
  const parts = [];
  const params = [];
  const text = String(q || '').trim();
  if (text) {
    if (/^\d+$/.test(text)) {
      parts.push('(u.id = ? OR u.login_id LIKE ? OR u.username LIKE ?)');
      params.push(Number(text), `%${text}%`, `%${text}%`);
    } else {
      parts.push('(u.login_id LIKE ? OR u.username LIKE ?)');
      params.push(`%${text}%`, `%${text}%`);
    }
  }
  const uid = Number(userId);
  if (Number.isFinite(uid) && uid > 0) {
    parts.push('u.id = ?');
    params.push(uid);
  }
  return {
    sql: parts.length ? ` AND ${parts.join(' AND ')}` : '',
    params
  };
}

function itemCountExpr(pgDatabase, tableAlias) {
  const col = `${tableAlias}.data_json`;
  if (pgDatabase) {
    return `COALESCE(jsonb_array_length((${col})::jsonb->'items'), 0)`;
  }
  return `IFNULL(JSON_LENGTH(JSON_EXTRACT(${col}, '$.items')), 0)`;
}

function mapAdminRow(row, options) {
  const opts = options || {};
  const data =
    row.data_json && typeof row.data_json === 'object'
      ? row.data_json
      : safeJsonParse(String(row.data_json || 'null'), null);
  const itemCount =
    row.item_count != null && row.item_count !== ''
      ? Number(row.item_count)
      : countLayoutItems(data || {});
  return {
    userId: Number(row.user_id),
    loginId: String(row.login_id || ''),
    username: String(row.username || ''),
    tool: String(row.tool_type || 'standard'),
    recordType: String(row.record_type || 'current'),
    recordId: row.backup_id != null ? Number(row.backup_id) : Number(row.user_id),
    title: String(row.title || ''),
    itemCount,
    recordAt: row.record_at,
    data: opts.includeData ? data : undefined,
    dataPreview: opts.includeData ? undefined : summarizeData(data)
  };
}

function summarizeData(data) {
  if (!data || typeof data !== 'object') return '';
  try {
    const raw = JSON.stringify(data);
    return raw.length > 120 ? `${raw.slice(0, 117)}…` : raw;
  } catch (_e) {
    return '';
  }
}

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch (_e) {
    return fallback;
  }
}

function csvCell(value) {
  const text = String(value == null ? '' : value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function rowsToCsv(rows) {
  const header = ['用户ID', '登录ID', '用户名', '类型', '方案名称', '物品数', '时间', '熊坑数据JSON'];
  const lines = [header.map(csvCell).join(',')];
  rows.forEach(function (row) {
    lines.push(
      [
        row.userId,
        row.loginId,
        row.username,
        row.recordType === 'backup' ? '历史备份' : '当前存档',
        row.title,
        row.itemCount,
        row.recordAt,
        JSON.stringify(row.data || null)
      ]
        .map(csvCell)
        .join(',')
    );
  });
  return `\ufeff${lines.join('\r\n')}`;
}

async function fetchAdminBearpitRows(deps, filters) {
  const { queryRows, pgDatabase } = deps;
  const source = String(filters.source || 'current').trim();
  const tool = String(filters.tool || 'standard').trim();
  const minItems = filters.minItems != null && filters.minItems !== '' ? Number(filters.minItems) : null;
  const userFilter = buildUserFilter(filters.q, filters.userId);
  const limit = parseListInt(filters.limit, LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT);
  const offset = parseListInt(filters.offset, 0, 1000000);
  const itemCurrent = itemCountExpr(pgDatabase, 'bl');
  const itemBackup = 'bb.item_count';

  const queries = [];

  if ((tool === 'standard' || tool === 'all') && (source === 'current' || source === 'all')) {
    let sql = `
      SELECT
        bl.user_id,
        u.login_id,
        u.username,
        'current' AS record_type,
        NULL AS backup_id,
        'standard' AS tool_type,
        '当前存档' AS title,
        bl.data_json,
        ${itemCurrent} AS item_count,
        bl.updated_at AS record_at
      FROM bearpit_layouts bl
      INNER JOIN users u ON u.id = bl.user_id
      WHERE 1=1
      ${userFilter.sql}
    `;
    const params = userFilter.params.slice();
    if (Number.isFinite(minItems)) {
      sql += ` AND ${itemCurrent} >= ?`;
      params.push(minItems);
    }
    queries.push({ sql, params });
  }

  if ((tool === 'standard' || tool === 'all') && (source === 'backup' || source === 'all')) {
    let sql = `
      SELECT
        bb.user_id,
        u.login_id,
        u.username,
        'backup' AS record_type,
        bb.id AS backup_id,
        'standard' AS tool_type,
        bb.title,
        bb.data_json,
        ${itemBackup} AS item_count,
        bb.created_at AS record_at
      FROM bearpit_layout_backups bb
      INNER JOIN users u ON u.id = bb.user_id
      WHERE 1=1
      ${userFilter.sql}
    `;
    const params = userFilter.params.slice();
    if (Number.isFinite(minItems)) {
      sql += ' AND bb.item_count >= ?';
      params.push(minItems);
    }
    queries.push({ sql, params });
  }

  if (tool === 'simple' || tool === 'all') {
    let sql = `
      SELECT
        sb.user_id,
        u.login_id,
        u.username,
        'backup' AS record_type,
        sb.id AS backup_id,
        sb.title,
        'simple' AS tool_type,
        sb.data_json,
        sb.item_count AS item_count,
        sb.created_at AS record_at
      FROM bearpit_simple_layout_backups sb
      INNER JOIN users u ON u.id = sb.user_id
      WHERE 1=1
      ${userFilter.sql}
    `;
    const params = userFilter.params.slice();
    if (Number.isFinite(minItems)) {
      sql += ' AND sb.item_count >= ?';
      params.push(minItems);
    }
    queries.push({ sql, params });
  }

  const merged = [];
  for (const part of queries) {
    const rows = await queryRows(part.sql, part.params);
    rows.forEach(function (row) {
      merged.push(row);
    });
  }

  merged.sort(function (a, b) {
    const ta = new Date(a.record_at).getTime();
    const tb = new Date(b.record_at).getTime();
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });

  const total = merged.length;
  const slice = merged.slice(offset, offset + limit);
  return {
    total,
    rows: slice.map(function (row) {
      return mapAdminRow(row, { includeData: !!filters.includeData });
    })
  };
}

function mountBearpitAdminRoutes(deps) {
  const { app, queryOne, requireAdmin, auditAdminAction } = deps;

  app.get('/api/admin/bearpit-layouts', async (req, res) => {
    try {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const result = await fetchAdminBearpitRows(deps, {
        q: req.query.q,
        userId: req.query.userId,
        source: req.query.source || 'current',
        tool: req.query.tool || 'standard',
        minItems: req.query.minItems,
        limit: req.query.limit,
        offset: req.query.offset,
        includeData: false
      });
      return res.json({ total: result.total, rows: result.rows });
    } catch (err) {
      console.error('admin bearpit-layouts list failed:', err);
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  app.get('/api/admin/bearpit-layouts/:recordId', async (req, res) => {
    try {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const recordType = String(req.query.type || 'current').trim();
      const tool = String(req.query.tool || 'standard').trim();
      const recordId = Number(req.params.recordId);
      const userId = Number(req.query.userId);
      if (!Number.isFinite(recordId) || recordId <= 0) {
        return res.status(400).json({ error: 'BAD_ID' });
      }

      let row = null;
      if (recordType === 'backup' && tool === 'simple') {
        row = await queryOne(
          `
          SELECT
            sb.user_id,
            u.login_id,
            u.username,
            'backup' AS record_type,
            sb.id AS backup_id,
            sb.title,
            'simple' AS tool_type,
            sb.data_json,
            sb.item_count,
            sb.created_at AS record_at
          FROM bearpit_simple_layout_backups sb
          INNER JOIN users u ON u.id = sb.user_id
          WHERE sb.id = ?
          LIMIT 1
          `,
          [recordId]
        );
      } else if (recordType === 'backup') {
        row = await queryOne(
          `
          SELECT
            bb.user_id,
            u.login_id,
            u.username,
            'backup' AS record_type,
            bb.id AS backup_id,
            bb.title,
            bb.data_json,
            bb.item_count,
            bb.created_at AS record_at
          FROM bearpit_layout_backups bb
          INNER JOIN users u ON u.id = bb.user_id
          WHERE bb.id = ?
          LIMIT 1
          `,
          [recordId]
        );
      } else {
        if (!Number.isFinite(userId) || userId <= 0) {
          return res.status(400).json({ error: 'BAD_USER_ID' });
        }
        row = await queryOne(
          `
          SELECT
            bl.user_id,
            u.login_id,
            u.username,
            'current' AS record_type,
            NULL AS backup_id,
            '当前存档' AS title,
            bl.data_json,
            NULL AS item_count,
            bl.updated_at AS record_at
          FROM bearpit_layouts bl
          INNER JOIN users u ON u.id = bl.user_id
          WHERE bl.user_id = ?
          LIMIT 1
          `,
          [userId]
        );
      }
      if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
      return res.json({ row: mapAdminRow(row, { includeData: true }) });
    } catch (err) {
      console.error('admin bearpit-layouts get failed:', err);
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  app.get('/api/admin/bearpit-layouts-export.csv', async (req, res) => {
    try {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const result = await fetchAdminBearpitRows(deps, {
        q: req.query.q,
        userId: req.query.userId,
        source: req.query.source || 'current',
        tool: req.query.tool || 'standard',
        minItems: req.query.minItems,
        limit: EXPORT_MAX_ROWS,
        offset: 0,
        includeData: true
      });
      const csv = rowsToCsv(result.rows);
      await auditAdminAction(req, {
        action: 'bearpit_layouts_export',
        targetType: 'bearpit_layout',
        targetId: '',
        riskLevel: 'info',
        summary: `导出熊坑数据 ${result.rows.length} 条（筛选：${String(req.query.source || 'current')}）`
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="bearpit-layouts-${Date.now()}.csv"`
      );
      return res.send(csv);
    } catch (err) {
      console.error('admin bearpit-layouts export failed:', err);
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });
}

module.exports = {
  mountBearpitAdminRoutes,
  buildUserFilter,
  rowsToCsv,
  mapAdminRow
};
