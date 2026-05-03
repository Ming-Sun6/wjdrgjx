const fs = require('fs');
const path = require('path');

const ROOT = process.env.ROOT_DIR || 'C:\\inetpub\\wwwroot';

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.vs',
  '.tmp',
  '.superpowers',
  'private-backups'
]);

function shouldSkipDir(dirPath) {
  const name = path.basename(dirPath);
  return SKIP_DIR_NAMES.has(name);
}

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_e) {
    return;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isSymbolicLink && ent.isSymbolicLink()) continue;
    if (ent.isDirectory()) {
      if (shouldSkipDir(full)) continue;
      walk(full, out);
      continue;
    }
    if (ent.isFile() && ent.name.toLowerCase().endsWith('.html')) {
      out.push(full);
    }
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_e) {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (_e2) {
      return '';
    }
  }
}

function main() {
  const roots = String(process.env.ROOTS || '').trim()
    ? String(process.env.ROOTS).split(';').map((s) => s.trim()).filter(Boolean)
    : [ROOT];

  const files = [];
  for (const r of roots) walk(r, files);
  files.sort((a, b) => a.localeCompare(b, 'en'));

  const icpNumber = process.env.ICP_NUMBER || '冀ICP备2026012727号';
  const icpRegex = new RegExp(process.env.ICP_REGEX || 'ICP备', 'i');

  const missing = [];
  const hasIcp = [];
  for (const f of files) {
    const text = readText(f);
    const ok = icpRegex.test(text) && text.includes(icpNumber);
    if (ok) hasIcp.push(f);
    else missing.push(f);
  }

  process.stdout.write(`ROOT=${ROOT}\n`);
  process.stdout.write(`CHECK=must include "${icpNumber}" and match /${icpRegex.source}/i\n`);
  process.stdout.write(`HTML_TOTAL=${files.length}\n`);
  process.stdout.write(`HAS_ICP=${hasIcp.length}\n`);
  process.stdout.write(`MISSING_ICP=${missing.length}\n`);
  if (missing.length) {
    process.stdout.write('--- MISSING LIST START ---\n');
    for (const f of missing) process.stdout.write(`${f}\n`);
    process.stdout.write('--- MISSING LIST END ---\n');
  }
}

main();

