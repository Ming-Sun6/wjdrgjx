'use strict';

function acState(root) {
  if (!root.__adminAeroplaneChessState) {
    root.__adminAeroplaneChessState = { rooms: [], history: [], overview: null };
  }
  return root.__adminAeroplaneChessState;
}

function acStatus(msg) {
  if (typeof setStatus === 'function') setStatus('aeroplaneChessStatus', msg);
}

function acEsc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function acFmtTime(v) {
  if (!v) return '-';
  var d = new Date(v);
  if (!Number.isFinite(d.getTime())) return String(v);
  var p = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function acStateLabel(state) {
  if (state === 'waiting') return '等待中';
  if (state === 'playing') return '游戏中';
  if (state === 'finished') return '已结束';
  return state || '-';
}

function acTakeoffLabel(rule) {
  return rule === 'six' ? '仅6起飞' : '2/4/6起飞';
}

function acInstallStyles(root) {
  if (root.document.getElementById('adminAeroplaneChessStyles')) return;
  var style = root.document.createElement('style');
  style.id = 'adminAeroplaneChessStyles';
  style.textContent =
    '#page-aeroplane-chess .aeroplane-overview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:12px 0}' +
    '#page-aeroplane-chess .aeroplane-stat{padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--surface)}' +
    '#page-aeroplane-chess .aeroplane-stat b{display:block;font-size:1.3rem;margin-top:4px}' +
    '#page-aeroplane-chess .aeroplane-player-list{display:flex;flex-wrap:wrap;gap:5px}' +
    '#page-aeroplane-chess .aeroplane-chip{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--border);border-radius:999px;padding:3px 8px;font-size:.76rem;color:var(--text);background:rgba(59,130,246,.1)}' +
    '#page-aeroplane-chess .aeroplane-chip.ai{background:rgba(16,185,129,.12)}' +
    '#page-aeroplane-chess .aeroplane-chip.spectator{background:rgba(245,158,11,.12)}' +
    '#page-aeroplane-chess .table-wrap table{min-width:1080px}' +
    '#page-aeroplane-chess .aeroplane-actions{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}' +
    '@media(max-width:900px){#page-aeroplane-chess .aeroplane-overview{grid-template-columns:repeat(2,minmax(0,1fr))}}';
  root.document.head.appendChild(style);
}

function acRenderOverview(root) {
  var target = root.document.getElementById('aeroplaneChessOverview');
  if (!target) return;
  var o = acState(root).overview || {};
  target.innerHTML =
    '<div class="aeroplane-overview">' +
    '<div class="aeroplane-stat">房间总数<b>' + acEsc(o.roomsTotal || 0) + '</b></div>' +
    '<div class="aeroplane-stat">游戏中<b>' + acEsc(o.roomsPlaying || 0) + '</b></div>' +
    '<div class="aeroplane-stat">真人 / AI<b>' + acEsc(o.playersReal || 0) + ' / ' + acEsc(o.playersAI || 0) + '</b></div>' +
    '<div class="aeroplane-stat">观战人数<b>' + acEsc(o.spectators || 0) + '</b></div>' +
    '</div>';
}

function acPlayerChips(players) {
  if (!players || !players.length) return '-';
  return '<div class="aeroplane-player-list">' + players.map(function (p) {
    return '<span class="aeroplane-chip ' + (p.isAI ? 'ai' : '') + '">' +
      acEsc(p.color || '-') + '号 ' + acEsc(p.nickname || p.id || '-') + (p.isHost ? ' 房主' : '') +
      '</span>';
  }).join('') + '</div>';
}

function acSpectatorChips(spectators) {
  if (!spectators || !spectators.length) return '-';
  return '<div class="aeroplane-player-list">' + spectators.map(function (p) {
    return '<span class="aeroplane-chip spectator">' + acEsc(p.nickname || p.id || '-') + '</span>';
  }).join('') + '</div>';
}

function acRenderRooms(root) {
  var tbody = root.document.getElementById('aeroplaneChessRoomsTbody');
  if (!tbody) return;
  var rooms = acState(root).rooms || [];
  if (!rooms.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="color:var(--muted);">暂无房间</td></tr>';
    return;
  }
  tbody.innerHTML = rooms.map(function (room) {
    return '<tr data-room-code="' + acEsc(room.code) + '">' +
      '<td><strong>' + acEsc(room.code) + '</strong><br><span style="color:var(--muted);font-size:.78rem;">' + acEsc(room.name || '-') + '</span></td>' +
      '<td>' + acEsc(acStateLabel(room.gameState)) + '</td>' +
      '<td>' + acEsc(acTakeoffLabel(room.settings && room.settings.takeoffRule)) + '<br><span style="color:var(--muted);font-size:.78rem;">棋子' + acEsc(room.settings && room.settings.pieceCount || 4) + '</span></td>' +
      '<td>' + acPlayerChips(room.players) + '</td>' +
      '<td>' + acSpectatorChips(room.spectators) + '</td>' +
      '<td>' + acEsc(room.currentPlayer || '-') + '</td>' +
      '<td>' + acEsc(acFmtTime(room.createdAt)) + '</td>' +
      '<td><div class="aeroplane-actions"><button type="button" class="btn secondary aeroplane-destroy-btn">销毁房间</button></div></td>' +
      '</tr>';
  }).join('');

  tbody.querySelectorAll('.aeroplane-destroy-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tr = btn.closest('tr');
      var code = tr ? tr.getAttribute('data-room-code') : '';
      if (code) acDestroyRoom(root, code);
    });
  });
}

