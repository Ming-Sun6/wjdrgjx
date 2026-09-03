<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { markColors } from "../data/styles.js";
import { presetEntities } from "../data/presets.js";
import { EditorMode, useEditorStore } from "../stores/editor.js";
import { useViewportStore } from "../stores/viewport.js";
import { rectFromPoints, screenToCell, screenToWorld } from "../utils/geometry.js";
import { onIconLoad } from "../utils/icons.js";
import { CanvasRenderer, buildPresetLabels } from "../render/canvas-renderer.js";
import RewardPanel from "./RewardPanel.vue";

const TILT_SENS = 0.005;
const editor = useEditorStore();
const viewport = useViewportStore();
const wrapRef = ref(null);
const canvasRef = ref(null);
const contextMenuRef = ref(null);
let renderer = null;
let unsubIcons = null;
let resizeObs = null;
const activeDraft = ref(null);
const drag = reactive({
  active: false,
  kind: null,
  lastX: 0,
  lastY: 0,
  moved: false,
  startCell: null,
});
const pointers = new Map();
const gesture = {
  mode: null,
  lastDist: 0,
  lastAngle: 0,
  lastCX: 0,
  lastCY: 0,
};
let lastTap = { t: 0, x: 0, y: 0 };
let longPressTimer = null;
const labels = buildPresetLabels();
const markColorMap = Object.fromEntries(markColors.map((c) => [c.key, c.color]));
const markPreviewColor = computed(() => markColorMap[editor.markColorKey] || "#3a9bff");
const teText = ref("");
const teInputRef = ref(null);
const teStyle = reactive({
  color: "#eaf2ff",
  bgColor: "#000000",
  showBg: true,
  size: 12,
  followZoom: false,
  fixed: false,
});

watch(() => editor.textEdit, (edit) => {
  if (!edit) return;
  teText.value = edit.value || "";
  const s = edit.style || {};
  teStyle.color = s.color ?? "#eaf2ff";
  teStyle.bgColor = s.bgColor ?? "#000000";
  teStyle.showBg = s.showBg ?? true;
  teStyle.size = s.size ?? 12;
  teStyle.followZoom = s.followZoom ?? false;
  teStyle.fixed = s.fixed ?? false;
  nextTick(() => {
    const el = teInputRef.value;
    if (el) {
      el.focus();
      el.select();
    }
  });
});

function bumpTeSize(delta) {
  teStyle.size = Math.max(6, Math.min(96, teStyle.size + delta));
}
function clearTeText() {
  teText.value = "";
  teInputRef.value?.focus();
}
function applyTe() {
  editor.applyTextEdit({ text: teText.value, style: { ...teStyle } });
}

const wrapVal = computed(() => {
  const menu = editor.contextMenu;
  return menu ? editor.wrapValue(menu.target.id) : 0;
});
const canEditText = computed(() => {
  const menu = editor.contextMenu;
  if (!menu) return false;
  const t = menu.target;
  if (t.type === "drawing") return true;
  if (t.type === "entity") return t.key !== "mountain" && t.key !== "water";
  return false;
});
const mobileCancelLabel = computed(() => {
  const m = editor.mode;
  if (m === EditorMode.PLACE) return "取消放置";
  if (isDrawMode(m)) return "取消绘制";
  if (m === EditorMode.MARK) return "取消标记";
  return null;
});

function buildScene() {
  const carry = editor.carry;
  let entities = editor.userEntities;
  let draws = editor.drawings;
  let marks = editor.markers;
  if (carry && carry.action === "move") {
    if (carry.target === "entity") entities = entities.filter((e) => e.id !== carry.id);
    else if (carry.target === "marker") marks = marks.filter((m) => m.id !== carry.id);
    else draws = draws.filter((d) => d.id !== carry.id);
  }
  const showHover = editor.mode === EditorMode.IDLE || editor.mode === EditorMode.MOVE;
  return {
    cam: { ...viewport.cam },
    dpr: window.devicePixelRatio || 1,
    visibility: { ...editor.visibility },
    presetEntities,
    userEntities: entities,
    drawings: draws,
    selectionBounds: editor.selectionBounds,
    violationIds: editor.violationIds,
    markers: marks,
    markPreview: { active: editor.mode === EditorMode.MARK, color: markPreviewColor.value },
    hover: showHover ? editor.hover : null,
    cursorCell: editor.cursor ? { x: editor.cursor.cx, y: editor.cursor.cy } : null,
    preview: editor.preview,
    carry: editor.carry,
    activeDraft: activeDraft.value,
    labels,
    showLabels: editor.visibility.labels,
    labelAlpha: editor.labelAlpha,
    showIcons: editor.visibility.icons,
    textStyle: { ...editor.textStyle },
    drawStyle: editor.drawStyleResolved,
    forceFineGrid: false,
  };
}

