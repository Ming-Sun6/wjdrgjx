(function (global) {
  'use strict';

  const skillTypes = [
    { key: 'explore', label: '探险技能' },
    { key: 'expedition', label: '远征技能' },
    { key: 'weapon', label: '专属武器' }
  ];

  function escHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderLines(list, lineClass) {
    const cls = lineClass || 'line';
    return (list || []).map((text) => '<p class="' + cls + '">' + escHtml(text) + '</p>').join('');
  }

  function renderExpeditionStats(list) {
    const source = Array.isArray(list) ? list : [];
    if (source.length >= 2 && source.length % 2 === 0) {
      let html = '';
      for (let i = 0; i < source.length; i += 2) {
        html += '<p class="line">' + escHtml(source[i]) + '</p>';
        html += '<p class="line">' + escHtml(source[i + 1]) + '</p>';
      }
      return html;
    }
    return renderLines(source);
  }

  function renderSkillItems(list) {
    return (list || []).map((item) => {
      const lines = (item.lines || [])
        .map((line) => '<p class="skill-line">' + escHtml(line) + '</p>')
        .join('');
      return '<article class="skill-item"><h4>' + escHtml(item.name) + '</h4>' + lines + '</article>';
    }).join('');
  }

  function renderObtainWays(list) {
    const linesHtml = renderLines(list, 'line line-obtain');
    if ((list || []).length >= 5) {
      return '<div class="obtain-grid">' + linesHtml + '</div>';
    }
    return linesHtml;
  }

  function renderHero(hero, heroIndex) {
    const tabs = skillTypes
      .map((type, idx) => {
        return (
          '<button class="skill-tab' +
          (idx === 0 ? ' active' : '') +
          '" type="button" data-hero-index="' +
          heroIndex +
          '" data-skill-type="' +
          type.key +
          '">' +
          escHtml(type.label) +
          '</button>'
        );
      })
      .join('');
    const panels = skillTypes
      .map((type, idx) => {
        const list = (hero.skills && hero.skills[type.key]) || [];
        return (
          '<section class="skill-panel' +
          (idx === 0 ? ' active' : '') +
          '" data-hero-index="' +
          heroIndex +
          '" data-skill-type="' +
          type.key +
          '"><div class="skill-list">' +
          renderSkillItems(list) +
          '</div></section>'
        );
      })
      .join('');

    return (
      '<section class="card">' +
      '<div class="hero-intro">' +
      '<div class="hero-main">' +
      '<div class="hero-head">' +
      '<div class="hero-name">' +
      escHtml(hero.name) +
      '</div>' +
      '<div class="hero-attr">' +
      escHtml(hero.attr) +
      '</div></div>' +
      '<div class="recommend">' +
      escHtml(hero.advice) +
      '</div>' +
      '<div class="info">' +
      '<div class="info-col"><h3>探险</h3>' +
      renderLines(hero.exploreStats) +
      '</div>' +
      '<div class="info-col"><h3>远征</h3>' +
      renderExpeditionStats(hero.expeditionStats) +
      '</div>' +
      '<div class="info-col info-col-obtain"><h3>获取方式</h3>' +
      renderObtainWays(hero.obtainWays) +
      '</div></div></div>' +
      '<div class="hero-image-wrap">' +
      '<img class="hero-image" src="' +
      escHtml(hero.image) +
      '" alt="' +
      escHtml(hero.name) +
      '" loading="lazy" />' +
      '</div></div>' +
      '<div class="skill-tabs">' +
      tabs +
      '</div>' +
      panels +
      '</section>'
    );
  }

  function bindSkillTabs(root, heroListEl) {
    if (!heroListEl || heroListEl.__heroSkillTabsBound) return;
    heroListEl.__heroSkillTabsBound = true;
    heroListEl.addEventListener('click', (event) => {
      const btn = event.target.closest('.skill-tab');
      if (!btn) return;
      const card = btn.closest('.card');
      if (!card) return;
      const targetType = btn.getAttribute('data-skill-type');
      const heroIndex = btn.getAttribute('data-hero-index');
      if (!targetType || heroIndex === null) return;
      card.querySelectorAll('.skill-tab').forEach((tab) => {
        tab.classList.toggle(
          'active',
          tab.getAttribute('data-skill-type') === targetType &&
            tab.getAttribute('data-hero-index') === heroIndex
        );
      });
      card.querySelectorAll('.skill-panel').forEach((panel) => {
        panel.classList.toggle(
          'active',
          panel.getAttribute('data-skill-type') === targetType &&
            panel.getAttribute('data-hero-index') === heroIndex
        );
      });
    });
  }

  function renderHeroes(root, heroes) {
    const heroListEl = root.document.getElementById('heroList');
    if (!heroListEl) return;
    const list = Array.isArray(heroes) ? heroes : [];
    if (!list.length) {
      heroListEl.innerHTML = '<p class="small" style="margin:0;">暂无英雄数据。</p>';
      return;
    }
    heroListEl.innerHTML = list.map((hero, index) => renderHero(hero, index)).join('');
    bindSkillTabs(root, heroListEl);
  }

  global.initHeroGenerationPage = async function initHeroGenerationPage(options) {
    const slug = String((options && options.slug) || '').trim().toLowerCase();
    const heroListEl = document.getElementById('heroList');
    if (!slug || !heroListEl) return;
    heroListEl.innerHTML = '<p class="small" style="margin:0;">加载中…</p>';
    try {
      const res = await fetch('/api/hero-generations/' + encodeURIComponent(slug), {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data && data.error) || 'LOAD_FAILED');
      const generation = data.generation || {};
      const titleEl = document.querySelector('.top .title');
      if (titleEl && generation.pageTitle) titleEl.textContent = generation.pageTitle;
      document.title = (generation.pageTitle || document.title) + '-无尽冬日工具箱';
      renderHeroes(global, generation.heroes || []);
    } catch (err) {
      console.warn(err);
      heroListEl.innerHTML =
        '<p class="small" style="margin:0;color:#ef4444;">英雄数据加载失败，请刷新页面或稍后再试。</p>';
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
