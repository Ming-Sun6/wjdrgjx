const path = require('path');
const { Service } = require('node-windows');

const service = new Service({
  name: 'wjgl-node',
  description: 'WJGL local node server (server.js)',
  script: path.join(__dirname, '..', 'server.js'),
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
  // node-windows 会把错误输出到控制台；这里保持最小化处理
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

service.install();