function paint() {
  if (renderer) renderer.setScene(buildScene());
}

const cursorStyle = computed(() => {
  if (editor.carry || (drag.active && drag.kind === "idle")) return "grabbing";
  if (editor.mode === EditorMode.MOVE) return "pointer";
  if (editor.mode === EditorMode.PLACE || editor.mode !== EditorMode.IDLE) return "crosshair";
  return "grab";
});

function resize() {
  const wrap = wrapRef.value;
  if (!wrap || !renderer) return;
  const box = wrap.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  viewport.setViewSize(box.width, box.height);
  renderer.resize(box.width, box.height, dpr);
  paint();
}

function localPoint(ev) {
  const box = canvasRef.value.getBoundingClientRect();
  return { x: ev.clientX - box.left, y: ev.clientY - box.top };
}
function cellOf(ev) {
  const p = localPoint(ev);
  return screenToCell(viewport.cam, p.x, p.y);
}
function worldOf(ev) {
  const p = localPoint(ev);
  return screenToWorld(viewport.cam, p.x, p.y);
}

function onPointerDown(ev) {
  editor.closeContextMenu();
  if (ev.button === 2) return;
  if (ev.button === 1) {
    ev.preventDefault();
    const p = localPoint(ev);
    try { canvasRef.value.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
    drag.active = true;
    drag.kind = "mid-pan";
    drag.lastX = p.x;
    drag.lastY = p.y;
    drag.moved = false;
    return;
  }
  const p = localPoint(ev);
  const touch = ev.pointerType !== "mouse";
  pointers.set(ev.pointerId, p);
  if (touch) {
    try { canvasRef.value.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
  }
  if (touch && pointers.size >= 2) {
    beginGesture();
    return;
  }
  const cell = cellOf(ev);
  const world = worldOf(ev);
  if (editor.carry) {
    editor.dropCarry(cell, world);
    paint();
    return;
  }
  if (editor.mode === EditorMode.MARK) {
    if (touch) {
      canvasRef.value.setPointerCapture(ev.pointerId);
      drag.lastX = p.x;
      drag.lastY = p.y;
      drag.moved = false;
      drag.startCell = cell;
      drag.active = true;
      drag.kind = "mark-tap";
    } else {
      editor.toggleMarkerAt(cell);
    }
    return;
  }
  canvasRef.value.setPointerCapture(ev.pointerId);
  drag.lastX = p.x;
  drag.lastY = p.y;
  drag.moved = false;
  drag.startCell = cell;
  if (editor.mode === EditorMode.PLACE) {
    if (touch) {
      drag.active = true;
      drag.kind = "place-tap";
    } else {
      editor.placeAt(cell);
    }
    return;
  }
  if (editor.mode === EditorMode.MOVE) {
    editor.pickUpForMove(cell);
    return;
  }
  if (editor.mode === EditorMode.MARQUEE) {
    drag.active = true;
    drag.kind = "marquee";
    activeDraft.value = { kind: "marquee", bounds: [cell.x, cell.y, cell.x, cell.y] };
    return;
  }
  if (isDrawMode(editor.mode)) {
    drag.active = true;
    drag.kind = "draw";
    startDraw(cell, world);
    return;
  }
  drag.active = true;
  drag.kind = "idle";
  if (touch) startLongPress(cell, p);
}

function onPointerMove(ev) {
  const p = localPoint(ev);
  if (drag.active && drag.kind === "mid-pan") {
    const dx = p.x - drag.lastX;
    const dy = p.y - drag.lastY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
    viewport.panByScreen(dx, dy);
    drag.lastX = p.x;
    drag.lastY = p.y;
    return;
  }
  if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, p);
  if (gesture.mode) {
    updateGesture();
    return;
  }
  const cell = cellOf(ev);
  const world = worldOf(ev);
  editor.setCursor(cell, world);
  if (editor.carry) {
    editor.updateCarry(cell, world);
    return;
  }
  if (drag.active) {
    const dx = p.x - drag.lastX;
    const dy = p.y - drag.lastY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      drag.moved = true;
      clearLongPress();
    }
    if (drag.kind === "idle") viewport.panByScreen(dx, dy);
    else if (drag.kind === "marquee") {
      activeDraft.value = { kind: "marquee", bounds: rectFromPoints(drag.startCell.x, drag.startCell.y, cell.x, cell.y) };
    } else if (drag.kind === "draw") {
      updateDraw(cell, world);
    }
    drag.lastX = p.x;
    drag.lastY = p.y;
    return;
  }
  if (editor.mode === EditorMode.IDLE || editor.mode === EditorMode.PLACE || editor.mode === EditorMode.MOVE) {
    editor.updateHover(cell);
  } else {
    editor.bump();
  }
}

