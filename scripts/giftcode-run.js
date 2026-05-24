const path = require('path');
const { spawn } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', 'wjdr-giftcode', '.env') });

const giftcodeDir = path.join(__dirname, '..', 'wjdr-giftcode');
const pythonCandidates = [
  process.env.PYTHON_CMD,
  'python',
  'py',
  'C:\\Python314\\python.exe',
  'C:\\Python313\\python.exe',
  'C:\\Python312\\python.exe',
  'C:\\Python311\\python.exe'
].filter(Boolean);

function resolvePythonCmd() {
  const fs = require('fs');
  const { spawnSync } = require('child_process');
  for (const cmd of pythonCandidates) {
    const args = cmd === 'py' ? ['-3', '-c', 'import sys; print(sys.executable)'] : ['-c', 'import sys; print(sys.executable)'];
    if (cmd.includes('\\') && !fs.existsSync(cmd)) continue;
    try {
      const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true });
      if (r.status === 0 && r.stdout && r.stdout.trim()) return r.stdout.trim();
    } catch (_e) {}
  }
  return process.env.PYTHON_CMD || 'python';
}

const pythonCmd = resolvePythonCmd();

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
