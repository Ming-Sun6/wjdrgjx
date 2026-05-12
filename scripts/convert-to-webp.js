/**
 * 将 PNG / JPEG / TIFF / GIF 转为 WebP（同目录输出 basename.webp，不删除原文件）。
 *
 * 用法：
 *   node scripts/convert-to-webp.js <文件或目录> [更多路径...] [--quality=80]
 *
 * 示例：
 *   node scripts/convert-to-webp.js ./public/wjdr-home/logo.png
 *   node scripts/convert-to-webp.js ./uploads/forum --quality=75
 */
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

const INPUT_EXTS = new Set(['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.gif']);

function parseArgs(argv) {
  const paths = [];
  let quality = 80;
  for (const a of argv) {
    if (a.startsWith('--quality=')) {
      const q = Number(a.slice('--quality='.length));
      if (Number.isFinite(q) && q >= 1 && q <= 100) quality = q;
    } else if (a === '--help' || a === '-h') {
      return { help: true };
    } else if (!a.startsWith('-')) {
      paths.push(a);
    }
  }
  return { paths, quality };
}

async function isDir(p) {
  try {
    const st = await fsp.stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

async function collectFiles(root) {
  const out = [];
  async function walk(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) await walk(full);
      else if (ent.isFile()) out.push(full);
    }
  }
  await walk(root);
  return out;
}

async function convertOne(inputPath, quality) {
  const ext = path.extname(inputPath).toLowerCase();
  if (!INPUT_EXTS.has(ext)) return { status: 'skip', inputPath, reason: 'unsupported-type' };
  const base = path.basename(inputPath, ext);
  const outPath = path.join(path.dirname(inputPath), `${base}.webp`);
  await sharp(inputPath).webp({ quality }).toFile(outPath);
  return { status: 'ok', inputPath, outPath };
}

async function main() {
  const { paths, quality, help } = parseArgs(process.argv.slice(2));
  if (help || paths.length === 0) {
    console.log(`用法: node scripts/convert-to-webp.js <文件或目录> [...] [--quality=1-100]

在同目录生成 <原名>.webp，不删除原图。`);
    process.exit(help ? 0 : 1);
  }

  let ok = 0;
  let skip = 0;
  const errors = [];

  for (const raw of paths) {
    const p = path.resolve(raw);
    if (!(await fsp.stat(p).catch(() => null))) {
      errors.push(`不存在: ${p}`);
      continue;
    }
    const files = (await isDir(p)) ? await collectFiles(p) : [p];
    for (const file of files) {
      try {
        const r = await convertOne(file, quality);
        if (r.status === 'ok') {
          ok += 1;
          console.log(`${r.inputPath} -> ${r.outPath}`);
        } else skip += 1;
      } catch (e) {
        errors.push(`${file}: ${e && e.message ? e.message : e}`);
      }
    }
  }

  console.log(`\n完成: 转换 ${ok} 个, 跳过 ${skip} 个`);
  if (errors.length) {
    console.error('\n错误:');
    for (const line of errors) console.error(line);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
