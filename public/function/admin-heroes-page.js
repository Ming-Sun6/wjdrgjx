'use strict';

var HERO_SKILL_TYPES = [
  { key: 'explore', label: '探险技能' },
  { key: 'expedition', label: '远征技能' },
  { key: 'weapon', label: '专属武器' }
];

function hdState(root) {
  if (!root.__adminHeroesState) {
    root.__adminHeroesState = {
      generations: [],
      selectedId: null,
      selectedHeroIndex: 0,
      selectedSkillTab: 'explore',
      draft: null,
      dirty: false,
      dragId: null
    };
  }
  return root.__adminHeroesState;
}

function hdStatus(msg) {
  if (typeof setStatus === 'function') setStatus('heroDataStatus', msg);
}

function hdEsc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hdMapErr(error) {
  if (error === 'BAD_META') return '请填写页面标题、目录标题与目录描述。';
  if (error === 'BAD_HEROES') return '至少需要一名英雄。';
  if (error === 'BAD_HERO_NAME') return '英雄名称无效。';
  if (error === 'BAD_EXPLORE_STATS') return '探险属性不能为空。';
  if (error === 'BAD_EXPEDITION_STATS') return '远征属性不能为空。';
  if (error === 'BAD_SKILL_NAME') return '技能名称不能为空。';
  if (error === 'BAD_SKILL_LINES') return '技能描述不能为空。';
  if (error === 'SLUG_TAKEN') return '该 slug 已被占用，请换一个（仅小写字母、数字与连字符）。';
  if (error === 'BAD_SLUG') return 'slug 无效：请使用小写字母、数字与连字符，如 sixteenth-generation。';
  return error || '未知错误';
}

function hdLinesToText(list) {
  return (list || []).join('\n');
}

function hdTextToLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(function (line) {
      return line.trim();
    })
    .filter(Boolean);
}

function hdDefaultHero() {
  return {
    name: '新英雄',
    image: '../../Scores/hero/hero_bustpic_50011.png',
    attr: '属性: 盾',
    advice: '培养建议：',
    exploreStats: ['攻击0', '防御0', '生命0'],
    expeditionStats: ['兵种攻击力', '0%', '兵种防御力', '0%'],
    obtainWays: ['英雄招募'],
    skills: {
      explore: [{ name: '技能1', lines: ['描述'] }],
      expedition: [{ name: '技能1', lines: ['描述'] }],
      weapon: [{ name: '专属', lines: ['描述'] }]
    }
  };
}

function hdCloneDraft(draft) {
  return JSON.parse(JSON.stringify(draft));
}

function hdNormalizeDraft(draft) {
  var next = hdCloneDraft(draft);
  next.pageTitle = String(next.pageTitle || '').trim();
  next.hubTitle = String(next.hubTitle || '').trim();
  next.hubDesc = String(next.hubDesc || '').trim();
  next.hubTag = String(next.hubTag || '已上线').trim() || '已上线';
  next.enabled = !!next.enabled;
  next.sortOrder = Number(next.sortOrder || 0);
  next.heroes = (next.heroes || []).map(function (hero) {
    return {
      name: String(hero.name || '').trim(),
      image: String(hero.image || '').trim(),
      attr: String(hero.attr || '').trim(),
      advice: String(hero.advice || '').trim(),
      exploreStats: hdTextToLines(hero.exploreStatsText || hdLinesToText(hero.exploreStats)),
      expeditionStats: hdTextToLines(hero.expeditionStatsText || hdLinesToText(hero.expeditionStats)),
      obtainWays: hdTextToLines(hero.obtainWaysText || hdLinesToText(hero.obtainWays)),
      skills: {
        explore: hdNormalizeSkillList(hero.skills && hero.skills.explore, hero.exploreSkillsText),
        expedition: hdNormalizeSkillList(hero.skills && hero.skills.expedition, hero.expeditionSkillsText),
        weapon: hdNormalizeSkillList(hero.skills && hero.skills.weapon, hero.weaponSkillsText)
      }
    };
  });
  return next;
}

function hdNormalizeSkillList(list, textFallback) {
  if (Array.isArray(list) && list.length) {
    return list.map(function (item) {
      return {
        name: String(item.name || '').trim(),
        lines: hdTextToLines(item.linesText || hdLinesToText(item.lines))
      };
    });
  }
  if (textFallback) {
    try {
      var parsed = JSON.parse(String(textFallback));
      if (Array.isArray(parsed)) return parsed;
    } catch (_e) {}
  }
  return [{ name: '技能1', lines: ['描述'] }];
}

function hdDefaultGeneration(st) {
  var maxNum = 0;
  (st.generations || []).forEach(function (g) {
    if (Number(g.generationNum) > maxNum) maxNum = Number(g.generationNum);
  });
  return {
    id: null,
    slug: '',
    generationNum: maxNum + 1,
    pageTitle: '新一代英雄数据',
    hubTitle: '新一代英雄',
    hubDesc: '查看新一代英雄完整数据。',
    hubTag: '已上线',
    enabled: true,
    sortOrder: (st.generations || []).length,
    heroes: [hdDefaultHero()]
  };
}