function acRenderHistory(root) {
  var tbody = root.document.getElementById('aeroplaneChessHistoryTbody');
  if (!tbody) return;
  var rows = acState(root).history || [];
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:var(--muted);">暂无战绩</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(function (row) {
    var players = Array.isArray(row.players) ? row.players.map(function (p) { return p.nickname || p.id || ''; }).filter(Boolean).join('、') : '-';
    return '<tr>' +
      '<td>' + acEsc(row.roomCode || '-') + '</td>' +
      '<td><span style="font-family:ui-monospace,Consolas,monospace;font-size:.78rem;">' + acEsc(row.gameSessionId || '-') + '</span></td>' +
      '<td>' + acEsc(row.winnerPlayer == null ? '-' : row.winnerPlayer + '号') + '</td>' +
      '<td>' + acEsc(players || '-') + '</td>' +
      '<td>' + acEsc(acFmtTime(row.endedAt)) + '</td>' +
      '</tr>';
  }).join('');
}

async function acLoad(root) {
  acStatus('加载中...');
  try {
    var overviewResp = await apiFetch('/api/admin/aeroplane-chess/overview', { method: 'GET' });
    var roomsResp = await apiFetch('/api/admin/aeroplane-chess/rooms', { method: 'GET' });
    var historyResp = await apiFetch('/api/admin/aeroplane-chess/history?limit=50', { method: 'GET' });
    var overview = await overviewResp.json().catch(function () { return {}; });
    var rooms = await roomsResp.json().catch(function () { return {}; });
    var history = await historyResp.json().catch(function () { return {}; });
    if (!overviewResp.ok || !roomsResp.ok || !historyResp.ok) {
      throw new Error((overview.error || rooms.error || history.error) || 'LOAD_FAILED');
    }
    var st = acState(root);
    st.overview = overview.overview || {};
    st.rooms = Array.isArray(rooms.rooms) ? rooms.rooms : [];
    st.history = Array.isArray(history.history) ? history.history : [];
    acRenderOverview(root);
    acRenderRooms(root);
    acRenderHistory(root);
    acStatus('已加载：' + st.rooms.length + ' 个房间，' + st.history.length + ' 条战绩');
  } catch (err) {
    acStatus('加载失败：' + (err && err.message ? err.message : '网络错误'));
  }
}

async function acDestroyRoom(root, code) {
  if (!root.confirm('确定销毁房间 ' + code + ' 吗？')) return;
  acStatus('正在销毁房间...');
  try {
    var r = await apiFetch('/api/admin/aeroplane-chess/rooms/' + encodeURIComponent(code) + '/destroy', { method: 'POST' });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(d.error || r.status);
    acStatus('房间已销毁：' + code);
    await acLoad(root);
  } catch (err) {
    acStatus('销毁失败：' + (err && err.message ? err.message : '网络错误'));
  }
}

async function acCleanup(root) {
  acStatus('正在清理...');
  try {
    var r = await apiFetch('/api/admin/aeroplane-chess/cleanup', { method: 'POST' });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(d.error || r.status);
    acStatus('已清理 ' + (d.count || 0) + ' 个房间');
    await acLoad(root);
  } catch (err) {
    acStatus('清理失败：' + (err && err.message ? err.message : '网络错误'));
  }
}

function acInit(root) {
  acInstallStyles(root);
  var reload = root.document.getElementById('aeroplaneChessReloadBtn');
  var cleanup = root.document.getElementById('aeroplaneChessCleanupBtn');
  if (reload && !reload.dataset.bound) {
    reload.dataset.bound = '1';
    reload.addEventListener('click', function () { acLoad(root); });
  }
  if (cleanup && !cleanup.dataset.bound) {
    cleanup.dataset.bound = '1';
    cleanup.addEventListener('click', function () { acCleanup(root); });
  }
  acLoad(root);
}

(function (root) {
  window.adminAeroplaneChess = {
    init: function () { acInit(root); },
    load: function () { return acLoad(root); }
  };
})(window);
