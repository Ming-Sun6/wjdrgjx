'use strict';

function gpState(root) {
  if (!root.__adminGiftPacksState) {
    root.__adminGiftPacksState = {
      category: 'regular',
      packs: [],
      selectedId: null,
      draft: null,
      dirty: false,
      dragId: null
    };
  }
  return root.__adminGiftPacksState;
}

function gpStatus(msg) {
  if (typeof setStatus === 'function') setStatus('giftPackStatus', msg);
}

function gpEsc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function gpMapErr(error) {
  if (error === 'BAD_NAME') return '礼包名称无效（不能为空且不超过 200 字）。';
  if (error === 'BAD_CATEGORY') return '礼包分类无效。';
  if (error === 'BAD_SECTIONS') return '至少需要一个内容区块。';
  if (error === 'BAD_COLUMNS') return '每个区块至少一列道具。';
  if (error === 'BAD_ROWS') return '每个区块至少一行价格档位。';
  if (error === 'ROW_WIDTH') return '表格列数与行数据不一致，请检查每行列数。';
  if (error === 'NOT_FOUND') return '礼包不存在，可能已被删除。';
  return error || '未知错误';
}

function gpDefaultSection() {
  return {
    title: '礼包内容',
    columns: ['道具A', '道具B'],
    rows: [
      ['30', '1', '1'],
      ['68', '2', '2'],
      ['128', '4', '4']
    ]
  };
}

function gpDefaultDraft(category) {
  return {
    id: null,
    category: category,
    name: '新礼包',
    note: '',
    enabled: true,
    sortOrder: 0,
    sections: [gpDefaultSection()]
  };
}

function gpCloneDraft(draft) {
  return JSON.parse(JSON.stringify(draft));
}

function gpNormalizeDraft(draft) {
  const next = gpCloneDraft(draft);
  next.name = String(next.name || '').trim();
  next.note = String(next.note || '').trim();
  next.enabled = !!next.enabled;
  next.sections = (next.sections || []).map(function (section) {
    const cols = (section.columns || []).map(function (c) {
      return String(c || '').trim();
    }).filter(Boolean);
    const width = cols.length + 1;
    const rows = (section.rows || []).map(function (row) {
      const cells = Array.isArray(row) ? row.slice(0, width) : [];
      while (cells.length < width) cells.push('');
      return cells.map(function (cell) {
        return String(cell ?? '').trim();
      });
    }).filter(function (row) {
      return row.some(function (cell) {
        return cell !== '';
      });
    });
    return {
      title: String(section.title || '礼包内容').trim() || '礼包内容',
      columns: cols.length ? cols : ['道具'],
      rows: rows.length ? rows : [['30', '1']]
    };
  });
  if (!next.sections.length) next.sections = [gpDefaultSection()];
  return next;
}

