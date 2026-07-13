(function (global) {
  'use strict';

  function escHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[\s·•\-_.，。、；;：:（）()【】\[\]《》<>]/g, '');
  }

  function textOfPack(pack) {
    const base = [pack.name, pack.note || ''];
    (pack.sections || []).forEach(function (s) {
      base.push(s.title || '');
      (s.columns || []).forEach(function (c) {
        base.push(c);
      });
    });
    return normalizeText(base.join(' '));
  }

  function renderTable(section) {
    const cols = section.columns || [];
    const rows = section.rows || [];
    const th = ['礼包价格'].concat(cols).map(function (c) {
      return '<th>' + escHtml(c) + '</th>';
    }).join('');
    const body = rows.map(function (row) {
      const cells = row.map(function (v) {
        return '<td>' + escHtml(v) + '</td>';
      }).join('');
      return '<tr>' + cells + '</tr>';
    }).join('');
    return (
      '<div class="section"><h3 class="section-title">' +
      escHtml(section.title || '礼包内容') +
      '</h3><div class="table-wrap"><table><thead><tr>' +
      th +
      '</tr></thead><tbody>' +
      body +
      '</tbody></table></div></div>'
    );
  }

  function renderDetailMarkup(pack) {
    if (!pack) return '';
    const noteHtml = pack.note ? '<p class="detail-note">' + escHtml(pack.note) + '</p>' : '';
    const sectionsHtml = (pack.sections || []).map(renderTable).join('');
    return noteHtml + sectionsHtml;
  }

  global.initGiftDataPage = function initGiftDataPage(options) {
    const category = String((options && options.category) || '').trim().toLowerCase();
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearBtn');
    const meta = document.getElementById('meta');
    const listEl = document.getElementById('giftList');
    const emptyLeft = document.getElementById('emptyLeft');
    const detailTitle = document.getElementById('detailTitle');
    const detailNote = document.getElementById('detailNote');
    const detailBody = document.getElementById('detailBody');

    let packs = [];
    let filtered = [];
    let activeName = '';
    let expandedNames = new Set();

    function isMobileLayout() {
      return window.matchMedia('(max-width: 920px)').matches;
    }

    function syncSelectionForLayout() {
      if (isMobileLayout()) {
        expandedNames = new Set(
          filtered.filter(function (p) {
            return expandedNames.has(p.name);
          }).map(function (p) {
            return p.name;
          })
        );
        return;
      }
      if (!filtered.some(function (p) {
        return p.name === activeName;
      })) {
        activeName = filtered.length ? filtered[0].name : '';
      }
    }

    function renderDetail(name) {
      const pack = packs.find(function (p) {
        return p.name === name;
      });
      if (!pack) {
        detailTitle.textContent = '请选择礼包';
        detailNote.style.display = 'none';
        detailBody.innerHTML = '';
        return;
      }
      detailTitle.textContent = pack.name;
      if (pack.note) {
        detailNote.textContent = pack.note;
        detailNote.style.display = 'block';
      } else {
        detailNote.style.display = 'none';
      }
      detailBody.innerHTML = renderDetailMarkup(pack);
    }

    function detailIdFor(pack) {
      return 'gift-inline-detail-' + Math.max(0, packs.indexOf(pack));
    }

    function focusGiftButton(name) {
      const buttons = listEl.querySelectorAll('.gift-item');
      for (let i = 0; i < buttons.length; i += 1) {
        if (buttons[i].getAttribute('data-name') === name) {
          buttons[i].focus();
          return;
        }
      }
    }

    function renderList() {
      listEl.innerHTML = filtered
        .map(function (pack) {
          const mobileLayout = isMobileLayout();
          const isExpanded = mobileLayout && expandedNames.has(pack.name);
          const isActive = mobileLayout ? isExpanded : pack.name === activeName;
          const activeCls = isActive ? ' active' : '';
          const detailId = detailIdFor(pack);
          const showInline = mobileLayout && expandedNames.has(pack.name);
          const hiddenAttr = showInline ? '' : ' hidden';
          const disclosureAttrs = mobileLayout
            ? ' aria-expanded="' + (isExpanded ? 'true' : 'false') + '" aria-controls="' + detailId + '"'
            : '';
          const inlineDetail =
            '<div id="' + detailId + '" class="gift-inline-detail" role="region"' + hiddenAttr +
            ' aria-label="' + escHtml(pack.name) + ' 详情">' + renderDetailMarkup(pack) + '</div>';
          return (
            '<button class="gift-item' +
            activeCls +
            '" type="button"' + disclosureAttrs + ' data-name="' +
            escHtml(pack.name) +
            '">' +
            escHtml(pack.name) +
            '</button>' +
            inlineDetail
          );
        })
        .join('');
      emptyLeft.style.display = filtered.length ? 'none' : 'block';
      meta.textContent = searchInput.value.trim()
        ? '匹配到 ' + filtered.length + ' 个礼包'
        : '共 ' + packs.length + ' 个礼包';
    }

    function doFilter() {
      const q = normalizeText(searchInput.value.trim());
      filtered = q
        ? packs.filter(function (p) {
            return textOfPack(p).includes(q);
          })
        : packs.slice();
      syncSelectionForLayout();
      renderList();
      renderDetail(activeName);
    }

    listEl.addEventListener('click', function (e) {
      const btn = e.target.closest('.gift-item');
      if (!btn) return;
      const nextName = btn.getAttribute('data-name') || '';
      if (isMobileLayout()) {
        if (expandedNames.has(nextName)) expandedNames.delete(nextName);
        else expandedNames.add(nextName);
      } else {
        activeName = nextName;
      }
      renderList();
      renderDetail(activeName);
      focusGiftButton(nextName);
    });

    window.addEventListener('resize', function () {
      syncSelectionForLayout();
      renderList();
      renderDetail(activeName);
    });

    searchInput.addEventListener('input', doFilter);
    clearBtn.addEventListener('click', function () {
      searchInput.value = '';
      searchInput.focus();
      doFilter();
    });

    function applyUrlParams() {
      try {
        const sp = new URLSearchParams(location.search);
        const qq = sp.get('q');
        const pick = sp.get('pack');
        if (qq !== null && qq !== undefined) searchInput.value = qq;
        syncSelectionForLayout();
        doFilter();
        if (pick) {
          const hit = filtered.some(function (p) {
            return p.name === pick;
          });
          if (hit) {
            if (isMobileLayout()) expandedNames = new Set([pick]);
            else activeName = pick;
            renderList();
            renderDetail(activeName);
          }
        }
      } catch (_e) {
        syncSelectionForLayout();
        doFilter();
      }
    }

    meta.textContent = '加载礼包数据中…';
    fetch('/api/gift-packs?category=' + encodeURIComponent(category), { credentials: 'same-origin' })
      .then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok) throw new Error((d && d.error) || String(r.status));
          return d;
        });
      })
      .then(function (d) {
        packs = Array.isArray(d.packs) ? d.packs : [];
        filtered = packs.slice();
        if (!packs.length) {
          meta.textContent = '暂无礼包数据';
          emptyLeft.textContent = '暂无礼包，请稍后在后台添加';
          emptyLeft.style.display = 'block';
          listEl.innerHTML = '';
          detailBody.innerHTML = '<p class="tip">后台「礼包管理」添加数据后将自动显示。</p>';
          return;
        }
        applyUrlParams();
      })
      .catch(function () {
        meta.textContent = '加载失败';
        emptyLeft.textContent = '礼包数据加载失败，请刷新重试';
        emptyLeft.style.display = 'block';
        detailBody.innerHTML = '<p class="tip">请确认站点服务已启动，或稍后重试。</p>';
      });
  };
})(window);