function hdInstallStyles(root) {
  if (root.document.getElementById('adminHeroesStyles')) return;
  var style = root.document.createElement('style');
  style.id = 'adminHeroesStyles';
  style.textContent =
    '#page-heroes .hero-data-page-tip{margin:0 0 12px;color:var(--muted);font-size:.86rem;line-height:1.65}' +
    '#page-heroes .hero-data-page-tip code{font-size:.82em}' +
    '#page-heroes #heroDataStatus{margin-bottom:12px}' +
    '.hero-data-admin{display:grid;grid-template-columns:minmax(240px,300px) minmax(0,1fr);gap:16px;align-items:start}' +
    '@media(max-width:960px){.hero-data-admin{grid-template-columns:1fr}}' +
    '.hero-gen-panel{display:flex;flex-direction:column;gap:8px;min-width:0}' +
    '.hero-gen-list-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}' +
    '.hero-gen-list-meta{font-size:.88rem;font-weight:800;color:var(--text);line-height:1.4}' +
    '.hero-gen-list-actions{display:flex;gap:6px;flex-wrap:wrap}' +
    '.hero-gen-list-actions .btn-sm{font-size:.82rem;padding:7px 11px}' +
    '.hero-gen-list{border:1px solid var(--border);border-radius:12px;background:var(--surface);max-height:min(68vh,640px);overflow:auto;flex:1}' +
    '.hero-gen-list-hint{margin:0;font-size:.75rem;color:var(--muted);line-height:1.45;padding:0 2px}' +
    '.hero-gen-item{display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s}' +
    '.hero-gen-item:last-child{border-bottom:none}' +
    '.hero-gen-item:hover{background:rgba(148,163,184,.08)}' +
    '.hero-gen-item.active{background:rgba(59,130,246,.14);box-shadow:inset 3px 0 0 #3b82f6}' +
    '.hero-gen-item.disabled{opacity:.62}' +
    '.hero-gen-item.drag-over{outline:2px dashed rgba(59,130,246,.55);outline-offset:-2px}' +
    '.hero-gen-drag{cursor:grab;color:var(--muted);font-size:1rem;line-height:1;user-select:none;padding:2px 0;flex-shrink:0}' +
    '.hero-gen-badge{flex-shrink:0;min-width:2.4rem;text-align:center;font-size:.72rem;font-weight:800;padding:4px 6px;border-radius:8px;background:rgba(59,130,246,.2);color:#93c5fd;border:1px solid rgba(59,130,246,.35)}' +
    '.hero-gen-body{flex:1;min-width:0}' +
    '.hero-gen-title{font-weight:800;font-size:.9rem;line-height:1.35}' +
    '.hero-gen-meta{font-size:.76rem;color:var(--muted);margin-top:4px;line-height:1.45;word-break:break-all}' +
    '.hero-gen-editor{border:1px solid var(--border);border-radius:14px;background:var(--surface);min-height:320px;max-height:min(78vh,900px);overflow:auto}' +
    '.hero-gen-editor-empty{color:var(--muted);padding:48px 20px;text-align:center;line-height:1.7;font-size:.9rem}' +
    '.hero-editor-inner{padding:14px 16px 20px}' +
    '.hero-editor-sticky{position:sticky;top:0;z-index:2;margin:-14px -16px 14px;padding:14px 16px 12px;background:linear-gradient(var(--surface) 70%,rgba(15,23,42,0));border-bottom:1px solid var(--border);backdrop-filter:blur(6px)}' +
    '.hero-editor-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px;flex-wrap:wrap}' +
    '.hero-editor-title{margin:0;font-size:1.05rem;font-weight:800;line-height:1.35}' +
    '.hero-editor-subtitle{margin:4px 0 0;font-size:.78rem;color:var(--muted);line-height:1.45;word-break:break-all}' +
    '.hero-editor-badges{display:flex;gap:6px;flex-wrap:wrap;align-items:center}' +
    '.hero-pill{font-size:.72rem;font-weight:800;padding:4px 8px;border-radius:999px;border:1px solid var(--border);color:var(--muted)}' +
    '.hero-pill.warn{background:rgba(251,191,36,.15);border-color:rgba(251,191,36,.45);color:#fcd34d}' +
    '.hero-pill.off{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.4);color:#fca5a5}' +
    '.hero-pill.ok{background:rgba(34,197,94,.12);border-color:rgba(34,197,94,.4);color:#86efac}' +
    '.hero-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
    '.hero-toolbar .btn{font-size:.85rem;padding:8px 14px}' +
    '.hero-toolbar .btn.primary{font-weight:800}' +
    '.hero-toolbar a.hero-preview-link{font-size:.82rem;font-weight:700;color:#93c5fd;text-decoration:none;padding:8px 10px;border-radius:10px;border:1px solid rgba(59,130,246,.35);background:rgba(59,130,246,.1)}' +
    '.hero-toolbar a.hero-preview-link:hover{background:rgba(59,130,246,.2)}' +
    '.hero-card{border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px;background:var(--surface-strong)}' +
    '.hero-card-title{font-weight:800;font-size:.9rem;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}' +
    '.hero-card-title .btn{font-size:.8rem;padding:6px 10px}' +
    '.hero-editor-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}' +
    '@media(max-width:760px){.hero-editor-grid{grid-template-columns:1fr}}' +
    '.hero-editor-grid .full{grid-column:1/-1}' +
    '.hero-editor-grid label{display:block;font-size:.8rem;color:var(--muted);margin-bottom:6px;font-weight:700}' +
    '.hero-editor-grid input,.hero-editor-grid textarea{width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);padding:8px 10px;font:inherit;transition:border-color .15s,box-shadow .15s}' +
    '.hero-editor-grid input:focus,.hero-editor-grid textarea:focus{outline:none;border-color:rgba(59,130,246,.65);box-shadow:0 0 0 3px rgba(59,130,246,.15)}' +
    '.hero-editor-grid input[readonly]{opacity:.75;cursor:default}' +
    '.hero-editor-grid textarea{min-height:84px;resize:vertical;font-family:inherit;line-height:1.55}' +
    '.hero-editor-grid .hero-check-row label{display:flex;align-items:center;gap:8px;margin:0;cursor:pointer;color:var(--text)}' +
    '.hero-hero-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(160px,200px);gap:12px;align-items:start}' +
    '@media(max-width:900px){.hero-hero-layout{grid-template-columns:1fr}}' +
    '.hero-sublist{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
    '.hero-sublist button{padding:7px 14px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer;font-weight:700;font-size:.84rem;transition:background .15s,border-color .15s}' +
    '.hero-sublist button:hover{border-color:rgba(59,130,246,.45)}' +
    '.hero-sublist button.active{background:rgba(59,130,246,.2);border-color:rgba(59,130,246,.55);color:#bfdbfe}' +
    '.hero-sublist .hero-sublist-add{border-style:dashed;color:var(--muted);font-weight:700}' +
    '.hero-avatar-card{border:1px solid var(--border);border-radius:12px;padding:12px;background:var(--surface);text-align:center}' +
    '.hero-avatar-card label{display:block;font-size:.8rem;color:var(--muted);font-weight:700;margin-bottom:8px;text-align:left}' +
    '.hero-image-preview{width:100%;max-width:168px;max-height:200px;margin:0 auto 10px;border-radius:10px;border:1px solid var(--border);background:var(--surface-strong);object-fit:contain;display:block}' +
    '.hero-image-field-row{display:flex;flex-direction:column;gap:8px}' +
    '.hero-image-field-row input{width:100%}' +
    '.hero-image-hint{font-size:.74rem;color:var(--muted);line-height:1.5;margin:8px 0 0;text-align:left}' +
    '.hero-skill-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}' +
    '.hero-skill-tabs button{padding:8px 14px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer;font-weight:700;font-size:.84rem}' +
    '.hero-skill-tabs button.active{background:rgba(59,130,246,.2);border-color:rgba(59,130,246,.55);color:#bfdbfe}' +
    '.hero-skill-panel{display:none}' +
    '.hero-skill-panel.active{display:block}' +
    '.hero-skill-block{border:1px dashed var(--border);border-radius:10px;padding:12px;margin-bottom:10px;background:var(--surface)}' +
    '.hero-skill-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}' +
    '.hero-skill-head strong{font-size:.85rem}' +
    '.hero-skill-add{margin-top:4px}';
  root.document.head.appendChild(style);
}

