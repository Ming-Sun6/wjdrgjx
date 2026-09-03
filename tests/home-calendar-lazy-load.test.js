const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('home navigation exposes the five configurable entries in the required order', () => {
  const html = read('index.html');
  const nav = html.match(/<nav class="tab-bar" id="mainTabs">[\s\S]*?<\/nav>/)?.[0] || '';
  const ids = [...nav.matchAll(/data-home-nav-id="([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(ids, ['all', 'tools', 'forum', 'calendar', 'my']);
  assert.doesNotMatch(nav, /data-tab="calendar"[^>]*\shidden(?:\s|>)/);
});

test('all page has no static calendar panel and the calendar tab creates it on demand', () => {
  const html = read('index.html');
  const js = read('public/function/home-app.js');

  assert.doesNotMatch(html, /id="homeCalendarPanel"/);
  assert.doesNotMatch(html, /id="homeCalendarEmbedHost"/);
  assert.match(js, /function createCalendarPanel\s*\(/);
  assert.match(js, /panel\.id='homeCalendarPanel'/);
  assert.match(js, /host\.id='homeCalendarEmbedHost'/);
});

test('home app creates the calendar iframe only on calendar activation and supports retry', () => {
  const js = read('public/function/home-app.js');

  assert.match(js, /function ensureCalendarEmbed\s*\(/);
  assert.match(js, /activeTab==='calendar'[\s\S]{0,120}ensureCalendarEmbed\(\)/);
  assert.match(js, /iframe\.src='\/function\/calendar\.html\?embed=1'/);
  assert.match(js, /calendarEmbedLoaded/);
  assert.match(js, /calendarEmbedRetry/);
  assert.match(js, /homeNavigationReady/);
  assert.match(js, /if\(!homeNavigationReady\) return/);
});

test('leaving calendar destroys its iframe and a later visit creates a fresh preview', () => {
  const js = read('public/function/home-app.js');

  assert.match(js, /function destroyCalendarEmbed\s*\(/);
  assert.match(js, /host\.replaceChildren\(\)/);
  assert.match(js, /calendarEmbedLoading=false;[\s\S]{0,80}calendarEmbedLoaded=false;/);
  assert.match(js, /if\(activeTab!=='calendar'\) destroyCalendarEmbed\(\);/);
  assert.match(js, /if\(activeTab==='calendar'\) ensureCalendarEmbed\(\);/);
});

test('home app applies public navigation settings and never loads a hidden calendar tab', () => {
  const js = read('public/function/home-app.js');

  assert.match(js, /apiFetch\('\/api\/home-navigation'/);
  assert.match(js, /querySelectorAll\('\[data-home-nav-id\]'/);
  assert.match(js, /item\.adminOnly/);
  assert.match(js, /homenavigationchange/);
  assert.match(js, /if\(!isValidTab\('calendar'\)\) return/);
});

test('embedded calendar host has a dedicated mobile viewport size', () => {
  const css = read('public/function/home.css');
  assert.match(css, /@media\s*\(max-width:\s*768px\)[\s\S]*?\.home-calendar-embed-host[\s\S]*?min-height:\s*calc\(100dvh\s*-\s*150px\)/);
});
