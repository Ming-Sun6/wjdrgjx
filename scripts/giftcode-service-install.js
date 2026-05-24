const path = require('path');
const { Service } = require('node-windows');

const service = new Service({
  name: 'wjgl-giftcode',
  description: 'WJDR giftcode Flask service (port 5201, PostgreSQL RDS)',
  script: path.join(__dirname, 'giftcode-run.js'),
  workingDirectory: path.join(__dirname, '..'),
  wait: 2,
  grow: 0.5,
  maxRetries: 10
});

service.on('install', () => {
  service.start();
});

service.on('alreadyinstalled', () => {
  service.start();
});

service.on('error', (err) => {
  console.error(err);
  process.exitCode = 1;
});

service.install();