function hdHeroPreviewSrc(imagePath) {
  var p = String(imagePath || '').trim();
  if (!p) return '';
  if (p.charAt(0) === '/' || /^https?:\/\//i.test(p)) return p;
  try {
    var base = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
    return new URL(p, base + '/function/Zero/').pathname;
  } catch (_e) {
    return '';
  }
}

async function hdUploadHeroImageDataUrl(dataUrl) {
  var r = await apiFetch('/api/admin/announcement/images', {
    method: 'POST',
    body: JSON.stringify({ dataUrl: dataUrl })
  });
  var d = await r.json().catch(function () {
    return {};
  });
  if (!r.ok) throw new Error((d && d.error) || 'UPLOAD_FAILED');
  return String(d.url || '');
}

function hdBindHeroImageUpload(root, mount) {
  var picker = mount.querySelector('#heroFieldImagePicker');
  var uploadBtn = mount.querySelector('#heroFieldImageUploadBtn');
  var input = mount.querySelector('#heroFieldImage');
  var preview = mount.querySelector('#heroFieldImagePreview');
  if (!picker || !uploadBtn || !input) return;

  function syncPreview() {
    if (!preview) return;
    var src = hdHeroPreviewSrc(input.value);
    if (src) {
      preview.src = src;
      preview.style.display = 'block';
    } else {
      preview.removeAttribute('src');
      preview.style.display = 'none';
    }
  }

  input.addEventListener('input', syncPreview);
  syncPreview();

  uploadBtn.addEventListener('click', function () {
    picker.value = '';
    picker.click();
  });

  picker.addEventListener('change', function () {
    var file = picker.files && picker.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      hdStatus('图片不能超过 3MB。');
      return;
    }
    hdStatus('头像上传中…');
    var reader = new FileReader();
    reader.onload = function () {
      var dataUrl = String(reader.result || '');
      hdUploadHeroImageDataUrl(dataUrl)
        .then(function (url) {
          input.value = url;
          syncPreview();
          hdState(root).dirty = true;
          hdStatus('头像已上传，保存本代后生效。');
        })
        .catch(function (err) {
          hdStatus('头像上传失败：' + ((err && err.message) || '网络错误'));
        });
    };
    reader.onerror = function () {
      hdStatus('读取图片失败。');
    };
    reader.readAsDataURL(file);
  });
}