function onPointerUp(ev) {
  const touch = ev.pointerType !== "mouse";
  pointers.delete(ev.pointerId);
  clearLongPress();
  try { canvasRef.value?.releasePointerCapture?.(ev.pointerId); } catch { /* ignore */ }
  if (gesture.mode) {
    if (pointers.size >= 2) syncGesture();
    else {
      gesture.mode = null;
      drag.active = false;
      drag.kind = null;
    }
    return;
  }
  if (!drag.active) return;
  const p = localPoint(ev);
  const cell = cellOf(ev);
  if (drag.kind === "idle") {
    if (!drag.moved) {
      if (touch) {
        const now = Date.now();
        const near = Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30;
        if (now - lastTap.t < 300 && near) {
          viewport.zoomAt(1.6, p.x, p.y);
          lastTap = { t: 0, x: 0, y: 0 };
          drag.active = false;
          drag.kind = null;
          paint();
          return;
        }
        lastTap = { t: now, x: p.x, y: p.y };
      }
      tapSelect(cell);
    }
  } else if (drag.kind === "marquee") {
    if (activeDraft.value) editor.selectByMarquee(activeDraft.value.bounds);
    activeDraft.value = null;
  } else if (drag.kind === "draw") {
    finishDraw();
  } else if (drag.kind === "place-tap") {
    editor.placeAt(cell);
  } else if (drag.kind === "mark-tap") {
    editor.toggleMarkerAt(cell);
  }
  drag.active = false;
  drag.kind = null;
  paint();
}

function onContextMenu(ev) {
  ev.preventDefault();
  const cell = cellOf(ev);
  const p = localPoint(ev);
  if (editor.carry) {
    editor.cancelCarry();
    paint();
    return;
  }
  if (activeDraft.value || drag.active || editor.mode === EditorMode.PLACE || editor.mode === EditorMode.MARK || editor.mode === EditorMode.MARQUEE || isDrawMode(editor.mode)) {
    activeDraft.value = null;
    drag.active = false;
    drag.kind = null;
    editor.cancelMode();
    paint();
    return;
  }
  const hit = editor.pickUserAt(cell);
  if (hit) {
    editor.openContextMenu(p.x, p.y, hit);
    return;
  }
  if (!editor.cancelMode()) editor.clearSelection();
  paint();
}

function pointerList() {
  return [...pointers.values()];
}
function avgX(list) {
  return list.reduce((n, p) => n + p.x, 0) / list.length;
}
function avgY(list) {
  return list.reduce((n, p) => n + p.y, 0) / list.length;
}
function beginGesture() {
  clearLongPress();
  if (drag.active) {
    drag.active = false;
    drag.kind = null;
  }
  activeDraft.value = null;
  editor.clearHover();
  syncGesture();
}
function syncGesture() {
  const pts = pointerList();
  if (pts.length >= 3) {
    gesture.mode = "tilt3";
    gesture.lastCX = avgX(pts);
    gesture.lastCY = avgY(pts);
  } else if (pts.length === 2) {
    gesture.mode = "pinch2";
    const [a, b] = pts;
    gesture.lastCX = (a.x + b.x) / 2;
    gesture.lastCY = (a.y + b.y) / 2;
    gesture.lastDist = Math.hypot(a.x - b.x, a.y - b.y);
    gesture.lastAngle = Math.atan2(b.y - a.y, b.x - a.x);
  } else {
    gesture.mode = null;
  }
}
function updateGesture() {
  const pts = pointerList();
  if (gesture.mode === "tilt3") {
    if (pts.length < 3) return;
    const cy = avgY(pts);
    viewport.setTilt(viewport.cam.tilt + (gesture.lastCY - cy) * TILT_SENS);
    gesture.lastCY = cy;
    return;
  }
  if (pts.length < 2) return;
  const [a, b] = pts;
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const dist = Math.hypot(a.x - b.x, a.y - b.y);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  viewport.panByScreen(cx - gesture.lastCX, cy - gesture.lastCY);
  if (gesture.lastDist > 0 && dist > 0) viewport.zoomAt(dist / gesture.lastDist, cx, cy);
  let da = angle - gesture.lastAngle;
  if (da > Math.PI) da -= Math.PI * 2;
  else if (da < -Math.PI) da += Math.PI * 2;
  viewport.rotateBy(da);
  gesture.lastCX = cx;
  gesture.lastCY = cy;
  gesture.lastDist = dist;
  gesture.lastAngle = angle;
}

