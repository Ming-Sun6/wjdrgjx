const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  validateGiftPackPayload,
  validateSections,
  buildSearchBlobs,
  normalizeGiftText
} = require('../gift-packs');

test('validateGiftPackPayload accepts a standard pack shape', () => {
  const valid = validateGiftPackPayload(
    {
      category: 'regular',
      name: '火晶微粒礼包',
      sections: [
        {
          title: '礼包内容',
          columns: ['火晶微粒', '钢材'],
          rows: [
            ['30', '30', '10000'],
            ['68', '60', '20000']
          ]
        }
      ]
    },
    { requireCategory: true }
  );
  assert.equal(valid.error, undefined);
  assert.equal(valid.value.name, '火晶微粒礼包');
  assert.equal(valid.value.sections.length, 1);
});

test('validateSections rejects row width mismatch', () => {
  const result = validateSections([
    {
      title: '礼包内容',
      columns: ['A', 'B'],
      rows: [['30', '1']]
    }
  ]);
  assert.equal(result.error, 'ROW_WIDTH');
});

test('buildSearchBlobs normalizes searchable text like the gift pages', () => {
  const blobs = buildSearchBlobs({
    regular: [
      {
        name: '火晶微粒礼包',
        sections: [{ title: '礼包内容', columns: ['火晶微粒'], rows: [['30', '1']] }]
      }
    ]
  });
  assert.equal(blobs.regular.length, 1);
  assert.match(blobs.regular[0].t, /火晶微粒/);
  assert.equal(normalizeGiftText('火晶·微粒'), normalizeGiftText('火晶 微粒'));
});

test('regular and special gift pages load data from shared API script', () => {
  for (const fileName of ['regular-gift-data.html', 'special-gift-data.html']) {
    const html = fs.readFileSync(
      path.join(__dirname, '..', 'public', 'function', 'Zero', fileName),
      'utf8'
    );
    assert.match(html, /gift-data-page\.js/);
    assert.match(html, /initGiftDataPage\(\{ category:/);
    assert.doesNotMatch(html, /const packs = \[/);
  }
});

test('admin page includes gift pack management menu and script', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'function', 'admin.html'), 'utf8');
  assert.match(html, /data-page="gift-packs"/);
  assert.match(html, /admin-gift-packs-page\.js/);
  assert.match(html, /id="giftPackEditor"/);
});

test('server mounts gift pack routes', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', 'gift-packs.js'), 'utf8');
  assert.match(serverSource, /mountGiftPackRoutes\(/);
  assert.match(serverSource, /seedGiftPacksIfEmpty\(/);
  assert.match(moduleSource, /\/api\/gift-packs/);
});