function hdUpdateListMeta(root) {
  var meta = root.document.getElementById('heroGenListMeta');
  if (!meta) return;
  var n = hdState(root).generations.length;
  meta.textContent = '共 ' + n + ' 个代数';
}

function hdRenderList(root) {
  var st = hdState(root);
  var list = root.document.getElementById('heroGenList');
  if (!list) return;
  hdUpdateListMeta(root);
  if (!st.generations.length) {
    list.innerHTML =
      '<div class="hero-gen-editor-empty" style="padding:16px;font-size:.86rem;">暂无代数<br><span style="color:var(--muted)">点击「新增代数」开始</span></div>';
    return;
  }
  list.innerHTML = st.generations
    .map(function (gen) {
      var active = Number(st.selectedId) === Number(gen.id);
      return (
        '<div class="hero-gen-item' +
        (active ? ' active' : '') +
        (!gen.enabled ? ' disabled' : '') +
        (Number(st.dragId) === Number(gen.id) ? ' drag-over' : '') +
        '" draggable="true" data-gen-id="' +
        gen.id +
        '">' +
        '<span class="hero-gen-drag" title="拖拽排序">⋮⋮</span>' +
        '<span class="hero-gen-badge">' +
        hdEsc(gen.generationNum || '?') +
        '代</span>' +
        '<div class="hero-gen-body">' +
        '<div class="hero-gen-title">' +
        hdEsc(gen.hubTitle) +
        '</div>' +
        '<div class="hero-gen-meta">' +
        (gen.heroes ? gen.heroes.length : 0) +
        ' 名英雄' +
        (gen.enabled ? '' : ' · 已停用') +
        '</div></div></div>'
      );
    })
    .join('');

  list.querySelectorAll('.hero-gen-item').forEach(function (item) {
    item.addEventListener('click', function () {
      hdSelectGeneration(root, Number(item.getAttribute('data-gen-id')));
    });
    item.addEventListener('dragstart', function (e) {
      st.dragId = Number(item.getAttribute('data-gen-id'));
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragover', function (e) {
      e.preventDefault();
      item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', function () {
      item.classList.remove('drag-over');
    });
    item.addEventListener('drop', function (e) {
      e.preventDefault();
      item.classList.remove('drag-over');
      var targetId = Number(item.getAttribute('data-gen-id'));
      var sourceId = st.dragId;
      st.dragId = null;
      if (!sourceId || sourceId === targetId) return;
      hdReorder(root, sourceId, targetId);
    });
    item.addEventListener('dragend', function () {
      st.dragId = null;
      hdRenderList(root);
    });
  });
}