function gpStyles(doc) {
  if (!doc || doc.getElementById('adminGiftPacksStyles')) return;
  var s = doc.createElement('style');
  s.id = 'adminGiftPacksStyles';
  s.textContent =
    '.gift-pack-admin{display:grid;grid-template-columns:minmax(220px,280px) minmax(0,1fr);gap:16px;align-items:start}' +
    '@media(max-width:960px){.gift-pack-admin{grid-template-columns:1fr}}' +
    '.gift-pack-admin .type-buttons{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}' +
    '.gift-pack-admin .type-btn{padding:8px 14px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer;font-weight:700}' +
    '.gift-pack-admin .type-btn.active{background:rgba(59,130,246,.18);border-color:rgba(59,130,246,.55);color:#bfdbfe}' +
    '.gift-pack-list{border:1px solid var(--border);border-radius:12px;background:var(--surface);max-height:560px;overflow:auto}' +
    '.gift-pack-list-item{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer;background:var(--surface)}' +
    '.gift-pack-list-item:last-child{border-bottom:none}' +
    '.gift-pack-list-item.active{background:rgba(59,130,246,.12)}' +
    '.gift-pack-list-item.disabled{opacity:.55}' +
    '.gift-pack-drag{cursor:grab;color:var(--muted);font-size:1rem;line-height:1;user-select:none;padding:0 2px}' +
    '.gift-pack-list-item.drag-over{outline:2px dashed rgba(59,130,246,.55);outline-offset:-2px}' +
    '.gift-pack-list-name{flex:1;min-width:0;white-space:pre-wrap;font-weight:700;font-size:.88rem;line-height:1.35}' +
    '.gift-pack-editor{border:1px solid var(--border);border-radius:12px;background:var(--surface);padding:14px}' +
    '.gift-pack-editor-empty{color:var(--muted);padding:24px 12px;text-align:center}' +
    '.gift-pack-field{margin-bottom:12px}' +
    '.gift-pack-field label{display:block;font-size:.8rem;color:var(--muted);font-weight:700;margin-bottom:6px}' +
    '.gift-pack-field input,.gift-pack-field textarea{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:10px;border:1px solid var(--border);background:var(--surface-strong);color:var(--text);font:inherit}' +
    '.gift-pack-field textarea{min-height:72px;resize:vertical;white-space:pre-wrap}' +
    '.gift-pack-section{border:1px solid var(--border);border-radius:12px;padding:12px;margin-top:12px;background:var(--surface-strong)}' +
    '.gift-pack-section-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap}' +
    '.gift-pack-section-title{font-weight:800}' +
    '.gift-pack-columns{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}' +
    '.gift-pack-col-chip{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:999px;border:1px solid var(--border);background:var(--surface)}' +
    '.gift-pack-col-chip input{width:120px;border:none;background:transparent;padding:0;color:var(--text);font:inherit}' +
    '.gift-pack-col-chip button{border:none;background:transparent;color:#ef4444;cursor:pointer;font-weight:800}' +
    '.gift-pack-table{width:100%;border-collapse:collapse;font-size:.84rem}' +
    '.gift-pack-table th,.gift-pack-table td{border:1px solid var(--border);padding:6px;text-align:center}' +
    '.gift-pack-table th{background:rgba(148,163,184,.12);font-weight:800}' +
    '.gift-pack-table input{width:100%;min-width:48px;box-sizing:border-box;border:none;background:transparent;color:var(--text);text-align:center;font:inherit;padding:4px}' +
    '.gift-pack-row-actions{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}' +
    '.gift-pack-row-actions button{border:none;border-radius:8px;padding:4px 8px;font-size:.75rem;font-weight:700;cursor:pointer;color:#fff;background:#64748b}' +
    '.gift-pack-row-actions button.copy{background:#3b82f6}' +
    '.gift-pack-row-actions button.del{background:#ef4444}' +
    '.gift-pack-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}' +
    '.gift-pack-toolbar .btn{font-size:.85rem;padding:8px 12px}';
  doc.head.appendChild(s);
}

function gpRenderList(root) {
  var st = gpState(root);
  var list = root.document.getElementById('giftPackList');
  if (!list) return;
  if (!st.packs.length) {
    list.innerHTML = '<div class="gift-pack-editor-empty">暂无礼包，点击「新增礼包」开始。</div>';
    return;
  }
  list.innerHTML = st.packs
    .map(function (pack) {
      var active = Number(pack.id) === Number(st.selectedId) ? ' active' : '';
      var disabled = pack.enabled ? '' : ' disabled';
      return (
        '<div class="gift-pack-list-item' +
        active +
        disabled +
        '" data-id="' +
        gpEsc(pack.id) +
        '" draggable="true">' +
        '<span class="gift-pack-drag" title="拖拽排序">⋮⋮</span>' +
        '<div class="gift-pack-list-name">' +
        gpEsc(pack.name) +
        '</div>' +
        '</div>'
      );
    })
    .join('');

  list.querySelectorAll('.gift-pack-list-item').forEach(function (item) {
    item.addEventListener('click', function () {
      gpSelectPack(root, Number(item.getAttribute('data-id')));
    });
    item.addEventListener('dragstart', function (e) {
      st.dragId = Number(item.getAttribute('data-id'));
      item.classList.add('drag-over');
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', function () {
      st.dragId = null;
      list.querySelectorAll('.gift-pack-list-item').forEach(function (node) {
        node.classList.remove('drag-over');
      });
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
      var targetId = Number(item.getAttribute('data-id'));
      if (!st.dragId || st.dragId === targetId) return;
      gpReorder(root, st.dragId, targetId);
    });
  });
}

