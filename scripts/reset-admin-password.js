require('dotenv').config();

const crypto = require('crypto');
const { createPostgresPool } = require('../postgres-db');

const DEFAULT_ADMIN_LOGIN_ID = process.env.DEFAULT_ADMIN_LOGIN_ID || 'admin';

function hashPassword(password, saltHex) {
  const salt = saltHex || crypto.randomBytes(8).toString('hex');
  const hash = crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
  return `sha256$${salt}$${hash}`;
}

async function main() {
  const newPass = String(process.env.TEMP_ADMIN_PASSWORD || '');
  if (!newPass) throw new Error('TEMP_ADMIN_PASSWORD is required');

  const pool = createPostgresPool();
  if (!pool) throw new Error('PostgreSQL is not configured (.env)');

  try {
    const newHash = hashPassword(newPass);
    const res = await pool.query(
      'update users set password_hash=$1, is_admin=1, forum_publisher=1 where login_id=$2 returning id, login_id',
      [newHash, DEFAULT_ADMIN_LOGIN_ID]
    );
    if (res.rowCount === 0) throw new Error(`Admin user not found: ${DEFAULT_ADMIN_LOGIN_ID}`);

    process.stdout.write(`RESET_OK ${JSON.stringify(res.rows[0])}\n`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  process.stderr.write(`RESET_FAIL ${err.message}\n`);
  process.exit(1);
});