function hdRenderEditor(root) {
  var st = hdState(root);
  var mount = root.document.getElementById('heroGenEditor');
  if (!mount) return;
  if (!st.draft) {
    mount.innerHTML =
      '<div class="hero-gen-editor-empty">从左侧选择一代英雄，或点击「新增代数」开始编辑。</div>';
    return;
  }

  var hero = st.draft.heroes[st.selectedHeroIndex] || st.draft.heroes[0];
  if (!hero) hero = hdDefaultHero();
  var skillTab = st.selectedSkillTab || 'explore';

  var heroTabs = (st.draft.heroes || [])
    .map(function (item, idx) {
      return (
        '<button type="button" class="' +
        (idx === st.selectedHeroIndex ? 'active' : '') +
        '" data-hero-index="' +
        idx +
        '">' +
        hdEsc(item.name || '英雄' + (idx + 1)) +
        '</button>'
      );
    })
    .join('');

  var skillTabButtons = HERO_SKILL_TYPES.map(function (type) {
    var count = (hero.skills && hero.skills[type.key]) ? hero.skills[type.key].length : 0;
    return (
      '<button type="button" class="' +
      (skillTab === type.key ? 'active' : '') +
      '" data-skill-tab="' +
      type.key +
      '">' +
      hdEsc(type.label) +
      ' (' +
      count +
      ')</button>'
    );
  }).join('');

  var skillPanels = HERO_SKILL_TYPES.map(function (type) {
    var skills = (hero.skills && hero.skills[type.key]) || [];
    var itemsHtml = skills
      .map(function (skill, skillIndex) {
        return (
          '<div class="hero-skill-block" data-skill-type="' +
          type.key +
          '" data-skill-index="' +
          skillIndex +
          '">' +
          '<div class="hero-skill-head"><strong>#' +
          (skillIndex + 1) +
          ' ' +
          hdEsc(skill.name || '未命名') +
          '</strong><button type="button" class="btn secondary" data-remove-skill>删除</button></div>' +
          '<div class="hero-editor-grid">' +
          '<div class="full"><label>技能名</label><input data-field="skill-name" value="' +
          hdEsc(skill.name) +
          '" /></div>' +
          '<div class="full"><label>技能描述（每行一条）</label><textarea data-field="skill-lines" placeholder="每行一条描述">' +
          hdEsc(hdLinesToText(skill.lines)) +
          '</textarea></div></div></div>'
        );
      })
      .join('');
    return (
      '<div class="hero-skill-panel' +
      (skillTab === type.key ? ' active' : '') +
      '" data-skill-panel="' +
      type.key +
      '">' +
      itemsHtml +
      '<button type="button" class="btn secondary hero-skill-add" data-add-skill="' +
      type.key +
      '">添加' +
      hdEsc(type.label) +
      '</button></div>'
    );
  }).join('');

  var previewSlug = String(st.draft.slug || '').trim();
  var previewLink =
    previewSlug && st.draft.id
      ? '<a class="hero-preview-link" href="/function/Zero/generation-heroes.html?slug=' +
        encodeURIComponent(previewSlug) +
        '" target="_blank" rel="noopener">预览前台</a>'
      : '';

  var statusPills =
    (st.dirty ? '<span class="hero-pill warn">未保存</span>' : '') +
    (st.draft.enabled
      ? '<span class="hero-pill ok">已启用</span>'
      : '<span class="hero-pill off">已停用</span>');

  mount.innerHTML =
    '<div class="hero-editor-inner">' +
    '<div class="hero-editor-sticky">' +
    '<div class="hero-editor-head">' +
    '<div><h3 class="hero-editor-title">' +
    hdEsc(st.draft.hubTitle || '新代数') +
    '</h3><p class="hero-editor-subtitle">' +
    (st.draft.id ? hdEsc(st.draft.slug) : '创建后生成 slug · generation-heroes.html?slug=…') +
    '</p></div>' +
    '<div class="hero-editor-badges">' +
    statusPills +
    '</div></div>' +
    '<div class="hero-toolbar">' +
    '<button type="button" class="btn primary" id="heroGenSaveBtn">' +
    (st.draft.id ? '保存本代' : '创建代数') +
    '</button>' +
    previewLink +
    '<button type="button" class="btn secondary" id="heroGenDeleteGenBtn"' +
    (st.draft.id ? '' : ' style="display:none;"') +
    '>删除本代</button>' +
    '<button type="button" class="btn secondary" id="heroGenRemoveHeroBtn">删除当前英雄</button>' +
    '</div></div>' +
    '<div class="hero-card"><div class="hero-card-title">代数与目录</div>' +
    '<div class="hero-editor-grid">' +
    (st.draft.id
      ? '<div><label>slug（只读）</label><input id="heroFieldSlug" readonly value="' +
        hdEsc(st.draft.slug) +
        '" /></div>'
      : '<div class="full"><label>slug（英文标识，创建后不可改）</label><input id="heroFieldSlug" placeholder="sixteenth-generation" value="' +
        hdEsc(st.draft.slug) +
        '" /></div>') +
    '<div><label>代数序号</label><input id="heroFieldGenNum" type="number" min="1" max="99" value="' +
    hdEsc(st.draft.generationNum) +
    '" /></div>' +
    '<div><label>页面标题</label><input id="heroFieldPageTitle" value="' +
    hdEsc(st.draft.pageTitle) +
    '" /></div>' +
    '<div><label>目录标题</label><input id="heroFieldHubTitle" value="' +
    hdEsc(st.draft.hubTitle) +
    '" /></div>' +
    '<div class="full"><label>目录描述</label><input id="heroFieldHubDesc" value="' +
    hdEsc(st.draft.hubDesc) +
    '" /></div>' +
    '<div><label>目录标签</label><input id="heroFieldHubTag" placeholder="已上线" value="' +
    hdEsc(st.draft.hubTag) +
    '" /></div>' +
    '<div class="hero-check-row"><label><input type="checkbox" id="heroFieldEnabled" ' +
    (st.draft.enabled ? 'checked' : '') +
    ' /> 在前台目录中显示</label></div>' +
    '</div></div>' +
    '<div class="hero-card"><div class="hero-card-title">当前英雄<button type="button" class="btn secondary" id="heroGenAddHeroBtn">+ 新增英雄</button></div>' +
    '<div class="hero-sublist" id="heroSublist">' +
    heroTabs +
  '<button type="button" class="hero-sublist-add" id="heroGenAddHeroBtnAlt">+</button>' +
    '</div></div>' +
    '<div class="hero-hero-layout">' +
    '<div class="hero-card" style="margin:0">' +
    '<div class="hero-card-title">属性与获取</div>' +
    '<div class="hero-editor-grid">' +
    '<div><label>英雄名</label><input id="heroFieldName" value="' +
    hdEsc(hero.name) +
    '" /></div>' +
    '<div><label>属性</label><input id="heroFieldAttr" placeholder="属性: 盾" value="' +
    hdEsc(hero.attr) +
    '" /></div>' +
    '<div class="full"><label>培养建议</label><input id="heroFieldAdvice" value="' +
    hdEsc(hero.advice) +
    '" /></div>' +
    '<div><label>探险属性（每行一条）</label><textarea id="heroFieldExplore" placeholder="攻击0&#10;防御0&#10;生命0">' +
    hdEsc(hdLinesToText(hero.exploreStats)) +
    '</textarea></div>' +
    '<div><label>远征属性（每行一条）</label><textarea id="heroFieldExpedition">' +
    hdEsc(hdLinesToText(hero.expeditionStats)) +
    '</textarea></div>' +
    '<div class="full"><label>获取方式（每行一条）</label><textarea id="heroFieldObtain">' +
    hdEsc(hdLinesToText(hero.obtainWays)) +
    '</textarea></div>' +
    '</div></div>' +
    '<div class="hero-avatar-card">' +
    '<label>头像</label>' +
    (hero.image
      ? '<img id="heroFieldImagePreview" class="hero-image-preview" alt="" src="' +
        hdEsc(hdHeroPreviewSrc(hero.image)) +
        '" />'
      : '<img id="heroFieldImagePreview" class="hero-image-preview" alt="" style="display:none;" />') +
    '<div class="hero-image-field-row">' +
    '<input id="heroFieldImage" placeholder="/uploads/forum/…" value="' +
    hdEsc(hero.image) +
    '" />' +
    '<button type="button" class="btn secondary" id="heroFieldImageUploadBtn">上传图片</button>' +
    '<input type="file" id="heroFieldImagePicker" accept="image/*" style="display:none;" />' +
    '</div>' +
    '<p class="hero-image-hint">上传保存至 <code>/uploads/forum/</code>，或填写 <code>Scores</code> 相对路径。</p>' +
    '</div></div>' +
    '<div class="hero-card"><div class="hero-card-title">技能</div>' +
    '<div class="hero-skill-tabs" id="heroSkillTabs">' +
    skillTabButtons +
    '</div>' +
    skillPanels +
    '</div></div>';

  mount.querySelector('#heroGenSaveBtn').addEventListener('click', function () {
    hdCollectEditor(root);
    hdSaveCurrent(root);
  });
  var deleteGenBtn = mount.querySelector('#heroGenDeleteGenBtn');
  if (deleteGenBtn) {
    deleteGenBtn.addEventListener('click', function () {
      hdDeleteGeneration(root);
    });
  }
  function hdAddHero() {
    hdCollectEditor(root);
    st.draft.heroes.push(hdDefaultHero());
    st.selectedHeroIndex = st.draft.heroes.length - 1;
    st.dirty = true;
    hdRenderEditor(root);
  }
  var addHeroBtn = mount.querySelector('#heroGenAddHeroBtn');
  if (addHeroBtn) addHeroBtn.addEventListener('click', hdAddHero);
  var addHeroAlt = mount.querySelector('#heroGenAddHeroBtnAlt');
  if (addHeroAlt) addHeroAlt.addEventListener('click', hdAddHero);
  mount.querySelector('#heroGenRemoveHeroBtn').addEventListener('click', function () {
    if (!st.draft || !st.draft.heroes.length) return;
    if (st.draft.heroes.length <= 1) {
      hdStatus('至少保留一名英雄。');
      return;
    }
    if (!root.confirm('确认删除当前英雄？')) return;
    hdCollectEditor(root);
    st.draft.heroes.splice(st.selectedHeroIndex, 1);
    st.selectedHeroIndex = Math.max(0, st.selectedHeroIndex - 1);
    st.dirty = true;
    hdRenderEditor(root);
  });
  mount.querySelectorAll('#heroSublist button[data-hero-index]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      hdCollectEditor(root);
      st.selectedHeroIndex = Number(btn.getAttribute('data-hero-index'));
      hdRenderEditor(root);
    });
  });
  mount.querySelectorAll('#heroSkillTabs button[data-skill-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      hdCollectEditor(root);
      st.selectedSkillTab = btn.getAttribute('data-skill-tab');
      hdRenderEditor(root);
    });
  });
  mount.querySelectorAll('[data-add-skill]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      hdCollectEditor(root);
      var key = btn.getAttribute('data-add-skill');
      var heroRef = st.draft.heroes[st.selectedHeroIndex];
      if (!heroRef.skills) heroRef.skills = {};
      if (!Array.isArray(heroRef.skills[key])) heroRef.skills[key] = [];
      heroRef.skills[key].push({ name: '新技能', lines: ['描述'] });
      st.dirty = true;
      hdRenderEditor(root);
    });
  });
  mount.querySelectorAll('[data-remove-skill]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      hdCollectEditor(root);
      var block = btn.closest('.hero-skill-block');
      var key = block.getAttribute('data-skill-type');
      var idx = Number(block.getAttribute('data-skill-index'));
      var heroRef = st.draft.heroes[st.selectedHeroIndex];
      if (!heroRef.skills[key] || heroRef.skills[key].length <= 1) {
        hdStatus('每类技能至少保留一条。');
        return;
      }
      heroRef.skills[key].splice(idx, 1);
      st.dirty = true;
      hdRenderEditor(root);
    });
  });

  hdBindHeroImageUpload(root, mount);
}