function gpRenderEditor(root) {
  var st = gpState(root);
  var mount = root.document.getElementById('giftPackEditor');
  if (!mount) return;
  if (!st.draft) {
    mount.innerHTML = '<div class="gift-pack-editor-empty">从左侧选择礼包，或新建一个礼包。</div>';
    return;
  }
  var draft = st.draft;
  var sectionsHtml = (draft.sections || [])
    .map(function (section, sIdx) {
      var colHtml = (section.columns || [])
        .map(function (col, cIdx) {
          return (
            '<div class="gift-pack-col-chip" data-s="' +
            sIdx +
            '" data-c="' +
            cIdx +
            '"><input type="text" value="' +
            gpEsc(col) +
            '" data-role="col-name" /><button type="button" data-role="col-del" title="删除列">×</button></div>'
          );
        })
        .join('');
      var head =
        '<tr><th>礼包价格</th>' +
        (section.columns || [])
          .map(function (col) {
            return '<th>' + gpEsc(col) + '</th>';
          })
          .join('') +
        '<th style="width:120px;">操作</th></tr>';
      var body = (section.rows || [])
        .map(function (row, rIdx) {
          var cells = (row || [])
            .map(function (cell, cIdx) {
              return (
                '<td><input type="text" value="' +
                gpEsc(cell) +
                '" data-role="cell" data-s="' +
                sIdx +
                '" data-r="' +
                rIdx +
                '" data-c="' +
                cIdx +
                '" /></td>'
              );
            })
            .join('');
          return (
            '<tr data-s="' +
            sIdx +
            '" data-r="' +
            rIdx +
            '">' +
            cells +
            '<td><div class="gift-pack-row-actions">' +
            '<button type="button" class="copy" data-role="copy-row" data-s="' +
            sIdx +
            '" data-r="' +
            rIdx +
            '">复制档位</button>' +
            '<button type="button" class="del" data-role="del-row" data-s="' +
            sIdx +
            '" data-r="' +
            rIdx +
            '">删除</button>' +
            '</div></td></tr>'
          );
        })
        .join('');
      return (
        '<div class="gift-pack-section" data-section="' +
        sIdx +
        '"><div class="gift-pack-section-head"><div class="gift-pack-section-title">区块 ' +
        (sIdx + 1) +
        '</div><div class="gift-pack-row-actions"><button type="button" data-role="add-row" data-s="' +
        sIdx +
        '">+ 档位</button><button type="button" data-role="add-col" data-s="' +
        sIdx +
        '">+ 列</button><button type="button" class="del" data-role="del-section" data-s="' +
        sIdx +
        '">删除区块</button></div></div>' +
        '<div class="gift-pack-field"><label>区块标题</label><input type="text" data-role="section-title" data-s="' +
        sIdx +
        '" value="' +
        gpEsc(section.title || '') +
        '" /></div>' +
        '<div class="gift-pack-columns">' +
        colHtml +
        '</div>' +
        '<div class="table-wrap"><table class="gift-pack-table"><thead>' +
        head +
        '</thead><tbody>' +
        body +
        '</tbody></table></div></div>'
      );
    })
    .join('');

  mount.innerHTML =
    '<div class="gift-pack-field"><label>礼包名称（支持换行）</label><textarea id="giftPackNameInput">' +
    gpEsc(draft.name) +
    '</textarea></div>' +
    '<div class="gift-pack-field"><label>备注（可选）</label><textarea id="giftPackNoteInput">' +
    gpEsc(draft.note || '') +
    '</textarea></div>' +
    '<div class="gift-pack-field"><label><input type="checkbox" id="giftPackEnabledInput"' +
    (draft.enabled ? ' checked' : '') +
    ' /> 在前台展示</label></div>' +
    sectionsHtml +
    '<div class="gift-pack-toolbar" style="margin-top:14px;">' +
    '<button class="btn secondary" type="button" id="giftPackAddSectionBtn">+ 新区块</button>' +
    '<button class="btn" type="button" id="giftPackSaveBtn">保存当前礼包</button>' +
    '<button class="btn danger" type="button" id="giftPackDeleteBtn">删除礼包</button>' +
    '</div>';

  var nameInput = mount.querySelector('#giftPackNameInput');
  var noteInput = mount.querySelector('#giftPackNoteInput');
  var enabledInput = mount.querySelector('#giftPackEnabledInput');
  if (nameInput) {
    nameInput.addEventListener('input', function () {
      st.draft.name = nameInput.value;
      st.dirty = true;
    });
  }
  if (noteInput) {
    noteInput.addEventListener('input', function () {
      st.draft.note = noteInput.value;
      st.dirty = true;
    });
  }
  if (enabledInput) {
    enabledInput.addEventListener('change', function () {
      st.draft.enabled = enabledInput.checked;
      st.dirty = true;
    });
  }

  mount.querySelectorAll('[data-role="section-title"]').forEach(function (input) {
    input.addEventListener('input', function () {
      var s = Number(input.getAttribute('data-s'));
      st.draft.sections[s].title = input.value;
      st.dirty = true;
    });
  });

  mount.querySelectorAll('[data-role="col-name"]').forEach(function (input) {
    input.addEventListener('input', function () {
      var chip = input.closest('.gift-pack-col-chip');
      var s = Number(chip.getAttribute('data-s'));
      var c = Number(chip.getAttribute('data-c'));
      st.draft.sections[s].columns[c] = input.value;
      st.dirty = true;
    });
  });

  mount.querySelectorAll('[data-role="col-del"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var chip = btn.closest('.gift-pack-col-chip');
      var s = Number(chip.getAttribute('data-s'));
      var c = Number(chip.getAttribute('data-c'));
      var section = st.draft.sections[s];
      if (section.columns.length <= 1) return;
      section.columns.splice(c, 1);
      section.rows = section.rows.map(function (row) {
        row.splice(c + 1, 1);
        return row;
      });
      st.dirty = true;
      gpRenderEditor(root);
    });
  });

  mount.querySelectorAll('[data-role="cell"]').forEach(function (input) {
    input.addEventListener('input', function () {
      var s = Number(input.getAttribute('data-s'));
      var r = Number(input.getAttribute('data-r'));
      var c = Number(input.getAttribute('data-c'));
      st.draft.sections[s].rows[r][c] = input.value;
      st.dirty = true;
    });
  });

  mount.querySelectorAll('[data-role="copy-row"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var s = Number(btn.getAttribute('data-s'));
      var r = Number(btn.getAttribute('data-r'));
      var row = st.draft.sections[s].rows[r].slice();
      st.draft.sections[s].rows.splice(r + 1, 0, row);
      st.dirty = true;
      gpRenderEditor(root);
    });
  });

  mount.querySelectorAll('[data-role="del-row"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var s = Number(btn.getAttribute('data-s'));
      var r = Number(btn.getAttribute('data-r'));
      if (st.draft.sections[s].rows.length <= 1) return;
      st.draft.sections[s].rows.splice(r, 1);
      st.dirty = true;
      gpRenderEditor(root);
    });
  });

  mount.querySelectorAll('[data-role="add-row"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var s = Number(btn.getAttribute('data-s'));
      var section = st.draft.sections[s];
      var width = section.columns.length + 1;
      var last = section.rows.length ? section.rows[section.rows.length - 1].slice() : new Array(width).fill('');
      while (last.length < width) last.push('');
      section.rows.push(last);
      st.dirty = true;
      gpRenderEditor(root);
    });
  });

  mount.querySelectorAll('[data-role="add-col"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var s = Number(btn.getAttribute('data-s'));
      var section = st.draft.sections[s];
      section.columns.push('新道具');
      section.rows = section.rows.map(function (row) {
        row.push('');
        return row;
      });
      st.dirty = true;
      gpRenderEditor(root);
    });
  });

  mount.querySelectorAll('[data-role="del-section"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var s = Number(btn.getAttribute('data-s'));
      if (st.draft.sections.length <= 1) return;
      st.draft.sections.splice(s, 1);
      st.dirty = true;
      gpRenderEditor(root);
    });
  });

  var addSectionBtn = mount.querySelector('#giftPackAddSectionBtn');
  if (addSectionBtn) {
    addSectionBtn.addEventListener('click', function () {
      st.draft.sections.push(gpDefaultSection());
      st.dirty = true;
      gpRenderEditor(root);
    });
  }

  var saveBtn = mount.querySelector('#giftPackSaveBtn');
  if (saveBtn) saveBtn.addEventListener('click', function () { gpSaveCurrent(root); });

  var deleteBtn = mount.querySelector('#giftPackDeleteBtn');
  if (deleteBtn) deleteBtn.addEventListener('click', function () { gpDeleteCurrent(root); });
}

