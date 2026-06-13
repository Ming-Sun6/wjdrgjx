const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('theme manager guards against duplicate mobile tap events', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'function', 'theme.js'), 'utf8');
  assert.match(source, /__wjdrThemeLastToggleAt/);
  assert.match(source, /__wjdrThemeHandled/);
  assert.match(source, /touchend/);
  assert.match(source, /pointerup/);
});

test('analytics fallback theme button also guards mobile taps', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'function', 'analytics-tracker.js'),
    'utf8'
  );
  assert.match(source, /__wjdrFallbackThemeLastToggleAt/);
  assert.match(source, /touchend/);
  assert.match(source, /pointerup/);
});

test('shared theme button accepts mobile taps above overlays', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'function', 'theme.css'), 'utf8');
  assert.match(css, /touch-action:\s*manipulation/);
  assert.match(css, /pointer-events:\s*auto/);
});

test('homepage text colors use theme variables for day and night modes', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const themedSelectors = [
    ['.auth-panel', '--text'],
    ['.auth-head h3', '--text'],
    ['.auth-row label', '--muted'],
    ['.auth-row input,', '--text'],
    ['.auth-actions button.secondary', '--text'],
    ['.profile-avatar-controls button', '--text'],
    ['.profile-username-btn', '--text'],
    ['.version-tag', '--muted'],
    ['.changelog-btn', '--text'],
    ['.theme-toggle-btn', '--text'],
    ['.me-rewards-stat-label', '--muted'],
    ['.me-rewards-stat-value', '--text'],
    ['.me-rewards-hint', '--muted'],
    ['.me-redeem-row input', '--text'],
    ['.me-shop-card-title', '--text'],
    ['.me-shop-card-desc', '--muted'],
    ['.me-shop-card-meta', '--muted'],
    ['.sponsor-title', '--text'],
    ['.pay-panel', '--text'],
    ['.pay-head h3', '--text'],
    ['.pay-summary', '--muted'],
    ['.card-title', '--text'],
    ['.pill', '--muted'],
    ['.btn.secondary', '--text'],
    ['.dev-toast', '--text'],
  ];

  for (const [selector, variable] of themedSelectors) {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(
      source,
      new RegExp(`${escapedSelector}[^{}]*\\{[^}]*color\\s*:\\s*var\\(${variable}\\)`),
      `${selector} should use var(${variable}) for its base text color`
    );
  }

  assert.doesNotMatch(source, /style="[^"]*color:#94a3b8/i);
});
