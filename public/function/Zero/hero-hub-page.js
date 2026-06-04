(function (global) {
  'use strict';

  function escHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalize(text) {
    return String(text || '').toLowerCase().trim();
  }

  global.initHeroHubPage = async function initHeroHubPage() {
    const input = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    const meta = document.getElementById('searchMeta');
    const empty = document.getElementById('emptyState');
    const grid = document.getElementById('heroGrid');
    if (!grid) return;

    grid.innerHTML = '<div class="empty-state" style="display:block;">加载中…</div>';
    if (empty) empty.style.display = 'none';

    let generations = [];
    try {
      const res = await fetch('/api/hero-generations', {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data && data.error) || 'LOAD_FAILED');
      generations = Array.isArray(data.generations) ? data.generations : [];
    } catch (err) {
      console.warn(err);
      grid.innerHTML =
        '<div class="empty-state" style="display:block;">英雄目录加载失败，请刷新页面或稍后再试。</div>';
      return;
    }

    grid.innerHTML = generations
      .map((gen) => {
        const href = 'generation-heroes.html?slug=' + encodeURIComponent(gen.slug);
        return (
          '<a class="card" href="' +
          escHtml(href) +
          '">' +
          '<h2 class="title">' +
          escHtml(gen.hubTitle) +
          '</h2>' +
          '<p class="desc">' +
          escHtml(gen.hubDesc) +
          '</p>' +
          '<span class="tag">' +
          escHtml(gen.hubTag || '已上线') +
          '</span>' +
          '<span hidden>' +
          escHtml((gen.heroNames || []).join(' ')) +
          '</span></a>'
        );
      })
      .join('');

    const cards = Array.from(grid.querySelectorAll('.card'));

    function updateFilter() {
      const keyword = normalize(input ? input.value : '');
      let visible = 0;
      cards.forEach((card) => {
        const content = normalize(card.textContent);
        const show = !keyword || content.includes(keyword);
        card.style.display = show ? 'block' : 'none';
        if (show) visible += 1;
      });
      if (meta) meta.textContent = keyword ? '匹配到 ' + visible + ' 项' : '共 ' + cards.length + ' 项';
      if (empty) empty.style.display = visible > 0 ? 'none' : 'block';
    }

    if (input) input.addEventListener('input', updateFilter);
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        input.value = '';
        input.focus();
        updateFilter();
      });
    }
    updateFilter();
  };
})(typeof window !== 'undefined' ? window : globalThis);
