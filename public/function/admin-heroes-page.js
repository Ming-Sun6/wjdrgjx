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
    '.hero-data-admin{display:grid;grid-template-columns:minmax(220px,280px) minmax(0,1fr);gap:16px;align-items:start}' +
    '@media(max-width:960px){.hero-data-admin{grid-template-columns:1fr}}' +
    '.hero-gen-list{border:1px solid var(--border);border-radius:12px;background:var(--surface);max-height:620px;overflow:auto}' +
    '.hero-gen-item{padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer}' +
    '.hero-gen-item:last-child{border-bottom:none}' +
    '.hero-gen-item.active{background:rgba(59,130,246,.12)}' +
    '.hero-gen-item.drag-over{outline:2px dashed rgba(59,130,246,.55);outline-offset:-2px}' +
    '.hero-gen-title{font-weight:800;font-size:.9rem}' +
    '.hero-gen-meta{font-size:.78rem;color:var(--muted);margin-top:4px}' +
    '.hero-editor-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}' +
    '@media(max-width:760px){.hero-editor-grid{grid-template-columns:1fr}}' +
    '.hero-editor-grid .full{grid-column:1/-1}' +
    '.hero-editor-grid label{display:block;font-size:.82rem;color:var(--muted);margin-bottom:6px;font-weight:700}' +
    '.hero-editor-grid input,.hero-editor-grid textarea{width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:10px;background:var(--panel);color:var(--text);padding:8px 10px;font:inherit}' +
    '.hero-editor-grid textarea{min-height:88px;resize:vertical;font-family:inherit;line-height:1.55}' +
    '.hero-sublist{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}' +
    '.hero-sublist button{padding:7px 12px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer;font-weight:700}' +
    '.hero-sublist button.active{background:rgba(59,130,246,.18);border-color:rgba(59,130,246,.55)}' +
    '.hero-skill-block{border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px;background:var(--surface)}' +
    '.hero-skill-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}' +
    '.hero-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}';
  root.document.head.appendChild(style);
}