function hdCollectEditor(root) {
  var st = hdState(root);
  if (!st.draft) return;
  var mount = root.document.getElementById('heroGenEditor');
  if (!mount) return;

  st.draft.pageTitle = mount.querySelector('#heroFieldPageTitle').value;
  st.draft.hubTitle = mount.querySelector('#heroFieldHubTitle').value;
  st.draft.hubDesc = mount.querySelector('#heroFieldHubDesc').value;
  st.draft.hubTag = mount.querySelector('#heroFieldHubTag').value;
  st.draft.enabled = !!mount.querySelector('#heroFieldEnabled').checked;
  var slugInput = mount.querySelector('#heroFieldSlug');
  if (slugInput) st.draft.slug = slugInput.value;
  var genNumInput = mount.querySelector('#heroFieldGenNum');
  if (genNumInput) st.draft.generationNum = Number(genNumInput.value);

  var hero = st.draft.heroes[st.selectedHeroIndex];
  if (!hero) return;
  hero.name = mount.querySelector('#heroFieldName').value;
  hero.attr = mount.querySelector('#heroFieldAttr').value;
  hero.image = mount.querySelector('#heroFieldImage').value;
  hero.advice = mount.querySelector('#heroFieldAdvice').value;
  hero.exploreStats = hdTextToLines(mount.querySelector('#heroFieldExplore').value);
  hero.expeditionStats = hdTextToLines(mount.querySelector('#heroFieldExpedition').value);
  hero.obtainWays = hdTextToLines(mount.querySelector('#heroFieldObtain').value);

  mount.querySelectorAll('.hero-skill-block').forEach(function (block) {
    var key = block.getAttribute('data-skill-type');
    var idx = Number(block.getAttribute('data-skill-index'));
    if (!hero.skills) hero.skills = {};
    if (!Array.isArray(hero.skills[key])) hero.skills[key] = [];
    hero.skills[key][idx] = {
      name: block.querySelector('[data-field="skill-name"]').value,
      lines: hdTextToLines(block.querySelector('[data-field="skill-lines"]').value)
    };
  });
  st.dirty = true;
}

