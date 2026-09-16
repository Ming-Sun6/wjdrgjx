const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizeTemplateTitle,
  normalizeTemplateStatus,
  normalizeRejectReason,
  isBeaPitTemplateData,
  extractTemplatePreviewItems,
  MAX_TITLE_LEN,
  MAX_REJECT_REASON,
  STATUS_PENDING,
  STATUS_APPROVED,
  STATUS_REJECTED
} = require('../bearpit-templates');

test('normalizeTemplateTitle trims and caps length', () => {
  assert.equal(normalizeTemplateTitle('  内圈炉  '), '内圈炉');
  assert.equal(normalizeTemplateTitle(''), null);
  assert.equal(normalizeTemplateTitle('甲'.repeat(20)).length, MAX_TITLE_LEN);
});

test('template payload requires a BeaPit layout with items', () => {
  assert.equal(isBeaPitTemplateData({ v: 1, items: [{ r: 1, c: 2, s: 2 }] }), true);
  assert.equal(isBeaPitTemplateData({ v: 2, i: [[1, 2, 2]] }), true);
  assert.equal(isBeaPitTemplateData({ v: 1, items: [] }), false);
  assert.equal(isBeaPitTemplateData({ grid: { rows: 21 }, placements: [] }), false);
  assert.equal(isBeaPitTemplateData(null), false);
});

test('template review helpers normalize status and reject reason', () => {
  assert.equal(normalizeTemplateStatus('approved'), STATUS_APPROVED);
  assert.equal(normalizeTemplateStatus('rejected'), STATUS_REJECTED);
  assert.equal(normalizeTemplateStatus(''), STATUS_PENDING);
  assert.equal(normalizeRejectReason('  内容不当  ').length > 0, true);
  assert.equal(normalizeRejectReason('甲'.repeat(120)).length, MAX_REJECT_REASON);
});

test('extractTemplatePreviewItems reads v1 items and v2 compact rows', () => {
  const v1 = extractTemplatePreviewItems({
    gs: 24,
    items: [{ r: 1, c: 2, s: 2, n: 'A', i: 'castle.png' }]
  });
  assert.equal(v1.gs, 24);
  assert.equal(v1.items.length, 1);
  assert.equal(v1.items[0].n, 'A');

  const v2 = extractTemplatePreviewItems({ v: 2, i: [[3, 4, 3, '', 'beartrap.png']] });
  assert.equal(v2.items[0].s, 3);
  assert.equal(v2.items[0].i, 'beartrap.png');
});

test('server mounts bearpit template market and admin review routes', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', 'bearpit-templates.js'), 'utf8');
  const schemaSource = fs.readFileSync(path.join(__dirname, '..', 'postgres-schema.js'), 'utf8');
  assert.match(serverSource, /mountBearpitTemplateRoutes\(/);
  assert.match(serverSource, /requireAdmin/);
  assert.match(moduleSource, /\/api\/bearpit\/mp\/templates/);
  assert.match(moduleSource, /\/api\/bearpit\/mp\/templates\/:key/);
  assert.match(moduleSource, /\/api\/bearpit\/mp\/templates\/:key\/unpublish/);
  assert.match(moduleSource, /\/api\/bearpit\/mp\/templates\/status-batch/);
  assert.match(moduleSource, /\/api\/admin\/bearpit-templates/);
  assert.match(moduleSource, /\/api\/admin\/bearpit-templates\/:key\/approve/);
  assert.match(moduleSource, /\/api\/admin\/bearpit-templates\/:key\/reject/);
  assert.match(moduleSource, /\/api\/admin\/bearpit-templates\/:key\/delete/);
  assert.match(moduleSource, /WHERE status = \?/);
  assert.match(moduleSource, /submit_kind = \?/);
  assert.match(moduleSource, /SUBMIT_KIND_UPDATE/);
  assert.match(schemaSource, /bearpit_templates/);
  assert.match(schemaSource, /reject_reason/);
  assert.match(schemaSource, /submit_kind/);
});

test('updating a published template always goes back to pending review', () => {
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', 'bearpit-templates.js'), 'utf8');
  assert.match(moduleSource, /status = \?, submit_kind = \?/);
  assert.match(moduleSource, /STATUS_PENDING, SUBMIT_KIND_UPDATE/);
  assert.match(moduleSource, /status: STATUS_PENDING,\s*submitKind: SUBMIT_KIND_UPDATE/s);
});