function tapSelect(cell) {
  if (editor.showRewards) editor.setReward(editor.pickRewardAt(cell));
  editor.updateHover(cell);
  const hit = editor.pickAt(cell);
  if (hit && hit.type === "entity" && hit.kind === "user") editor.selectEntity(hit.id);
  else editor.clearSelection();
}

function startLongPress(cell, p) {
  clearLongPress();
  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    if (gesture.mode || pointers.size !== 1 || drag.moved) return;
    const hit = editor.pickUserAt(cell);
    if (hit) {
      editor.openContextMenu(p.x, p.y, hit);
      drag.active = false;
      drag.kind = null;
      paint();
    }
  }, 500);
}
function clearLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function onWheel(ev) {
  ev.preventDefault();
  const p = localPoint(ev);
  viewport.zoomAt(ev.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
}
function onLeave() {
  editor.setCursor(null);
  clearLongPress();
  if (!drag.active && !editor.carry) editor.clearHover();
}
function onDocPointerDown(ev) {
  const wrap = wrapRef.value;
  if (wrap && wrap.contains(ev.target)) return;
  if (ev.target?.closest?.(".toolbar")) return;
  cancelAll();
}
function cancelAll() {
  let changed = false;
  if (editor.contextMenu) {
    editor.closeContextMenu();
    changed = true;
  }
  if (editor.carry) {
    editor.cancelCarry();
    changed = true;
  }
  if (activeDraft.value || drag.active) {
    activeDraft.value = null;
    drag.active = false;
    drag.kind = null;
    changed = true;
  }
  if (editor.mode !== EditorMode.IDLE) {
    editor.cancelMode();
    changed = true;
  }
  if (changed) paint();
}

function isDrawMode(m) {
  return m === EditorMode.DRAW_RECT || m === EditorMode.DRAW_CIRCLE || m === EditorMode.DRAW_LINE || m === EditorMode.PENCIL;
}
function startDraw(cell, world) {
  if (editor.mode === EditorMode.DRAW_RECT) {
    activeDraft.value = { kind: "draw", shape: { type: "rect", bounds: [cell.x, cell.y, cell.x, cell.y] } };
  } else if (editor.mode === EditorMode.DRAW_CIRCLE) {
    activeDraft.value = { kind: "draw", shape: { type: "circle", cx: world.x, cy: world.y, r: 0 } };
  } else if (editor.mode === EditorMode.DRAW_LINE) {
    activeDraft.value = { kind: "draw", shape: { type: "line", x1: world.x, y1: world.y, x2: world.x, y2: world.y } };
  } else if (editor.mode === EditorMode.PENCIL) {
    activeDraft.value = { kind: "draw", shape: { type: "pencil", points: [{ x: world.x, y: world.y }] } };
  }
}
function updateDraw(cell, world) {
  const shape = activeDraft.value?.shape;
  if (!shape) return;
  if (shape.type === "rect") shape.bounds = rectFromPoints(drag.startCell.x, drag.startCell.y, cell.x, cell.y);
  else if (shape.type === "circle") shape.r = Math.hypot(world.x - shape.cx, world.y - shape.cy);
  else if (shape.type === "line") {
    shape.x2 = world.x;
    shape.y2 = world.y;
  } else if (shape.type === "pencil") {
    const last = shape.points[shape.points.length - 1];
    if (!last || Math.hypot(world.x - last.x, world.y - last.y) > 0.5) {
      shape.points.push({ x: world.x, y: world.y });
    }
  }
  activeDraft.value = { ...activeDraft.value };
}
function finishDraw() {
  const shape = activeDraft.value?.shape;
  activeDraft.value = null;
  if (!shape) return;
  if (
    (shape.type === "rect" && shape.bounds[0] === shape.bounds[2] && shape.bounds[1] === shape.bounds[3]) ||
    (shape.type === "circle" && shape.r < 0.5) ||
    (shape.type === "line" && Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1) < 0.5) ||
    (shape.type === "pencil" && shape.points.length < 2)
  ) return;
  editor.addDrawing(shape);
}