function gpSelectPack(root, id) {
  var st = gpState(root);
  if (st.dirty && st.selectedId !== id) {
    if (!root.confirm('当前礼包有未保存修改，确定切换吗？')) return;
  }
  var pack = st.packs.find(function (p) {
    return Number(p.id) === Number(id);
  });
  if (!pack) return;
  st.selectedId = pack.id;
  st.draft = gpCloneDraft({
    id: pack.id,
    category: pack.category,
    name: pack.name,
    note: pack.note || '',
    enabled: pack.enabled !== false,
    sortOrder: pack.sortOrder || 0,
    sections: pack.sections || [gpDefaultSection()]
  });
  st.dirty = false;
  gpRenderList(root);
  gpRenderEditor(root);
}

async function gpLoad(root) {
  if (!authUser || !authUser.isAdmin) {
    gpStatus('没有权限：请使用管理员账号登录。');
    gpRenderList(root);
    gpRenderEditor(root);
    return;
  }
  var st = gpState(root);
  gpStatus('加载中…');
  try {
    var r = await apiFetch('/api/admin/gift-packs?category=' + encodeURIComponent(st.category), { method: 'GET' });
    if (r.status === 401 || r.status === 403) {
      gpStatus('没有权限：请确认管理员账号。');
      st.packs = [];
      st.selectedId = null;
      st.draft = null;
      gpRenderList(root);
      gpRenderEditor(root);
      return;
    }
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      gpStatus('加载失败：' + gpMapErr((d && d.error) || r.status));
      return;
    }
    st.packs = Array.isArray(d.packs) ? d.packs : [];
    if (st.selectedId && !st.packs.some(function (p) { return Number(p.id) === Number(st.selectedId); })) {
      st.selectedId = null;
      st.draft = null;
    }
    if (st.selectedId) {
      var current = st.packs.find(function (p) { return Number(p.id) === Number(st.selectedId); });
      if (current && !st.dirty) {
        st.draft = gpCloneDraft({
          id: current.id,
          category: current.category,
          name: current.name,
          note: current.note || '',
          enabled: current.enabled !== false,
          sortOrder: current.sortOrder || 0,
          sections: current.sections || [gpDefaultSection()]
        });
      }
    }
    gpRenderList(root);
    gpRenderEditor(root);
    gpStatus('共 ' + st.packs.length + ' 个' + (st.category === 'regular' ? '常规' : '特惠') + '礼包');
  } catch (err) {
    gpStatus('加载失败：' + ((err && err.message) || '网络错误'));
  }
}