test('admin template list defaults to all statuses and returns counts', () => {
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', 'bearpit-templates.js'), 'utf8');
  const pageSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'function', 'admin-bearpit-templates-page.js'), 'utf8');
  const adminHtml = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'function', '_ops', 'console-7a9', 'internal', 'admin.html'),
    'utf8'
  );
  assert.match(moduleSource, /req\.query\.status \|\| 'all'/);
  assert.match(moduleSource, /SELECT status, COUNT\(\*\) AS n FROM bearpit_templates GROUP BY status/);
  assert.match(pageSource, /status: 'all'/);
  assert.match(adminHtml, /option value="all" selected/);
});

test('template status batch and download avoid extra layout payloads', () => {
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', 'bearpit-templates.js'), 'utf8');
  assert.match(moduleSource, /WHERE template_key IN \(/);
  assert.match(moduleSource, /includeData === false/);
  assert.match(moduleSource, /RETURNING title, data_json, item_count, grid_size/);
  assert.match(moduleSource, /tablePromise/);
});

// Model PostgreSQL's CREATE IF NOT EXISTS and ADD COLUMN IF NOT EXISTS behavior.
function schemaDatabase(existing) {
  let columns = existing ? new Set(['template_key', 'owner_token', 'title', 'data_json', 'item_count', 'grid_size', 'download_count', 'created_at', 'updated_at']) : null;
  let statusDefault;
  let indexReady = false;
  const review = ['status', 'reject_reason', 'reviewed_at', 'reviewed_by', 'submit_kind'];
  return {
    async execute(sql) {
      for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) {
        if (/^CREATE TABLE IF NOT EXISTS bearpit_templates/i.test(statement) && !columns) {
          columns = new Set([...review, 'updated_at']);
          statusDefault = 'pending';
        }
        const add = statement.match(/^ALTER TABLE bearpit_templates ADD COLUMN IF NOT EXISTS (\w+)/i);
        if (add && !columns.has(add[1])) {
          columns.add(add[1]);
          if (add[1] === 'status') statusDefault = 'approved';
        }
        if (/^CREATE INDEX IF NOT EXISTS idx_bearpit_templates_status_updated/i.test(statement)) {
          assert.ok(columns && columns.has('status'), 'status index created before status column');
          indexReady = true;
        }
      }
      return {};
    },
    verify() {
      for (const column of review) assert.ok(columns.has(column), `missing ${column}`);
      assert.equal(indexReady, true);
      assert.equal(statusDefault, existing ? 'approved' : 'pending');
    }
  };
}

for (const existing of [true, false]) {
  test(`template routes initialize ${existing ? 'legacy' : 'fresh'} PostgreSQL schema before serving requests`, async () => {
    const { mountBearpitTemplateRoutes } = require('../bearpit-templates');
    for (const [method, path, body] of [
      ['get', '/api/bearpit/mp/templates', {}],
      ['post', '/api/bearpit/mp/templates/status-batch', { items: [] }],
      ['post', '/api/bearpit/mp/templates', { title: '测试模板', data: { v: 1, gs: 20, items: [{ r: 1, c: 1, s: 3 }] } }]
    ]) {
      const db = schemaDatabase(existing);
      const routes = {};
      mountBearpitTemplateRoutes({
        app: { get: (p, h) => { routes['get ' + p] = h; }, post: (p, h) => { routes['post ' + p] = h; } },
        pgDatabase: {}, execute: db.execute,
        queryRows: async () => { db.verify(); return []; }, queryOne: async () => null
      });
      const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
      await routes[method + ' ' + path]({ body }, res);
      assert.equal(res.code, 200, path);
      assert.equal(res.body.ok, true);
      if (body.title) {
        assert.match(res.body.templateKey, /^[A-Za-z0-9]{16}$/);
        assert.equal(res.body.status, 'pending');
      }
      db.verify();
    }
  });
  test(`startup schema upgrades ${existing ? 'legacy' : 'fresh'} template table idempotently`, async () => {
    const { POSTGRES_SCHEMA_SQL } = require('../postgres-schema');
    const db = schemaDatabase(existing);
    const statements = POSTGRES_SCHEMA_SQL.filter(sql => /\bbearpit_templates\b/.test(sql));
    for (let run = 0; run < 2; run++) {
      for (const sql of statements) await db.execute(sql);
      db.verify();
    }
  });
}