async function hdLoad(root) {
  hdStatus('加载中…');
  try {
    var r = await apiFetch('/api/admin/hero-generations', { method: 'GET' });
    var d = await r.json().catch(function () {
      return {};
    });
    if (!r.ok) {
      hdStatus('加载失败：' + hdMapErr((d && d.error) || r.status));
      return;
    }
    var st = hdState(root);
    st.generations = Array.isArray(d.generations) ? d.generations : [];
    if (st.selectedId) {
      var found = st.generations.find(function (g) {
        return Number(g.id) === Number(st.selectedId);
      });
      if (found) {
        st.draft = hdCloneDraft(found);
      } else {
        st.selectedId = null;
        st.draft = null;
      }
    }
    hdRenderList(root);
    hdRenderEditor(root);
    hdStatus('');
  } catch (err) {
    hdStatus('加载失败：' + ((err && err.message) || '网络错误'));
  }
}

function hdSelectGeneration(root, id) {
  var st = hdState(root);
  if (st.dirty && !root.confirm('当前有未保存修改，确定切换吗？')) return;
  var gen = st.generations.find(function (g) {
    return Number(g.id) === Number(id);
  });
  if (!gen) return;
  st.selectedId = Number(id);
  st.selectedHeroIndex = 0;
  st.selectedSkillTab = 'explore';
  st.draft = hdCloneDraft(gen);
  st.dirty = false;
  hdRenderList(root);
  hdRenderEditor(root);
}