let spaceHeld = false;
let spaceMoved = false;
function blockedByUi() {
  if (document.querySelector(".text-edit-mask, .modal-mask, .rt-mask, .vd-mask, .guide-mask")) return true;
  const el = document.activeElement;
  return !!(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable));
}
function enterTempMove() {
  activeDraft.value = null;
  drag.active = false;
  drag.kind = null;
  if (editor.carry) editor.cancelCarry();
  editor.closeContextMenu();
  editor.setMode(EditorMode.MOVE);
  paint();
}
function leaveTempMove() {
  if (editor.carry) editor.cancelCarry();
  if (editor.mode === EditorMode.MOVE) editor.setMode(EditorMode.IDLE);
  paint();
}
function onKeyDown(ev) {
  if (blockedByUi()) return;
  const cmd = ev.ctrlKey || ev.metaKey;
  if (ev.code === "Space" || ev.key === " ") {
    ev.preventDefault();
    if (ev.repeat || spaceHeld) return;
    spaceHeld = true;
    if (editor.mode === EditorMode.MOVE) return;
    enterTempMove();
    spaceMoved = true;
    return;
  }
  if (cmd && (ev.key === "s" || ev.key === "S")) {
    ev.preventDefault();
    editor.saveCache();
    return;
  }
  if (cmd && (ev.key === "d" || ev.key === "D")) {
    ev.preventDefault();
    if (editor.selectionIds.length) editor.deleteSelected();
    return;
  }
  if (ev.key === "Delete" || ev.key === "Backspace") {
    if (editor.selectionIds.length) {
      ev.preventDefault();
      editor.deleteSelected();
    }
    return;
  }
  if (ev.key === "Escape") {
    activeDraft.value = null;
    editor.closeContextMenu();
    editor.cancelMode();
    paint();
  }
}
function onKeyUp(ev) {
  if (ev.code === "Space" || ev.key === " ") {
    if (!spaceHeld) return;
    spaceHeld = false;
    if (spaceMoved) {
      spaceMoved = false;
      leaveTempMove();
    }
  }
}
function onBlur() {
  if (spaceHeld) {
    spaceHeld = false;
    if (spaceMoved) {
      spaceMoved = false;
      leaveTempMove();
    }
  }
}

function onDblClick(ev) {
  if (ev.button !== 0 || editor.mode !== EditorMode.IDLE || editor.carry) return;
  const cell = cellOf(ev);
  const hit = editor.pickUserAt(cell);
  if (!hit || hit.type === "marker") return;
  if (hit.type === "entity" && (hit.key === "mountain" || hit.key === "water")) return;
  editor.closeContextMenu();
  editor.openTextEditByTarget(hit);
}

onMounted(() => {
  renderer = new CanvasRenderer(canvasRef.value);
  renderer.start();
  unsubIcons = onIconLoad(() => renderer && renderer.markDirty());
  resize();
  viewport.reset();
  resizeObs = new ResizeObserver(resize);
  resizeObs.observe(wrapRef.value);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  document.addEventListener("pointerdown", onDocPointerDown);
  paint();
});
onUnmounted(() => {
  if (renderer) renderer.stop();
  if (unsubIcons) unsubIcons();
  if (resizeObs) resizeObs.disconnect();
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
  window.removeEventListener("blur", onBlur);
  document.removeEventListener("pointerdown", onDocPointerDown);
});

watch(
  () => [editor.revision, viewport.cam.x, viewport.cam.y, viewport.cam.scale, viewport.cam.rotation, viewport.cam.tilt, viewport.cam.flipAxes, activeDraft.value],
  paint,
  { deep: false },
);
</script>