function gpSwitchCategory(root, category) {
  var st = gpState(root);
  if (st.dirty) {
    if (!root.confirm('当前有未保存修改，确定切换分类吗？')) return;
  }
  st.category = category;
  st.selectedId = null;
  st.draft = null;
  st.dirty = false;
  root.document.querySelectorAll('[data-gift-category]').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-gift-category') === category);
  });
  gpLoad(root);
}

function gpCreateNew(root) {
  var st = gpState(root);
  if (st.dirty && !root.confirm('当前有未保存修改，确定新建吗？')) return;
  st.selectedId = null;
  st.draft = gpDefaultDraft(st.category);
  st.dirty = true;
  gpRenderList(root);
  gpRenderEditor(root);
  gpStatus('正在编辑新礼包，填写后点击保存。');
}

async function gpSaveCurrent(root) {
  var st = gpState(root);
  if (!st.draft) return;
  var payload = gpNormalizeDraft(st.draft);
  payload.category = st.category;
  payload.sortOrder = st.draft.sortOrder || 0;
  payload.enabled = st.draft.enabled;
  gpStatus('保存中…');
  try {
    var isNew = !st.draft.id;
    var url = isNew ? '/api/admin/gift-packs' : '/api/admin/gift-packs/' + encodeURIComponent(st.draft.id);
    var r = await apiFetch(url, {
      method: 'POST',
      body: JSON.stringify({
        category: payload.category,
        name: payload.name,
        note: payload.note,
        enabled: payload.enabled,
        sortOrder: payload.sortOrder,
        sections: payload.sections
      })
    });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      gpStatus('保存失败：' + gpMapErr((d && d.error) || r.status));
      return;
    }
    if (isNew && d.id) st.selectedId = Number(d.id);
    st.dirty = false;
    gpStatus(isNew ? '新礼包已创建。' : '礼包已保存。');
    await gpLoad(root);
    if (st.selectedId) gpSelectPack(root, st.selectedId);
  } catch (err) {
    gpStatus('保存失败：' + ((err && err.message) || '网络错误'));
  }
}

