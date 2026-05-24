const path = require('path');
const { Service } = require('node-windows');

const service = new Service({
  name: 'wjgl-giftcode',
  script: path.join(__dirname, 'giftcode-run.js')
});

service.on('uninstall', () => {
  console.log('wjgl-giftcode service uninstalled.');
});

service.on('error', (err) => {
  console.error(err);
  process.exitCode = 1;
});

service.uninstall();
