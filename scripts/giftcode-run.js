const path = require('path');
const { spawn } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', 'wjdr-giftcode', '.env') });

const giftcodeDir = path.join(__dirname, '..', 'wjdr-giftcode');
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

function resolvePythonCmd() {
  const fs = require('fs');
  const { spawnSync } = require('child_process');
  for (const cmd of pythonCandidates) {
    const args = cmd === 'py' ? ['-3', '-c', 'import sys; print(sys.executable)'] : ['-c', 'import sys; print(sys.executable)'];
    if (cmd.includes('\\') && !fs.existsSync(cmd)) continue;
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

const pythonCmd = resolvePythonCmd();
if (!pythonCmd) {
  console.error('Python 3 not found. Set PYTHON_CMD in .env (e.g. C:\\Python314\\python.exe)');
  process.exit(1);
}

const env = {
  ...process.env,
  GIFTCODE_URL_PREFIX: process.env.GIFTCODE_URL_PREFIX || '/giftcode',
  GIFTCODE_PORT: process.env.GIFTCODE_PORT || '5201'
};

const child = spawn(pythonCmd, ['main.py'], {
  cwd: giftcodeDir,
  env,
  stdio: 'inherit',
  windowsHide: true
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(code == null ? 1 : code);
});

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
