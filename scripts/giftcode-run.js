const path = require('path');
const { spawn } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', 'wjdr-giftcode', '.env') });

const giftcodeDir = path.join(__dirname, '..', 'wjdr-giftcode');
const pythonCmd = process.env.PYTHON_CMD || 'python';

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
