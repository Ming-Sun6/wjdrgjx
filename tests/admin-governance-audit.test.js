const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const { createGovernanceService } = require('../admin-governance');

const adminHtml = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'function', '_ops', 'console-7a9', 'internal', 'admin.html'),
  'utf8'
);
const adminJs = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'function', 'admin-governance.js'),
  'utf8'
);

function makeLog(id) {
  return {
    id,
    actor_id: 7,
    actor_login_id: 'admin_login',
    actor_username: 'Admin',
    action: 'announcement.publish',
    target_type: 'announcement',
    target_id: 'current',
    risk_level: 'watch',
    summary: 'publish announcement ' + id,
    metadata_json: '{}',
    created_at: '2026-09-16 10:00:00'
  };
}

function createFakeDb(options) {
  const rows = options || {};
  const calls = [];
  return {
    calls,
    queryOne: async (sql, params) => {
      calls.push({ type: 'one', sql, params });
      if (/COUNT\(\*\) AS c FROM admin_audit_logs/.test(sql) && !/risk_level IN/.test(sql)) {
        return { c: rows.auditTotal == null ? (rows.auditLogs || []).length : rows.auditTotal };
      }
      return { c: 0 };
    },
    queryRows: async (sql, params) => {
      calls.push({ type: 'rows', sql, params });
      if (/FROM admin_audit_logs/.test(sql)) return rows.auditLogs || [];
      return [];
    },
    execute: async () => ({ insertId: 1 }),
    formatSqlDateTime: (value) => String(value || ''),
    hashValue: (value) => (value ? `hash:${value}` : null)
  };
}

test('getAuditLogs returns total and page metadata for history browsing', async () => {
  const fake = createFakeDb({
    auditTotal: 120,
    auditLogs: [makeLog(20), makeLog(19)]
  });
  const service = createGovernanceService(fake);
  const result = await service.getAuditLogs({ page: 2, pageSize: 20 });

  assert.equal(result.total, 120);
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 20);
  assert.equal(result.take, 20);
  assert.equal(result.skip, 20);
  assert.equal(result.totalPages, 6);
  assert.equal(result.hasPrev, true);
  assert.equal(result.hasNext, true);
  assert.equal(result.logs.length, 2);

  const countCall = fake.calls.find((call) => call.type === 'one');
  const listCall = fake.calls.find((call) => call.type === 'rows');
  assert.match(countCall.sql, /COUNT\(\*\) AS c FROM admin_audit_logs/);
  assert.deepEqual(listCall.params.slice(-2), [20, 20]);
});

test('getAuditLogs clamps an out-of-range page back to the last page', async () => {
  const fake = createFakeDb({
    auditTotal: 25,
    auditLogs: [makeLog(1)]
  });
  const service = createGovernanceService(fake);
  const result = await service.getAuditLogs({ page: 9, pageSize: 50 });

  assert.equal(result.page, 1);
  assert.equal(result.totalPages, 1);
  assert.equal(result.skip, 0);
  assert.equal(result.hasPrev, false);
  assert.equal(result.hasNext, false);
});

test('governance page shows paginated operation history controls', () => {
  const governanceStart = adminHtml.indexOf('id="page-governance"');
  const governanceChunk = adminHtml.slice(governanceStart, adminHtml.indexOf('id="page-operations-dashboard"'));
  assert.match(governanceChunk, />操作记录</);
  assert.match(governanceChunk, /id="governanceAuditPrevBtn"/);
  assert.match(governanceChunk, /id="governanceAuditNextBtn"/);
  assert.match(governanceChunk, /id="governanceAuditPageSize"/);
  assert.match(governanceChunk, /每页 50 条/);
  assert.doesNotMatch(governanceChunk, /最近操作审计/);
});

test('governance client loads audit history with page and pageSize', () => {
  assert.match(adminJs, /source\.page = state\.auditPage/);
  assert.match(adminJs, /source\.pageSize = state\.auditPageSize/);
  assert.match(adminJs, /loadAuditLogs\(null, \{ resetPage: true \}\)/);
  assert.match(adminJs, /governanceAuditPrevBtn/);
  assert.match(adminJs, /governanceAuditNextBtn/);
});
