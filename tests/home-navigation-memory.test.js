const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('public/function/home-app.js', 'utf8');

test('forum detail navigation saves and restores list state and scroll position', () => {
  assert.match(source, /FORUM_RETURN_STATE_KEY/);
  assert.match(source, /sessionStorage\.setItem\(FORUM_RETURN_STATE_KEY/);
  assert.match(source, /forumSection[\s\S]*forumMigrationGroup[\s\S]*forumPage[\s\S]*scrollY/);
  assert.match(source, /restoreForumReturnState/);
  assert.match(source, /restoreForumScrollPosition/);
  assert.doesNotMatch(source, /window\.open\('\/function\/forum-post\.html\?id='[\s\S]*?'_blank'/);
});

test('closing an inline forum detail restores the captured list scroll', () => {
  const openStart = source.indexOf('async function openForumView');
  const closeStart = source.indexOf('function closeForumView');
  const openBlock = source.slice(openStart, source.indexOf('\n}', openStart) + 2);
  const closeBlock = source.slice(closeStart, source.indexOf('\n}', closeStart) + 2);

  assert.match(openBlock, /forumViewReturnScrollY\s*=\s*getWindowScrollY\(\)/);
  assert.match(closeBlock, /restoreForumScrollPosition\(forumViewReturnScrollY\)/);
});

test('user profiles opened from points ranking return to the ranking modal', () => {
  assert.match(source, /returnTo:\s*'points-ranking'/);
  assert.match(source, /userHomeReturnContext/);
  assert.match(source, /restoreMePointsRanking/);
  assert.match(source, /closeUserHome\(\{\s*restoreParent:false\s*\}\)/);
});