function hdStartCreateGeneration(root) {
  var st = hdState(root);
  if (st.dirty && !root.confirm('当前有未保存修改，确定新建代数吗？')) return;
  st.selectedId = null;
  st.selectedHeroIndex = 0;
  st.selectedSkillTab = 'explore';
  st.draft = hdDefaultGeneration(st);
  st.dirty = true;
  hdRenderList(root);
  hdRenderEditor(root);
  hdStatus('正在创建新代数：填写 slug 与目录信息后点击「创建代数」。前台链接为 generation-heroes.html?slug=…');
}

async function hdSaveCurrent(root) {
  var st = hdState(root);
  if (!st.draft) return;
  var payload = hdNormalizeDraft(st.draft);
  var isNew = !st.draft.id;
  if (isNew) {
    payload.slug = String(st.draft.slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!payload.slug || !/^[a-z0-9-]+$/.test(payload.slug)) {
      hdStatus('slug 无效：请使用小写字母、数字与连字符。');
      return;
    }
    payload.generationNum = Number(st.draft.generationNum) || undefined;
  }
  hdStatus(isNew ? '创建中…' : '保存中…');
  try {
    var url = isNew
      ? '/api/admin/hero-generations'
      : '/api/admin/hero-generations/' + encodeURIComponent(st.draft.id);
    var r = await apiFetch(url, {
      method: 'POST',
      body: JSON.stringify({
        slug: payload.slug,
        generationNum: payload.generationNum,
        pageTitle: payload.pageTitle,
        hubTitle: payload.hubTitle,
        hubDesc: payload.hubDesc,
        hubTag: payload.hubTag,
        enabled: payload.enabled,
        sortOrder: payload.sortOrder,
        heroes: payload.heroes
      })
    });
    var d = await r.json().catch(function () {
      return {};
    });
    if (!r.ok) {
      hdStatus((isNew ? '创建' : '保存') + '失败：' + hdMapErr((d && d.error) || r.status));
      return;
    }
    st.dirty = false;
    hdStatus(isNew ? '新代数已创建。' : '已保存「' + payload.hubTitle + '」。');
    var savedId = isNew ? Number(d.id || 0) : st.draft.id;
    await hdLoad(root);
    if (savedId) {
      st.dirty = false;
      hdSelectGeneration(root, savedId);
    }
  } catch (err) {
    hdStatus((isNew ? '创建' : '保存') + '失败：' + ((err && err.message) || '网络错误'));
  }
}

async function hdDeleteGeneration(root) {
  var st = hdState(root);
  if (!st.draft || !st.draft.id) return;
  if (
    !root.confirm(
      '确认删除代数「' +
        (st.draft.hubTitle || st.draft.slug) +
        '」？前台目录与详情将一并移除，此操作不可恢复。'
    )
  ) {
    return;
  }
  try {
    var r = await apiFetch('/api/admin/hero-generations/' + encodeURIComponent(st.draft.id), {
      method: 'DELETE'
    });
    var d = await r.json().catch(function () {
      return {};
    });
    if (!r.ok) {
      hdStatus('删除失败：' + hdMapErr((d && d.error) || r.status));
      return;
    }
    st.selectedId = null;
    st.draft = null;
    st.dirty = false;
    hdStatus('代数已删除。');
    await hdLoad(root);
  } catch (err) {
    hdStatus('删除失败：' + ((err && err.message) || '网络错误'));
  }
}

async function hdReorder(root, sourceId, targetId) {
  var st = hdState(root);
  var ids = st.generations.map(function (g) {
    return Number(g.id);
  });
  var from = ids.indexOf(sourceId);
  var to = ids.indexOf(targetId);
  if (from < 0 || to < 0) return;
  ids.splice(from, 1);
  ids.splice(to, 0, sourceId);
  try {
    var r = await apiFetch('/api/admin/hero-generations/reorder', {
      method: 'POST',
      body: JSON.stringify({ orderedIds: ids })
    });
    var d = await r.json().catch(function () {
      return {};
    });
    if (!r.ok) {
      hdStatus('排序失败：' + hdMapErr((d && d.error) || r.status));
      return;
    }
    await hdLoad(root);
    hdStatus('排序已更新。');
  } catch (err) {
    hdStatus('排序失败：' + ((err && err.message) || '网络错误'));
  }
}

function hdBind(root) {
  var reloadBtn = root.document.getElementById('heroDataReloadBtn');
  if (reloadBtn) reloadBtn.addEventListener('click', function () { hdLoad(root); });
  var createBtn = root.document.getElementById('heroGenCreateGenBtn');
  if (createBtn && !createBtn.__hdBound) {
    createBtn.__hdBound = true;
    createBtn.addEventListener('click', function () {
      hdStartCreateGeneration(root);
    });
  }
}

function hdInstall(root) {
  if (!root || !root.document || root.__adminHeroesInstalled) return;
  root.__adminHeroesInstalled = true;
  hdInstallStyles(root);
  hdBind(root);
}

function loadHeroesAdmin() {
  var root = window;
  hdInstall(root);
  hdLoad(root);
}

window.loadHeroesAdmin = loadHeroesAdmin;
