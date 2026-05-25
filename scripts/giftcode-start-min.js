/**
 * 后台启动 giftcode（供 start-giftcode-min.bat / Windows 服务调用）
 */
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const giftcodeDir = path.join(rootDir, 'wjdr-giftcode');
const logPath = path.join(rootDir, 'logs', 'giftcode.log');

require('dotenv').config({ path: path.join(rootDir, '.env') });
require('dotenv').config({ path: path.join(giftcodeDir, '.env') });

function appendLog(line) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, line + '\n', 'utf8');
}

function readPythonFromEnvFile() {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return null;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\uFEFF?PYTHON_CMD\s*=\s*(.+)\s*$/i) || line.match(/^PYTHON_CMD\s*=\s*(.+)\s*$/i);
    if (!m) continue;
    return m[1].replace(/^["']|["']$/g, '').trim();
  }
  return null;
}

function canRunPython(exe) {
  if (!exe) return false;
  const p = path.normalize(exe);
  if (!fs.existsSync(p)) return false;
  try {
    const r = spawnSync(p, ['--version'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 20000,
      env: process.env
    });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    return r.status === 0 || /python\s+\d/i.test(out);
  } catch (_e) {
    return false;
  }
}

function resolvePythonCmd() {
  const tried = [];
  const candidates = [
    process.env.PYTHON_CMD,
    readPythonFromEnvFile(),
    'C:\\Python314\\python.exe',
    'C:\\Python313\\python.exe',
    'C:\\Python312\\python.exe',
    'C:\\Python311\\python.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python314', 'python.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'python.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe')
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const cmd = String(raw).trim();
    if (!cmd || tried.includes(cmd)) continue;
    tried.push(cmd);

    if (cmd.includes('\\') || cmd.includes('/')) {
      if (canRunPython(cmd)) return path.normalize(cmd);
      continue;
    }

    if (cmd === 'py') {
      try {
        const r = spawnSync('py', ['-3', '-c', 'import sys; print(sys.executable)'], {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 20000
        });
        if (r.status === 0 && r.stdout && r.stdout.trim()) {
          const exe = r.stdout.trim();
          if (!exe.toLowerCase().includes('windowsapps') && canRunPython(exe)) return exe;
        }
      } catch (_e) {}
    }
  }

  appendLog(`[giftcode-start-min] tried Python paths: ${tried.join(' | ')}`);
  return null;
}

function pipInstall(pythonCmd) {
  appendLog('[giftcode-start-min] pip install -r requirements.txt ...');
  const r = spawnSync(pythonCmd, ['-m', 'pip', 'install', '-r', 'requirements.txt', '-q'], {
    cwd: giftcodeDir,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 300000,
    env: process.env
  });
  if (r.status !== 0) {
    appendLog((r.stderr || r.stdout || '').trim() || `[pip] exit ${r.status}`);
  }
  return r.status === 0;
}

const pythonCmd = resolvePythonCmd();
if (!pythonCmd) {
  appendLog('[giftcode-start-min] ERROR: Python 3 not found. Set PYTHON_CMD=C:\\Python314\\python.exe in project .env');
  process.exit(1);
}

appendLog(`[${new Date().toLocaleString('zh-CN')}] giftcode-start-min using ${pythonCmd}`);
pipInstall(pythonCmd);

const env = {
  ...process.env,
  PYTHON_CMD: pythonCmd,
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
