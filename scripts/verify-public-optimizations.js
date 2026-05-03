'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const publicRoot = path.join(root, 'public');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const xlsxPages = [
  'public/function/equipment-training-calculator.html',
  'public/function/hero-equipment-calculator.html',
  'public/function/lord-equipment-gem-calculator.html',
];

for (const file of xlsxPages) {
  const html = read(file);
  assert(!html.includes('id="xlsxBtn"'), `${file} still contains the xlsx button`);
  assert(!html.includes('查看原表'), `${file} still shows the broken original-sheet link`);
  assert(!html.includes('../帮助/装备与练兵计算器.xlsx'), `${file} still links to the missing 帮助 folder`);
}

const rukou = read('public/rukou.html');
const unsafeDynamicImageSnippets = [
  'src="\'+safeUrl+\'"',
  'src="\'+safeSrc+\'"',
  'src="\'+safeCover+\'"',
  'src="\'+src+\'" alt="图片"',
];

for (const snippet of unsafeDynamicImageSnippets) {
  assert(!rukou.includes(snippet), `public/rukou.html still has an unescaped dynamic image src: ${snippet}`);
}

assert(rukou.includes('MAX_FORUM_IMAGE_FILE_SIZE'), 'forum cover image size limit constant is missing');
assert(rukou.includes('MAX_FORUM_EMBED_IMAGE_FILE_SIZE'), 'forum embedded image size limit constant is missing');
assert(rukou.includes('function validateForumImageFile'), 'forum image validation helper is missing');
assert(rukou.includes('validateForumImageFile(file, false)'), 'forum cover image handler does not validate files');
assert(rukou.includes('validateForumImageFile(file, true)'), 'forum embedded image handler does not validate files');

const tracker = read('public/function/analytics-tracker.js');
assert(!tracker.includes('contextmenu'), 'analytics tracker still blocks the context menu');
assert(!tracker.includes('__wjdrSourceFrictionBound'), 'analytics tracker still installs source-friction handlers');
assert(!tracker.includes('preventDefault()'), 'analytics tracker still prevents default browser behavior');

assert(!exists('public/function/admin.pre-backup-restore-20260408.html'), 'old admin backup is still published under public/function');
assert(exists('private-backups/admin.pre-backup-restore-20260408.html'), 'old admin backup was not moved to private-backups');
assert(!path.resolve(root, 'private-backups').startsWith(publicRoot), 'private-backups must stay outside public');

const giftHub = read('public/function/Zero/gift-reference-hub.html');
assert(
  giftHub.includes('function renderWorkbookGrid(gridSource, sheet)'),
  'gift hub renderWorkbookGrid does not accept the sheet parameter explicitly'
);
assert(
  giftHub.includes('renderWorkbookGrid(grid, sheet)'),
  'gift hub renderWorkbookGridSections does not pass sheet into renderWorkbookGrid'
);

console.log('public optimization checks passed');
