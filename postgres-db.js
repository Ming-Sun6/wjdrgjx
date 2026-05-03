const { Pool } = require('pg');

function buildPostgresConfig(env = process.env) {
  const port = Number(env.PGPORT || 5432);
  const config = {
    host: env.PGHOST || '',
    port: Number.isFinite(port) ? port : 5432,
    user: env.PGUSER || '',
    password: env.PGPASSWORD || '',
    database: env.PGDATABASE || 'postgres',
    max: Number(env.PGPOOL_MAX || 10),
    idleTimeoutMillis: Number(env.PG_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(env.PG_CONNECT_TIMEOUT_MS || 10000)
  };

  const sslMode = String(env.PGSSLMODE || env.PGSSL || '').toLowerCase();
  if (sslMode === 'require' || sslMode === 'true' || sslMode === '1') {
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}

function isPostgresConfigured(config) {
  return !!(config && config.host && config.user && config.password && config.database);
}

function createPostgresPool(env = process.env) {
  const config = buildPostgresConfig(env);
  if (!isPostgresConfigured(config)) return null;
  return new Pool(config);
}

function translateMysqlPlaceholders(sql) {
  const source = normalizeMysqlSyntax(sql);
  let index = 0;
  let output = '';
  let quote = '';

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (quote) {
      output += ch;
      if (ch === quote) {
        if (next === quote) {
          output += next;
          i += 1;
        } else {
          quote = '';
        }
      } else if (ch === '\\' && next) {
        output += next;
        i += 1;
      }
      continue;
    }

    if (ch === '\'' || ch === '"') {
      quote = ch;
      output += ch;
      continue;
    }

    if (ch === '?') {
      index += 1;
      output += `$${index}`;
      continue;
    }

    output += ch;
  }

  return output;
}

function normalizeMysqlSyntax(sql) {
  return String(sql || '')
    .replace(/DATE_FORMAT\(([^,]+),\s*'([^']+)'\)/gi, (_match, expr, format) => `to_char(${expr.trim()}, '${toPostgresDateFormat(format)}')`)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/CAST\(([^)]+)\s+AS\s+CHAR\)/gi, 'CAST($1 AS TEXT)')
    .replace(/DATE_SUB\(NOW\(\),\s*INTERVAL\s+24\s+HOUR\)/gi, "(NOW() - INTERVAL '24 hours')")
    .replace(/DATE_SUB\(CURRENT_TIMESTAMP\(3\),\s*INTERVAL\s+1\s+MINUTE\)/gi, "(CURRENT_TIMESTAMP(3) - INTERVAL '1 minute')")
    .replace(/DATE\(([^)]+)\)\s*=\s*CURDATE\(\)/gi, '$1::date = CURRENT_DATE');
}

function toPostgresDateFormat(mysqlFormat) {
  return String(mysqlFormat || '')
    .replace(/%Y/g, 'YYYY')
    .replace(/%m/g, 'MM')
    .replace(/%d/g, 'DD')
    .replace(/%H/g, 'HH24')
    .replace(/%i/g, 'MI')
    .replace(/%s/g, 'SS');
}

function toMysqlCompatibleResult(result) {
  const first = result && Array.isArray(result.rows) ? result.rows[0] : null;
  return {
    rows: result?.rows || [],
    rowCount: result?.rowCount || 0,
    affectedRows: result?.rowCount || 0,
    insertId: first && first.id !== undefined ? Number(first.id) : 0
  };
}

const ROW_ALIAS_MAP = {
  followingcount: 'followingCount',
  followercount: 'followerCount',
  ifollow: 'iFollow',
  followsme: 'followsMe',
  likecount: 'likeCount',
  viewcount: 'viewCount',
  authorifollow: 'authorIFollow',
  favoritecount: 'favoriteCount',
  commentcount: 'commentCount',
  likedbyme: 'likedByMe',
  favoritedbyme: 'favoritedByMe',
  newusers: 'newUsers',
  activeusers: 'activeUsers',
  pendingreview: 'pendingReview',
  contenttext: 'contentText',
  contenthtml: 'contentHtml',
  coverimage: 'coverImage',
  coverimages: 'coverImages',
  userloginid: 'userLoginId',
  userusername: 'userUsername'
};

function normalizeRowAliases(row) {
  if (!row || typeof row !== 'object') return row;
  for (const [key, alias] of Object.entries(ROW_ALIAS_MAP)) {
    if (Object.prototype.hasOwnProperty.call(row, key) && !Object.prototype.hasOwnProperty.call(row, alias)) {
      row[alias] = row[key];
    }
  }
  return row;
}

function normalizeRows(rows) {
  return Array.isArray(rows) ? rows.map(normalizeRowAliases) : [];
}

function createPostgresDatabase(pool) {
  if (!pool || typeof pool.query !== 'function') {
    throw new Error('createPostgresDatabase requires a pg pool');
  }

  async function queryRows(sql, params) {
    const result = await pool.query(translateMysqlPlaceholders(sql), params || []);
    return normalizeRows(result.rows);
  }

  async function queryOne(sql, params) {
    const rows = await queryRows(sql, params);
    return rows[0] || null;
  }

  async function execute(sql, params) {
    const result = await pool.query(translateMysqlPlaceholders(sql), params || []);
    return toMysqlCompatibleResult(result);
  }

  async function runInTransaction(work) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tx = createPostgresDatabase(client);
      const result = await work(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_rollbackErr) {}
      throw err;
    } finally {
      client.release();
    }
  }

  return {
    queryRows,
    queryOne,
    execute,
    runInTransaction
  };
}

async function checkPostgresHealth(pool) {
  if (!pool) {
    return {
      ok: false,
      error: 'POSTGRES_NOT_CONFIGURED'
    };
  }

  const result = await pool.query('SELECT 1 AS ok, current_database() AS database, current_schema() AS schema, now() AS server_time');
  const row = result.rows[0] || {};

  return {
    ok: Number(row.ok) === 1,
    database: row.database,
    schema: row.schema,
    serverTime: row.server_time
  };
}

module.exports = {
  buildPostgresConfig,
  checkPostgresHealth,
  createPostgresDatabase,
  createPostgresPool,
  isPostgresConfigured,
  translateMysqlPlaceholders
};
