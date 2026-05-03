const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_e) {}

const mysql = require('mysql2');
const { createPostgresPool, createPostgresDatabase } = require('../postgres-db');

// 站点静态资源由 IIS 直接服务，落在站点根目录 /uploads/avatars
const AVATAR_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
const AVATAR_PUBLIC_PREFIX = '/uploads/avatars/';

function createMysqlDatabase() {
  const pool = mysql.createPool({
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
  const db = pool.promise();
  return {
    async queryRows(sql, params) {
      const [rows] = await db.query(sql, params || []);
      return rows;
    },
    async execute(sql, params) {
      const [ret] = await db.query(sql, params || []);
      return ret;
    },
    async close() {
      await pool.end();
    }
  };
}

function createDatabase() {
  const pgPool = createPostgresPool();
  if (pgPool) {
    const pg = createPostgresDatabase(pgPool);
    return {
      queryRows: pg.queryRows,
      execute: pg.execute,
      async close() {
        await pgPool.end();
      }
    };
  }
  return createMysqlDatabase();
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

async function saveAvatarBuffer(userId, decoded) {
  await fs.promises.mkdir(AVATAR_UPLOAD_DIR, { recursive: true });
  const digest = crypto.createHash('sha1').update(decoded.buffer).digest('hex').slice(0, 16);
  const filename = `avatar_${Number(userId)}_${Date.now()}_${digest}.${decoded.ext}`;
  const absolutePath = path.join(AVATAR_UPLOAD_DIR, filename);
  await fs.promises.writeFile(absolutePath, decoded.buffer);
  return `${AVATAR_PUBLIC_PREFIX}${filename}`;
}

async function main() {
  const db = createDatabase();
  let converted = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const rows = await db.queryRows(
      'SELECT id, avatar_url FROM users WHERE avatar_url IS NOT NULL'
    );

    for (const row of rows) {
      const avatarUrl = String(row.avatar_url || '').trim();
      if (!/^data:image\//i.test(avatarUrl)) {
        skipped += 1;
        continue;
      }

      try {
        const decoded = decodeImageDataUrl(avatarUrl);
        if (!decoded || !decoded.buffer.length) {
          failed += 1;
          console.warn(`skip user ${row.id}: invalid data url`);
          continue;
        }

        const fileUrl = await saveAvatarBuffer(row.id, decoded);
        await db.execute('UPDATE users SET avatar_url = ? WHERE id = ?', [fileUrl, row.id]);
        converted += 1;
        console.log(`converted user ${row.id} -> ${fileUrl}`);
      } catch (err) {
        failed += 1;
        console.error(`failed user ${row.id}:`, err.message || err);
      }
    }

    console.log(`done. converted=${converted} skipped=${skipped} failed=${failed}`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