function hdRenderList(root) {
  var st = hdState(root);
  var list = root.document.getElementById('heroGenList');
  if (!list) return;
  if (!st.generations.length) {
    list.innerHTML = '<div style="padding:12px;color:var(--muted);">暂无代数数据。</div>';
    return;
  }
  list.innerHTML = st.generations
    .map(function (gen) {
      var active = Number(st.selectedId) === Number(gen.id);
      return (
        '<div class="hero-gen-item' +
        (active ? ' active' : '') +
        (Number(st.dragId) === Number(gen.id) ? ' drag-over' : '') +
        '" draggable="true" data-gen-id="' +
        gen.id +
        '">' +
        '<div class="hero-gen-title">' +
        hdEsc(gen.hubTitle) +
        '</div>' +
        '<div class="hero-gen-meta">' +
        hdEsc(gen.slug) +
        ' · ' +
        (gen.heroes ? gen.heroes.length : 0) +
        ' 名英雄' +
        (gen.enabled ? '' : ' · 已停用') +
        '</div></div>'
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
    mount.innerHTML = '<div class="gift-pack-editor-empty">从左侧选择英雄代数进行编辑。</div>';
    return;
  }

  var hero = st.draft.heroes[st.selectedHeroIndex] || st.draft.heroes[0];
  if (!hero) hero = hdDefaultHero();

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

  var skillBlocks = HERO_SKILL_TYPES.map(function (type) {
    var skills = (hero.skills && hero.skills[type.key]) || [];
    var itemsHtml = skills
      .map(function (skill, skillIndex) {
        return (
          '<div class="hero-skill-block" data-skill-type="' +
          type.key +
          '" data-skill-index="' +
          skillIndex +
          '">' +
          '<div class="hero-skill-head"><strong>' +
          hdEsc(type.label) +
          ' #' +
          (skillIndex + 1) +
          '</strong><button type="button" class="btn secondary" data-remove-skill>删除</button></div>' +
          '<div class="hero-editor-grid">' +
          '<div class="full"><label>技能名</label><input data-field="skill-name" value="' +
          hdEsc(skill.name) +
          '" /></div>' +
          '<div class="full"><label>技能描述（每行一条）</label><textarea data-field="skill-lines">' +
          hdEsc(hdLinesToText(skill.lines)) +
          '</textarea></div></div></div>'
        );
      })
      .join('');
    return (
      '<div class="form-section"><div class="form-title">' +
      hdEsc(type.label) +
      '</div>' +
      itemsHtml +
      '<button type="button" class="btn secondary" data-add-skill="' +
      type.key +
      '">添加' +
      hdEsc(type.label) +
      '</button></div>'
    );
  }).join('');

  mount.innerHTML =
    '<div class="hero-toolbar">' +
    '<button type="button" class="btn" id="heroGenSaveBtn">' +
    (st.draft.id ? '保存本代' : '创建代数') +
    '</button>' +
    '<button type="button" class="btn secondary" id="heroGenCreateGenBtn">新增代数</button>' +
    '<button type="button" class="btn secondary" id="heroGenDeleteGenBtn"' +
    (st.draft.id ? '' : ' style="display:none;"') +
    '>删除本代</button>' +
    '<button type="button" class="btn secondary" id="heroGenAddHeroBtn">新增英雄</button>' +
    '<button type="button" class="btn secondary" id="heroGenRemoveHeroBtn">删除当前英雄</button>' +
    '</div>' +
    '<div class="hero-editor-grid">' +
    (st.draft.id
      ? '<div><label>slug（只读）</label><input id="heroFieldSlug" readonly value="' +
        hdEsc(st.draft.slug) +
        '" /></div>'
      : '<div class="full"><label>slug（英文标识，创建后不可改）</label><input id="heroFieldSlug" placeholder="如 sixteenth-generation" value="' +
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
    '<div><label>目录标签</label><input id="heroFieldHubTag" value="' +
    hdEsc(st.draft.hubTag) +
    '" /></div>' +
    '<div><label><input type="checkbox" id="heroFieldEnabled" ' +
    (st.draft.enabled ? 'checked' : '') +
    ' /> 前台启用</label></div>' +
    '</div>' +
    '<div class="hero-sublist" id="heroSublist">' +
    heroTabs +
    '</div>' +
    '<div class="hero-editor-grid">' +
    '<div><label>英雄名</label><input id="heroFieldName" value="' +
    hdEsc(hero.name) +
    '" /></div>' +
    '<div><label>属性</label><input id="heroFieldAttr" value="' +
    hdEsc(hero.attr) +
    '" /></div>' +
    '<div class="full"><label>头像路径</label><input id="heroFieldImage" value="' +
    hdEsc(hero.image) +
    '" /></div>' +
    '<div class="full"><label>培养建议</label><input id="heroFieldAdvice" value="' +
    hdEsc(hero.advice) +
    '" /></div>' +
    '<div><label>探险属性（每行一条）</label><textarea id="heroFieldExplore">' +
    hdEsc(hdLinesToText(hero.exploreStats)) +
    '</textarea></div>' +
    '<div><label>远征属性（每行一条）</label><textarea id="heroFieldExpedition">' +
    hdEsc(hdLinesToText(hero.expeditionStats)) +
    '</textarea></div>' +
    '<div class="full"><label>获取方式（每行一条）</label><textarea id="heroFieldObtain">' +
    hdEsc(hdLinesToText(hero.obtainWays)) +
    '</textarea></div>' +
    '</div>' +
    skillBlocks;

  mount.querySelector('#heroGenSaveBtn').addEventListener('click', function () {
    hdCollectEditor(root);
    hdSaveCurrent(root);
  });
  var createGenBtn = mount.querySelector('#heroGenCreateGenBtn');
  if (createGenBtn) {
    createGenBtn.addEventListener('click', function () {
      hdStartCreateGeneration(root);
    });
  }
  var deleteGenBtn = mount.querySelector('#heroGenDeleteGenBtn');
  if (deleteGenBtn) {
    deleteGenBtn.addEventListener('click', function () {
      hdDeleteGeneration(root);
    });
  }
  mount.querySelector('#heroGenAddHeroBtn').addEventListener('click', function () {
    hdCollectEditor(root);
    st.draft.heroes.push(hdDefaultHero());
    st.selectedHeroIndex = st.draft.heroes.length - 1;
    st.dirty = true;
    hdRenderEditor(root);
  });
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
  mount.querySelectorAll('#heroSublist button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      hdCollectEditor(root);
      st.selectedHeroIndex = Number(btn.getAttribute('data-hero-index'));
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
    hdStatus('共 ' + st.generations.length + ' 个代数。');
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
