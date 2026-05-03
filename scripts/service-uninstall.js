const path = require('path');
const { Service } = require('node-windows');

const service = new Service({
  name: 'wjgl-node',
  script: path.join(__dirname, '..', 'server.js'),
  workingDirectory: path.join(__dirname, '..')
});

service.on('uninstall', () => {
  // eslint-disable-next-line no-console
  console.log('uninstalled');
});

service.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

service.uninstall();