async function gpDeleteCurrent(root) {
  var st = gpState(root);
  if (!st.draft || !st.draft.id) {
    st.draft = null;
    st.selectedId = null;
    st.dirty = false;
    gpRenderList(root);
    gpRenderEditor(root);
    return;
  }
  if (!root.confirm('确认删除礼包「' + st.draft.name + '」？此操作不可恢复。')) return;
  try {
    var r = await apiFetch('/api/admin/gift-packs/' + encodeURIComponent(st.draft.id), { method: 'DELETE' });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      gpStatus('删除失败：' + gpMapErr((d && d.error) || r.status));
      return;
    }
    st.selectedId = null;
    st.draft = null;
    st.dirty = false;
    gpStatus('礼包已删除。');
    await gpLoad(root);
  } catch (err) {
    gpStatus('删除失败：' + ((err && err.message) || '网络错误'));
  }
}

async function gpReorder(root, sourceId, targetId) {
  var st = gpState(root);
  var ids = st.packs.map(function (p) { return Number(p.id); });
  var from = ids.indexOf(sourceId);
  var to = ids.indexOf(targetId);
  if (from < 0 || to < 0) return;
  ids.splice(from, 1);
  ids.splice(to, 0, sourceId);
  try {
    var r = await apiFetch('/api/admin/gift-packs/reorder', {
      method: 'POST',
      body: JSON.stringify({ category: st.category, orderedIds: ids })
    });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      gpStatus('排序失败：' + gpMapErr((d && d.error) || r.status));
      return;
    }
    await gpLoad(root);
    gpStatus('排序已更新。');
  } catch (err) {
    gpStatus('排序失败：' + ((err && err.message) || '网络错误'));
  }
}

function gpBind(root) {
  var doc = root.document;
  doc.querySelectorAll('[data-gift-category]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      gpSwitchCategory(root, btn.getAttribute('data-gift-category'));
    });
  });
  var addBtn = doc.getElementById('giftPackCreateBtn');
  if (addBtn) addBtn.addEventListener('click', function () { gpCreateNew(root); });
  var reloadBtn = doc.getElementById('giftPackReloadBtn');
  if (reloadBtn) reloadBtn.addEventListener('click', function () { gpLoad(root); });
}

function gpInstall(root) {
  if (!root || !root.document || root.__adminGiftPacksInstalled) return;
  root.__adminGiftPacksInstalled = true;
  gpStyles(root.document);
  gpBind(root);
  var original = typeof root.loadCurrentPage === 'function' ? root.loadCurrentPage : null;
  root.loadGiftPacksAdmin = function () { gpLoad(root); };
  root.loadCurrentPage = function () {
    if (typeof root.currentPage !== 'undefined' && root.currentPage === 'gift-packs') {
      return gpLoad(root);
    }
    if (typeof original === 'function') return original();
    return undefined;
  };
}

gpInstall(window);