<template>
  <div ref="wrapRef" class="stage" :style="{ cursor: cursorStyle }">
    <canvas
      ref="canvasRef"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="onLeave"
      @contextmenu="onContextMenu"
      @dblclick="onDblClick"
      @wheel="onWheel"
    />
    <RewardPanel v-if="editor.showRewards" />
    <button v-if="mobileCancelLabel" class="mobile-cancel" @click="cancelAll">{{ mobileCancelLabel }}</button>
    <div v-if="editor.showInfo && editor.hoverInfo" class="info-overlay">
      <div class="info-head">
        <span class="k">坐标</span>
        <span class="v"> ({{ editor.hoverInfo.x }}, {{ editor.hoverInfo.y }}) </span>
      </div>
      <div v-if="!editor.hoverInfo.inMap" class="info-sub"> 地图范围外 </div>
      <div v-else-if="!editor.hoverInfo.sections.length" class="info-sub"> 空地（无所属内容） </div>
      <div v-for="(sec, i) in editor.hoverInfo.sections" :key="i" class="info-sec">
        <div class="info-title">
          <span v-if="sec.kind" class="kind">{{ sec.kind }}</span>
          {{ sec.title }}
        </div>
        <div v-for="(row, ri) in sec.rows" :key="ri" class="info-row">
          <span class="k">{{ row[0] }}</span>
          <span class="v">{{ row[1] }}</span>
        </div>
      </div>
    </div>
    <div
      v-if="editor.contextMenu"
      ref="contextMenuRef"
      class="context-menu"
      :style="{ left: editor.contextMenu.x + 'px', top: editor.contextMenu.y + 'px' }"
    >
      <button @click="editor.contextCopy()">复制</button>
      <button v-if="canEditText" @click="editor.contextEditText()"> 文字编辑 </button>
      <div v-if="canEditText" class="cm-wrap">
        <span class="cm-wrap-label">自动换行</span>
        <button class="cm-step" @click="editor.adjustWrap(editor.contextMenu.target.id, -1)"> － </button>
        <span class="cm-wrap-val">{{ wrapVal }}</span>
        <button class="cm-step" @click="editor.adjustWrap(editor.contextMenu.target.id, 1)"> ＋ </button>
      </div>
      <button @click="editor.contextDelete()">删除</button>
    </div>
    <div v-if="editor.textEdit" class="text-edit-mask" @click.self="editor.closeTextEdit()">
      <div class="text-edit-box">
        <div class="te-title">文字编辑</div>
        <div class="te-input-wrap">
          <input
            ref="teInputRef"
            v-model="teText"
            class="te-input"
            maxlength="20"
            placeholder="最多输入 20 个字"
            @keydown.enter="applyTe"
          >
          <button type="button" class="te-clear" title="清空内容" :disabled="!teText.length" @click="clearTeText"> 清空 </button>
        </div>
        <div class="te-count">{{ teText.length }} / 20</div>
        <div class="te-style">
          <label class="te-row">
            <span>文字颜色</span>
            <input v-model="teStyle.color" type="color">
          </label>
          <label class="te-row">
            <span>显示文字背景</span>
            <input v-model="teStyle.showBg" type="checkbox">
          </label>
          <label class="te-row">
            <span>文字框背景色</span>
            <input v-model="teStyle.bgColor" type="color">
          </label>
          <div class="te-row" :class="{ dim: teStyle.followZoom }">
            <span>文字大小</span>
            <span class="te-size">
              <button type="button" @click="bumpTeSize(-1)"> － </button>
              <span class="te-size-val">{{ teStyle.size }}</span>
              <button type="button" @click="bumpTeSize(1)"> ＋ </button>
            </span>
          </div>
          <label class="te-row">
            <span>应用缩放（字号跟随缩放）</span>
            <input v-model="teStyle.followZoom" type="checkbox">
          </label>
          <label class="te-row">
            <span>固定样式（不受工具栏样式影响）</span>
            <input v-model="teStyle.fixed" type="checkbox">
          </label>
        </div>
        <div class="te-actions">
          <button @click="editor.closeTextEdit()">取消</button>
          <button class="primary" @click="applyTe"> 确定 </button>
        </div>
      </div>
    </div>
    <Transition name="fade">
      <div v-if="editor.message" class="toast">{{ editor.message }}</div>
    </Transition>
  </div>
</template>

<style scoped src="../styles/scoped/CanvasStage.css"></style>
