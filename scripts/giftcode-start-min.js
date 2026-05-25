/**
 * 后台启动 giftcode（供 start-giftcode-min.bat / Windows 服务调用）
 * 通过 Node 解析 Python 路径，避免 cmd 下 PYTHON_CMD 未导出或 PATH 仅有 Windows 商店占位。
 */
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', 'wjdr-giftcode', '.env') });

const rootDir = path.join(__dirname, '..');
const giftcodeDir = path.join(rootDir, 'wjdr-giftcode');
const logPath = path.join(rootDir, 'logs', 'giftcode.log');

const pythonCandidates = [
  process.env.PYTHON_CMD,
  'C:\\Python314\\python.exe',
  'C:\\Python313\\python.exe',
  'C:\\Python312\\python.exe',
  'C:\\Python311\\python.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python314', 'python.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'python.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
  'py',
  'python'
].filter(Boolean);

function appendLog(line) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, line + '\n', 'utf8');
}

function resolvePythonCmd() {
  for (const cmd of pythonCandidates) {
    if (cmd.includes('\\') && !fs.existsSync(cmd)) continue;
    const args = cmd === 'py'
      ? ['-3', '-c', 'import sys; print(sys.executable)']
      : ['-c', 'import sys; print(sys.executable)'];
    try {
      const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, timeout: 15000 });
      if (r.status === 0 && r.stdout && r.stdout.trim()) {
        const exe = r.stdout.trim();
        if (exe.toLowerCase().includes('windowsapps')) continue;
        if (fs.existsSync(exe)) return exe;
      }
    } catch (_e) {}
  }
  return null;
}

function pipInstall(pythonCmd) {
  appendLog('[giftcode-start-min] pip install -r requirements.txt ...');
  const r = spawnSync(pythonCmd, ['-m', 'pip', 'install', '-r', 'requirements.txt', '-q'], {
    cwd: giftcodeDir,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 300000
  });
  if (r.status !== 0) {
    appendLog((r.stderr || r.stdout || '').trim() || `[pip] exit ${r.status}`);
  }
  return r.status === 0;
}

const pythonCmd = resolvePythonCmd();
if (!pythonCmd) {
  appendLog('[giftcode-start-min] ERROR: Python 3 not found. Set PYTHON_CMD in .env');
  process.exit(1);
}

appendLog(`[${new Date().toLocaleString('zh-CN')}] giftcode-start-min using ${pythonCmd}`);
pipInstall(pythonCmd);

const env = {
  ...process.env,
  GIFTCODE_URL_PREFIX: process.env.GIFTCODE_URL_PREFIX || '/giftcode',
  GIFTCODE_PORT: process.env.GIFTCODE_PORT || '5201'
};

const out = fs.openSync(logPath, 'a');
const err = fs.openSync(logPath, 'a');

const child = spawn(pythonCmd, ['main.py'], {
  cwd: giftcodeDir,
  env,
  stdio: ['ignore', out, err],
  windowsHide: true,
  detached: false
});

child.on('exit', (code, signal) => {
  appendLog(`[giftcode-start-min] main.py exited code=${code} signal=${signal || ''}`);
  process.exit(code == null ? 1 : code);
});

child.on('error', (err) => {
  appendLog(`[giftcode-start-min] spawn error: ${err.message}`);
  process.exit(1);
});
