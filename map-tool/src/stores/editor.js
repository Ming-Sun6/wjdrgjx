import { defineStore } from "pinia";
import { computed, reactive, ref } from "vue";
import { getCatalogItem } from "../data/catalog.js";
import { MAP, blockingPresets, presetEntities } from "../data/presets.js";
import {
  DEFAULT_MARK_COLOR,
  DEFAULT_WRAP,
  LayerRule,
  defaultTextStyle,
} from "../data/styles.js";
import {
  boundsCenter,
  boundsOverlap,
  boundsSize,
  layoutEntity,
  pointInBounds,
  rectFromPoints,
  unionBounds,
  validateLayout,
} from "../utils/geometry.js";
import { useUserStore } from "./user.js";
import { useViewportStore } from "./viewport.js";

export const EditorMode = {
  IDLE: "idle",
  PLACE: "place",
  MOVE: "move",
  MARQUEE: "marquee",
  DRAW_RECT: "draw-rect",
  DRAW_CIRCLE: "draw-circle",
  DRAW_LINE: "draw-line",
  PENCIL: "pencil",
  MARK: "mark",
};

let idSeq = 1;
const nextId = (prefix) => `${prefix}_${idSeq++}`;

const snowlandBounds = presetEntities.find((e) => e.id === "zone_snowland")?.bounds;
const fertileBounds = presetEntities.find((e) => e.id === "zone_fertile")?.bounds;
const ruinsBounds = presetEntities.find((e) => e.id === "sc_ruins")?.bounds;

const RESTRICTED_SUBTYPES = new Set([
  "ruins",
  "strongholdRuins",
  "fortressRuins",
  "scorched",
  "relic",
  "stronghold",
  "fortress",
  "buildingArea",
  "turret",
  "core",
]);
const restrictedBounds = Object.freeze(
  presetEntities.filter((e) => RESTRICTED_SUBTYPES.has(e.subType)).map((e) => e.bounds),
);

const COUNT_LIMITS = {
  hq_wasteland: 1,
  hq_snowland: 1,
  huntingTrap: 1,
  flag: 285,
  allianceBomb: 3,
  hegemonySilverStatue: 1,
  pioneer: 1,
  militaryTycoon: 1,
  battleHorn: 1,
  weaponMaster: 1,
};
const EXCLUSIVE_SPECIAL = new Set([
  "largeSawmill",
  "largeCoalWasher",
  "largeIronSmelter",
  "largeBreedingFarm",
]);

const DRAW_STROKE = "#50e1b9";
const DRAW_FILL = "#35d0a5";
const CACHE_KEY = "endless-winter-map-cache";

function layerRank(key) {
  return key === "body" || key === "center" ? 3 : key === "effect" || key === "range" ? 2 : key === "adjacency" ? 1 : 0;
}

function hexToRgba(hex, alpha) {
  const raw = (hex || "#000000").replace("#", "");
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function jumpBoundsForPreset(entity) {
  const list = [entity.bounds];
  if (entity.id.startsWith("eng_") && !entity.id.startsWith("eng_scorched_")) {
    const scorched = presetEntities.find((e) => e.id === "eng_scorched_" + entity.id.slice(4));
    if (scorched) list.push(scorched.bounds);
  } else if (/^stronghold_\d+$/.test(entity.id)) {
    const num = entity.id.slice(11);
    const ruins = presetEntities.find((e) => e.id === "stronghold_ruins_" + num);
    if (ruins) list.push(ruins.bounds);
  } else if (/^fortress_\d+$/.test(entity.id)) {
    const num = entity.id.slice(9);
    const ruins = presetEntities.find((e) => e.id === "fortress_ruins_" + num);
    if (ruins) list.push(ruins.bounds);
  }
  return unionBounds(list);
}

function normalizeTextStyle(style) {
  const base = defaultTextStyle;
  const raw = style && typeof style === "object" ? style : {};
  const isHex = (v) => typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v);
  return {
    color: isHex(raw.color) ? raw.color : base.color,
    bgColor: isHex(raw.bgColor) ? raw.bgColor : base.bgColor,
    showBg: typeof raw.showBg === "boolean" ? raw.showBg : base.showBg,
    size: Number.isFinite(raw.size) ? Math.min(96, Math.max(6, Math.round(raw.size))) : base.size,
    followZoom: typeof raw.followZoom === "boolean" ? raw.followZoom : base.followZoom,
    fixed: !!raw.fixed,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
  };
}

function normalizeWrap(value) {
  if (Number.isFinite(value)) return Math.max(0, Math.round(value));
}

export const useEditorStore = defineStore("editor", () => {
  const mode = ref(EditorMode.IDLE);
  const activeEntityKey = ref(null);
  const userEntities = reactive([]);
  const drawings = reactive([]);
  const markers = reactive([]);
  const selectionIds = reactive([]);
  const visibility = reactive({
    grid: true,
    zones: true,
    sunCity: true,
    strongholds: true,
    fortresses: true,
    engineering: true,
    userEntities: true,
    drawings: true,
    labels: true,
    icons: true,
    adjacencyRange: true,
    effectRange: true,
  });
  const rangeRestriction = ref(false);
  const labelAlphas = [1, 0.8, 0.5, 0];
  const labelAlpha = ref(1);
  const showInfo = ref(
    !(typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 768px)").matches),
  );
  const showRewards = ref(true);
  const reward = ref(null);
  const hover = ref(null);
  const cursor = ref(null);
  const coordMode = ref("cell");
  const preview = ref(null);
  const carry = ref(null);
  const contextMenu = ref(null);
  const markColorKey = ref(DEFAULT_MARK_COLOR);
  const textEdit = ref(null);
  const textStyle = reactive({ ...defaultTextStyle, updatedAt: 0 });
  const message = ref("");
  const revision = ref(0);
  const cacheSavedAt = ref("");
  const drawStyle = reactive({ stroke: DRAW_STROKE, fill: DRAW_FILL });

  let flashTimer = 0;

  function flash(text) {
    message.value = text;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      message.value = "";
    }, 1800);
  }

  function bump() {
    revision.value++;
  }

  function setDrawStroke(value) {
    drawStyle.stroke = value;
    bump();
  }

  function setDrawFill(value) {
    drawStyle.fill = value;
    bump();
  }

  function resetDrawStyle() {
    drawStyle.stroke = DRAW_STROKE;
    drawStyle.fill = DRAW_FILL;
    bump();
  }

  const drawStyleResolved = computed(() => ({
    stroke: hexToRgba(drawStyle.stroke, 1),
    fill: hexToRgba(drawStyle.fill, 0.3),
  }));

  function setVisibility(key, value) {
    if (key in visibility) {
      visibility[key] = value;
      bump();
    }
  }

  function toggleInfo() {
    showInfo.value = !showInfo.value;
    bump();
  }

  function cycleLabelMode() {
    const idx = labelAlphas.indexOf(labelAlpha.value);
    const next = labelAlphas[(idx + 1) % labelAlphas.length];
    labelAlpha.value = next;
    visibility.labels = next > 0;
    bump();
  }

  function toggleRewards() {
    showRewards.value = !showRewards.value;
    if (!showRewards.value) reward.value = null;
    bump();
  }

  function pickRewardAt(cell) {
    if (!cell) return null;
    for (let i = presetEntities.length - 1; i >= 0; i--) {
      const entity = presetEntities[i];
      if (!entity.blocking || !visibility[entity.group]) continue;
      if (!pointInBounds(cell.x, cell.y, entity.bounds)) continue;
      if (entity.id === "sc_core") return { kind: "kingcity", title: entity.title };
      if (/^fortress_\d+$/.test(entity.id)) return { kind: "fortress", title: entity.title, num: Number(entity.id.slice(9)) };
      if (/^stronghold_\d+$/.test(entity.id)) return { kind: "stronghold", title: entity.title, num: Number(entity.id.slice(11)) };
      if (entity.id.startsWith("eng_") && !entity.id.startsWith("eng_scorched_")) {
        return { kind: "engineering", engType: entity.subType, engLevel: entity.level, title: entity.title };
      }
    }
    return null;
  }

  function setReward(value) {
    reward.value = value;
    bump();
  }

  function clearReward() {
    reward.value = null;
    bump();
  }

  function enterPlaceMode(key) {
    if (!getCatalogItem(key)) return;
    mode.value = EditorMode.PLACE;
    activeEntityKey.value = key;
    preview.value = null;
    hover.value = null;
    bump();
  }

  function setMode(next) {
    mode.value = next;
    activeEntityKey.value = null;
    preview.value = null;
    bump();
  }

  function cancelMode() {
    if (carry.value) {
      carry.value = null;
      bump();
      return true;
    }
    if (mode.value === EditorMode.IDLE) return false;
    mode.value = EditorMode.IDLE;
    activeEntityKey.value = null;
    preview.value = null;
    bump();
    return true;
  }

  function solidBlockers(excludeId = null) {
    const list = [];
    for (const preset of blockingPresets) list.push(preset.bounds);
    for (const entity of userEntities) {
      if (entity.id === excludeId) continue;
      for (const layer of entity.layers) {
        if (layer.rule === LayerRule.SOLID) list.push(layer.bounds);
      }
    }
    return list;
  }

  function toggleRangeRestriction() {
    rangeRestriction.value = !rangeRestriction.value;
    bump();
  }

  function overlapsRestricted(bounds) {
    for (const b of restrictedBounds) {
      if (boundsOverlap(bounds, b)) return true;
    }
    return false;
  }

  function territoryLayerBounds(keys, excludeId = null) {
    const list = [];
    for (const entity of userEntities) {
      if (entity.id === excludeId) continue;
      if (entity.key !== "hq_wasteland" && entity.key !== "hq_snowland" && entity.key !== "flag") continue;
      for (const layer of entity.layers) {
        if (keys.includes(layer.key)) list.push(layer.bounds);
      }
    }
    return list;
  }

  function zoneRuleReason(key, bodyBounds, excludeId = null) {
    if (key === "hq_wasteland") {
      if (snowlandBounds && boundsOverlap(bodyBounds, snowlandBounds)) {
        return "荒原总部只能放在荒原范围（不可进入雪原/沃土）";
      }
    } else if (key === "hq_snowland") {
      if ((snowlandBounds && !validateContains(snowlandBounds, bodyBounds)) || (fertileBounds && boundsOverlap(bodyBounds, fertileBounds))) {
        return "雪原总部只能放在雪原范围（不可进入荒原/沃土）";
      }
    } else if (key === "flag") {
      if (!territoryLayerBounds(["effect", "adjacency"], excludeId).some((b) => boundsOverlap(bodyBounds, b))) {
        return "联盟旗帜只能放在总部或旗帜的作用/接壤范围内";
      }
    } else if (key === "huntingTrap") {
      if (!territoryLayerBounds(["effect"], excludeId).some((b) => boundsOverlap(bodyBounds, b))) {
        return "狩猎陷阱只能放在总部或旗帜的作用范围内";
      }
    }
    return null;
  }

  function validateContains(outer, inner) {
    return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];
  }

  function countLimitReason(def, excludeId = null, isNew = true) {
    const key = def.key;
    if (key !== "flag" && COUNT_LIMITS[key] != null) {
      if (userEntities.filter((e) => e.key === key && e.id !== excludeId).length + (isNew ? 1 : 0) > COUNT_LIMITS[key]) {
        return `${def.title}最多只能放置 ${COUNT_LIMITS[key]} 个`;
      }
    }
    if (EXCLUSIVE_SPECIAL.has(key)) {
      if (userEntities.filter((e) => EXCLUSIVE_SPECIAL.has(e.key) && e.id !== excludeId).length + (isNew ? 1 : 0) > 1) {
        return "特殊建筑（大型锯木厂/洗煤厂/冶铁厂/养殖场）同时只能存在一个";
      }
    }
    return null;
  }

  function checkRestrictions(def, bodyBounds, { excludeId = null, isNew = true } = {}) {
    if (!rangeRestriction.value) return { ok: true, reason: "" };
    if (overlapsRestricted(bodyBounds)) {
      return { ok: false, reason: "该区域为禁区（废墟/焦土/遗迹/要塞/堡垒/太阳城），禁止放置" };
    }
    const zoneReason = zoneRuleReason(def.key, bodyBounds, excludeId);
    if (zoneReason) return { ok: false, reason: zoneReason };
    const countReason = countLimitReason(def, excludeId, isNew);
    if (countReason) return { ok: false, reason: countReason };
    return { ok: true, reason: "" };
  }

  const violationIds = computed(() => {
    const ids = new Set();
    if (!rangeRestriction.value) return ids;
    for (const entity of userEntities) {
      if (overlapsRestricted(entity.bodyBounds)) {
        ids.add(entity.id);
        continue;
      }
      if (zoneRuleReason(entity.key, entity.bodyBounds, entity.id)) ids.add(entity.id);
    }
    const counts = {};
    let exclusive = 0;
    for (const entity of userEntities) {
      if (COUNT_LIMITS[entity.key] != null) {
        counts[entity.key] = (counts[entity.key] || 0) + 1;
        if (counts[entity.key] > COUNT_LIMITS[entity.key]) ids.add(entity.id);
      }
      if (EXCLUSIVE_SPECIAL.has(entity.key)) {
        exclusive++;
        if (exclusive > 1) ids.add(entity.id);
      }
    }
    return ids;
  });

  function updatePlacementPreview(cell) {
    if (mode.value !== EditorMode.PLACE || !activeEntityKey.value || !cell) {
      preview.value = null;
      return;
    }
    const def = getCatalogItem(activeEntityKey.value);
    const layout = layoutEntity(def, cell.x, cell.y);
    const geom = validateLayout(layout, solidBlockers());
    const restrict = checkRestrictions(def, layout.bodyBounds, { isNew: true });
    preview.value = {
      layers: layout.layers,
      valid: geom.valid && restrict.ok,
      reason: geom.valid ? restrict.reason : geom.reason,
    };
    bump();
  }

  function placeAt(cell) {
    if (mode.value !== EditorMode.PLACE || !activeEntityKey.value || !cell) return;
    const def = getCatalogItem(activeEntityKey.value);
    const layout = layoutEntity(def, cell.x, cell.y);
    const geom = validateLayout(layout, solidBlockers());
    if (!geom.valid) {
      flash(`无法放置：${geom.reason}`);
      return;
    }
    const restrict = checkRestrictions(def, layout.bodyBounds, { isNew: true });
    if (!restrict.ok) {
      flash(`无法放置：${restrict.reason}`);
      return;
    }
    if (def.maxCount && userEntities.filter((e) => e.key === def.key).length >= def.maxCount) {
      flash(`${def.title}已达数量上限（${def.maxCount}）`);
      return;
    }
    userEntities.push({
      id: nextId("u"),
      key: def.key,
      title: def.title,
      category: def.category,
      groupStyleKey: def.groupStyleKey,
      anchor: [cell.x, cell.y],
      layers: layout.layers,
      bodyBounds: layout.bodyBounds,
      text: def.shortLabel || "",
      iconScale: def.canvasIconScale,
    });
    bump();
  }

  function toggleMarkMode() {
    if (mode.value === EditorMode.MARK) cancelMode();
    else setMode(EditorMode.MARK);
  }

  function setMarkColor(key) {
    markColorKey.value = key;
    if (mode.value !== EditorMode.MARK) mode.value = EditorMode.MARK;
    bump();
  }

  function toggleMarkerAt(cell) {
    if (!cell) return;
    const idx = markers.findIndex((m) => m.cx === cell.x && m.cy === cell.y);
    if (idx >= 0) markers.splice(idx, 1);
    else markers.push({ id: nextId("m"), cx: cell.x, cy: cell.y, colorKey: markColorKey.value });
    bump();
  }

  function pickAt(cell) {
    if (!cell) return null;
    for (let i = userEntities.length - 1; i >= 0; i--) {
      const entity = userEntities[i];
      if (pointInBounds(cell.x, cell.y, entity.bodyBounds)) {
        return { type: "entity", kind: "user", id: entity.id, bounds: entity.bodyBounds, ref: entity };
      }
    }
    for (let i = presetEntities.length - 1; i >= 0; i--) {
      const entity = presetEntities[i];
      if (visibility[entity.group] && entity.blocking && pointInBounds(cell.x, cell.y, entity.bounds)) {
        return { type: "entity", kind: "preset", id: entity.id, bounds: entity.bounds, ref: entity };
      }
    }
    for (let i = presetEntities.length - 1; i >= 0; i--) {
      const entity = presetEntities[i];
      if (visibility[entity.group] && !entity.blocking && pointInBounds(cell.x, cell.y, entity.bounds)) {
        return { type: "entity", kind: "preset", id: entity.id, bounds: entity.bounds, ref: entity };
      }
    }
    return { type: "cell", cell };
  }

  function updateHover(cell) {
    if (mode.value === EditorMode.PLACE) {
      updatePlacementPreview(cell);
      return;
    }
    hover.value = pickAt(cell);
    bump();
  }

  function clearHover() {
    hover.value = null;
    preview.value = null;
    cursor.value = null;
    bump();
  }

  function setCursor(cell, world) {
    if (!cell) {
      cursor.value = null;
      return;
    }
    cursor.value = {
      cx: cell.x,
      cy: cell.y,
      wx: world ? world.x : cell.x,
      wy: world ? world.y : cell.y,
    };
  }

  function setCoordMode(value) {
    coordMode.value = value;
  }

  function toggleCoordMode() {
    coordMode.value = coordMode.value === "cell" ? "precise" : "cell";
  }

  const hoverInfo = computed(() => {
    const c = cursor.value;
    if (!c) return null;
    const x = c.cx;
    const y = c.cy;
    const inMap = pointInBounds(x, y, MAP.bounds);
    const sections = [];
    const skipZones = new Set();
    if (snowlandBounds && pointInBounds(x, y, snowlandBounds)) skipZones.add("wasteland");
    if (fertileBounds && pointInBounds(x, y, fertileBounds)) skipZones.add("snowland");
    if (ruinsBounds && pointInBounds(x, y, ruinsBounds)) skipZones.add("fertileLand");
    for (const entity of presetEntities) {
      if (!visibility[entity.group] || !pointInBounds(x, y, entity.bounds)) continue;
      if (entity.group === "zones" && skipZones.has(entity.subType)) continue;
      const size = boundsSize(entity.bounds);
      const rows = [
        ["范围", `(${entity.bounds[0]}, ${entity.bounds[1]}) - (${entity.bounds[2]}, ${entity.bounds[3]})`],
        ["尺寸", `${size.width} × ${size.height}`],
      ];
      if (entity.meta) {
        for (const [k, v] of Object.entries(entity.meta)) rows.push([k, String(v)]);
      }
      sections.push({
        kind: "",
        title: entity.title,
        rows,
        layerLabel: "",
        rank: entity.blocking ? 3 : 0,
      });
    }
    if (visibility.userEntities) {
      for (const entity of userEntities) {
        const layer = entity.layers.find((l) => pointInBounds(x, y, l.bounds));
        if (!layer) continue;
        sections.push({
          kind: "放置",
          title: entity.title,
          rows: [
            ["锚点", `(${entity.anchor[0]}, ${entity.anchor[1]})`],
            ["所在图层", layer.title],
          ],
          layerLabel: layer.title,
          rank: 10 + layerRank(layer.key),
        });
      }
    }
    if (visibility.drawings) {
      const titles = { rect: "矩形", circle: "圆形", line: "直线", pencil: "铅笔" };
      for (const drawing of drawings) {
        if (pointInBounds(x, y, drawingBounds(drawing))) {
          sections.push({ kind: "绘制", title: titles[drawing.type] || drawing.type, rows: [], layerLabel: "", rank: 10 });
        }
      }
    }
    sections.sort((a, b) => b.rank - a.rank);
    const simple = sections.length > 8;
    return {
      x,
      y,
      inMap,
      sections: sections.map((s) => ({
        kind: s.kind,
        title: simple && s.layerLabel ? `${s.title}·${s.layerLabel}` : s.title,
        rows: simple ? [] : s.rows,
      })),
      simple,
    };
  });

  function setSelection(ids) {
    selectionIds.splice(0, selectionIds.length, ...ids);
    bump();
  }

  function clearSelection() {
    if (selectionIds.length) {
      selectionIds.splice(0, selectionIds.length);
      bump();
    }
  }

  function selectEntity(id) {
    setSelection([id]);
  }

  function selectByMarquee(bounds) {
    const ids = [];
    for (const entity of userEntities) {
      if (boundsOverlap(entity.bodyBounds, bounds)) ids.push(entity.id);
    }
    for (const drawing of drawings) {
      if (boundsOverlap(drawingBounds(drawing), bounds)) ids.push(drawing.id);
    }
    for (const marker of markers) {
      if (boundsOverlap(markerBounds(marker), bounds)) ids.push(marker.id);
    }
    setSelection(ids);
  }

  function addDrawing(shape) {
    drawings.push({
      id: nextId("d"),
      ...shape,
      stroke: hexToRgba(drawStyle.stroke, 1),
      fill: hexToRgba(drawStyle.fill, 0.3),
      text: "",
    });
    bump();
  }

  function drawingBounds(drawing) {
    if (drawing.type === "rect") return drawing.bounds;
    if (drawing.type === "circle") return [drawing.cx - drawing.r, drawing.cy - drawing.r, drawing.cx + drawing.r, drawing.cy + drawing.r];
    if (drawing.type === "line") return rectFromPoints(drawing.x1, drawing.y1, drawing.x2, drawing.y2);
    if (drawing.type === "pencil") {
      const xs = drawing.points.map((p) => p.x);
      const ys = drawing.points.map((p) => p.y);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    return [0, 0, 0, 0];
  }

  function markerBounds(marker) {
    return [marker.cx, marker.cy, marker.cx, marker.cy];
  }

  function deleteById(id) {
    let idx = userEntities.findIndex((e) => e.id === id);
    if (idx >= 0) {
      userEntities.splice(idx, 1);
      bump();
      return;
    }
    idx = drawings.findIndex((d) => d.id === id);
    if (idx >= 0) {
      drawings.splice(idx, 1);
      bump();
      return;
    }
    idx = markers.findIndex((m) => m.id === id);
    if (idx >= 0) {
      markers.splice(idx, 1);
      bump();
    }
  }

  function deleteSelected() {
    if (!selectionIds.length) return;
    const ids = new Set(selectionIds);
    for (let i = userEntities.length - 1; i >= 0; i--) {
      if (ids.has(userEntities[i].id)) userEntities.splice(i, 1);
    }
    for (let i = drawings.length - 1; i >= 0; i--) {
      if (ids.has(drawings[i].id)) drawings.splice(i, 1);
    }
    for (let i = markers.length - 1; i >= 0; i--) {
      if (ids.has(markers[i].id)) markers.splice(i, 1);
    }
    clearSelection();
    bump();
  }

  function clearUserContent() {
    userEntities.splice(0, userEntities.length);
    drawings.splice(0, drawings.length);
    markers.splice(0, markers.length);
    clearSelection();
    bump();
  }

  function pickUserAt(cell) {
    if (!cell) return null;
    for (let i = markers.length - 1; i >= 0; i--) {
      const marker = markers[i];
      if (cell.x === marker.cx && cell.y === marker.cy) return { type: "marker", id: marker.id };
    }
    for (let i = userEntities.length - 1; i >= 0; i--) {
      const entity = userEntities[i];
      if (pointInBounds(cell.x, cell.y, entity.bodyBounds)) {
        return { type: "entity", id: entity.id, key: entity.key };
      }
    }
    for (let i = drawings.length - 1; i >= 0; i--) {
      const drawing = drawings[i];
      if (pointInBounds(cell.x, cell.y, drawingBounds(drawing))) {
        return { type: "drawing", id: drawing.id };
      }
    }
    return null;
  }

  function openContextMenu(x, y, target) {
    contextMenu.value = { x, y, target };
  }

  function closeContextMenu() {
    contextMenu.value = null;
  }

  function contextCopy() {
    const menu = contextMenu.value;
    if (!menu) return;
    closeContextMenu();
    if (menu.target.type === "entity") enterPlaceMode(menu.target.key);
    else if (menu.target.type === "marker") beginCarryCopyMarker(menu.target.id);
    else beginCarryCopyDrawing(menu.target.id);
  }

  function contextDelete() {
    const menu = contextMenu.value;
    if (!menu) return;
    deleteById(menu.target.id);
    closeContextMenu();
  }

  function setEntityText(id, text) {
    const entity = userEntities.find((e) => e.id === id);
    if (entity) {
      entity.text = String(text || "").slice(0, 20);
      bump();
    }
  }

  function setDrawingText(id, text) {
    const drawing = drawings.find((d) => d.id === id);
    if (drawing) {
      drawing.text = String(text || "").slice(0, 20);
      bump();
    }
  }

  function defaultWrap(isDrawing) {
    return isDrawing ? 0 : DEFAULT_WRAP;
  }

  function wrapValue(id) {
    const entity = userEntities.find((e) => e.id === id);
    if (entity) return entity.wrap ?? defaultWrap(false);
    const drawing = drawings.find((d) => d.id === id);
    return drawing ? drawing.wrap ?? defaultWrap(true) : 0;
  }

  function adjustWrap(id, delta) {
    const entity = userEntities.find((e) => e.id === id);
    if (entity) {
      entity.wrap = Math.max(0, (entity.wrap ?? defaultWrap(false)) + delta);
      bump();
      return;
    }
    const drawing = drawings.find((d) => d.id === id);
    if (drawing) {
      drawing.wrap = Math.max(0, (drawing.wrap ?? defaultWrap(true)) + delta);
      bump();
    }
  }

  function resolveItemTextStyle(item) {
    const style = item && item.style;
    if (style && style.fixed) return { ...defaultTextStyle, ...style };
    if (style && (style.updatedAt || 0) > (textStyle.updatedAt || 0)) return { ...defaultTextStyle, ...style };
    return { ...defaultTextStyle, ...textStyle };
  }

  function firstTextTarget() {
    if (!selectionIds.length) return null;
    const ids = new Set(selectionIds);
    for (const entity of userEntities) {
      if (ids.has(entity.id) && entity.category !== "obstacle") return entity;
    }
    for (const drawing of drawings) {
      if (ids.has(drawing.id)) return drawing;
    }
    return null;
  }

  const hasTextSelection = computed(() => !!firstTextTarget());
  const currentTextStyle = computed(() => {
    const target = firstTextTarget();
    return target ? resolveItemTextStyle(target) : { ...defaultTextStyle, ...textStyle };
  });

  function applyTextStyle(partial) {
    const now = Date.now();
    if (selectionIds.length) {
      const ids = new Set(selectionIds);
      let changed = false;
      const apply = (item) => {
        item.style = {
          ...defaultTextStyle,
          ...(item.style || {}),
          ...partial,
          fixed: item.style?.fixed || false,
          updatedAt: now,
        };
        changed = true;
      };
      for (const entity of userEntities) {
        if (ids.has(entity.id) && entity.category !== "obstacle") apply(entity);
      }
      for (const drawing of drawings) {
        if (ids.has(drawing.id)) apply(drawing);
      }
      if (changed) bump();
    } else {
      Object.assign(textStyle, partial, { updatedAt: now });
      bump();
    }
  }

  function openTextEditByTarget(target) {
    if (!target || (target.type !== "entity" && target.type !== "drawing")) return;
    const item = target.type === "entity"
      ? userEntities.find((e) => e.id === target.id)
      : drawings.find((d) => d.id === target.id);
    if (!item) return;
    const style = resolveItemTextStyle(item);
    textEdit.value = {
      type: target.type,
      id: target.id,
      value: item.text || "",
      style: { ...style, fixed: item.style?.fixed || false },
    };
  }

  function contextEditText() {
    const menu = contextMenu.value;
    if (!menu) return;
    openTextEditByTarget(menu.target);
    closeContextMenu();
  }

  function applyTextEdit(payload) {
    const edit = textEdit.value;
    if (!edit) return;
    const text = typeof payload === "string" ? payload : payload?.text;
    const style = typeof payload === "object" ? payload?.style : null;
    const item = edit.type === "entity"
      ? userEntities.find((e) => e.id === edit.id)
      : drawings.find((d) => d.id === edit.id);
    if (item) {
      item.text = String(text || "").slice(0, 20);
      if (style) {
        item.style = {
          ...defaultTextStyle,
          color: style.color,
          bgColor: style.bgColor,
          showBg: style.showBg,
          size: style.size,
          followZoom: style.followZoom,
          fixed: !!style.fixed,
          updatedAt: Date.now(),
        };
      }
      bump();
    }
    textEdit.value = null;
  }

  function closeTextEdit() {
    textEdit.value = null;
  }

  function translateDrawing(shape, dx, dy) {
    if (shape.type === "rect") {
      const ox = Math.round(dx);
      const oy = Math.round(dy);
      const b = shape.bounds;
      return { ...shape, bounds: [b[0] + ox, b[1] + oy, b[2] + ox, b[3] + oy] };
    }
    if (shape.type === "circle") return { ...shape, cx: shape.cx + dx, cy: shape.cy + dy };
    if (shape.type === "line") return { ...shape, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy };
    if (shape.type === "pencil") return { ...shape, points: shape.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    return { ...shape };
  }

  function beginCarryMoveEntity(id) {
    const entity = userEntities.find((e) => e.id === id);
    if (!entity) return;
    carry.value = { action: "move", target: "entity", id, key: entity.key, preview: null };
    bump();
  }

  function beginCarryMoveDrawing(id) {
    const drawing = drawings.find((d) => d.id === id);
    if (!drawing) return;
    const { id: _id, ...shape } = drawing;
    carry.value = { action: "move", target: "drawing", id, shape, ghostShape: null };
    bump();
  }

  function beginCarryCopyDrawing(id) {
    const drawing = drawings.find((d) => d.id === id);
    if (!drawing) return;
    const { id: _id, ...shape } = drawing;
    carry.value = { action: "copy", target: "drawing", shape, ghostShape: null };
    bump();
  }

  function beginCarryMoveMarker(id) {
    const marker = markers.find((m) => m.id === id);
    if (!marker) return;
    carry.value = {
      action: "move",
      target: "marker",
      id,
      colorKey: marker.colorKey,
      previewCell: { x: marker.cx, y: marker.cy },
    };
    bump();
  }

  function beginCarryCopyMarker(id) {
    const marker = markers.find((m) => m.id === id);
    if (!marker) return;
    carry.value = {
      action: "copy",
      target: "marker",
      colorKey: marker.colorKey,
      previewCell: { x: marker.cx, y: marker.cy },
    };
    bump();
  }

  function pickUpForMove(cell) {
    const hit = pickUserAt(cell);
    if (!hit) return false;
    if (hit.type === "entity") beginCarryMoveEntity(hit.id);
    else if (hit.type === "marker") beginCarryMoveMarker(hit.id);
    else beginCarryMoveDrawing(hit.id);
    return true;
  }

  function updateCarry(cell, world) {
    const c = carry.value;
    if (!c) return;
    if (c.target === "entity") {
      const def = getCatalogItem(c.key);
      const layout = layoutEntity(def, cell.x, cell.y);
      const geomOk = validateLayout(layout, solidBlockers(c.id)).valid;
      const restrict = checkRestrictions(def, layout.bodyBounds, { excludeId: c.id, isNew: false });
      c.preview = { layers: layout.layers, valid: geomOk && restrict.ok };
    } else if (c.target === "marker") {
      c.previewCell = { x: cell.x, y: cell.y };
    } else {
      const center = boundsCenter(drawingBounds(c.shape));
      c.ghostShape = translateDrawing(c.shape, world.x - center[0], world.y - center[1]);
    }
    bump();
  }

  function dropCarry(cell, world) {
    const c = carry.value;
    if (!c) return;
    if (c.target === "entity") {
      const def = getCatalogItem(c.key);
      const layout = layoutEntity(def, cell.x, cell.y);
      const geom = validateLayout(layout, solidBlockers(c.id));
      if (!geom.valid) {
        flash(`无法移动：${geom.reason}`);
        return;
      }
      const restrict = checkRestrictions(def, layout.bodyBounds, { excludeId: c.id, isNew: false });
      if (!restrict.ok) {
        flash(`无法移动：${restrict.reason}`);
        return;
      }
      const entity = userEntities.find((e) => e.id === c.id);
      if (entity) {
        entity.anchor = [cell.x, cell.y];
        entity.layers = layout.layers;
        entity.bodyBounds = layout.bodyBounds;
      }
      carry.value = null;
      bump();
      return;
    }
    if (c.target === "marker") {
      if (c.action === "move") {
        const marker = markers.find((m) => m.id === c.id);
        if (marker) {
          marker.cx = cell.x;
          marker.cy = cell.y;
        }
      } else {
        markers.push({ id: nextId("m"), cx: cell.x, cy: cell.y, colorKey: c.colorKey });
      }
      carry.value = null;
      bump();
      return;
    }
    const center = boundsCenter(drawingBounds(c.shape));
    const moved = translateDrawing(c.shape, world.x - center[0], world.y - center[1]);
    if (c.action === "move") {
      const idx = drawings.findIndex((d) => d.id === c.id);
      if (idx >= 0) drawings.splice(idx, 1, { ...moved, id: c.id });
    } else {
      drawings.push({ id: nextId("d"), ...moved });
    }
    carry.value = null;
    bump();
  }

  function cancelCarry() {
    if (!carry.value) return false;
    carry.value = null;
    bump();
    return true;
  }

  function importJSON(raw) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      flash("JSON 解析失败");
      return false;
    }
    if (
      !(
        data &&
        typeof data === "object" &&
        data.map &&
        data.map.width === MAP.width &&
        data.map.height === MAP.height &&
        Array.isArray(data.userEntities) &&
        Array.isArray(data.drawings)
      )
    ) {
      flash("当前 JSON 不是该地图的 JSON");
      return false;
    }
    userEntities.splice(0, userEntities.length);
    drawings.splice(0, drawings.length);
    markers.splice(0, markers.length);
    clearSelection();
    for (const item of data.userEntities) {
      const def = getCatalogItem(item.key);
      if (!def || !Array.isArray(item.anchor)) continue;
      const layout = layoutEntity(def, item.anchor[0], item.anchor[1]);
      userEntities.push({
        id: nextId("u"),
        key: def.key,
        title: def.title,
        category: def.category,
        groupStyleKey: def.groupStyleKey,
        anchor: [item.anchor[0], item.anchor[1]],
        layers: layout.layers,
        bodyBounds: layout.bodyBounds,
        text: typeof item.text === "string" ? item.text : def.shortLabel || "",
        style: item.style ? normalizeTextStyle(item.style) : undefined,
        wrap: normalizeWrap(item.wrap),
        iconScale: def.canvasIconScale,
      });
    }
    for (const item of data.drawings) {
      if (!item || !item.type) continue;
      const { id: _id, style, wrap, ...rest } = item;
      drawings.push({
        id: nextId("d"),
        ...rest,
        style: style ? normalizeTextStyle(style) : undefined,
        wrap: normalizeWrap(wrap),
      });
    }
    if (Array.isArray(data.markers)) {
      for (const item of data.markers) {
        if (!item || !Number.isFinite(item.cx) || !Number.isFinite(item.cy)) continue;
        markers.push({
          id: nextId("m"),
          cx: item.cx,
          cy: item.cy,
          colorKey: item.colorKey || DEFAULT_MARK_COLOR,
        });
      }
    }
    Object.assign(textStyle, normalizeTextStyle(data.textStyle));
    if (data.user && data.user.userId) useUserStore().registerCollaborator(data.user);
    bump();
    flash("导入成功");
    return true;
  }

  function jumpToBounds(bounds) {
    useViewportStore().fitBounds(bounds);
  }

  function jumpToUser(id) {
    const entity = userEntities.find((e) => e.id === id);
    if (!entity) return;
    jumpToBounds(unionBounds(entity.layers.map((l) => l.bounds)) || entity.bodyBounds);
    selectEntity(id);
  }

  function jumpToDrawing(id) {
    const drawing = drawings.find((d) => d.id === id);
    if (!drawing) return;
    jumpToBounds(drawingBounds(drawing));
    selectEntity(id);
  }

  function jumpToMarker(id) {
    const marker = markers.find((m) => m.id === id);
    if (!marker) return;
    jumpToBounds(markerBounds(marker));
    selectEntity(id);
  }

  function jumpToPreset(id) {
    const entity = presetEntities.find((e) => e.id === id);
    if (!entity) return;
    jumpToBounds(jumpBoundsForPreset(entity) || entity.bounds);
  }

  const stats = computed(() => {
    const byCategory = {};
    for (const entity of userEntities) byCategory[entity.category] = (byCategory[entity.category] || 0) + 1;
    const byDrawType = {};
    for (const drawing of drawings) byDrawType[drawing.type] = (byDrawType[drawing.type] || 0) + 1;
    return {
      totalPlaced: userEntities.length,
      totalDrawings: drawings.length,
      presetCount: presetEntities.length,
      byCategory,
      byDrawType,
    };
  });

  const selectionBounds = computed(() => {
    if (!selectionIds.length) return [];
    const ids = new Set(selectionIds);
    const list = [];
    for (const entity of userEntities) {
      if (ids.has(entity.id)) list.push(entity.bodyBounds);
    }
    for (const drawing of drawings) {
      if (ids.has(drawing.id)) list.push(drawingBounds(drawing));
    }
    for (const marker of markers) {
      if (ids.has(marker.id)) list.push(markerBounds(marker));
    }
    return list;
  });

  const editBounds = computed(() => {
    const list = [];
    for (const entity of userEntities) {
      list.push(unionBounds(entity.layers.map((l) => l.bounds)) || entity.bodyBounds);
    }
    for (const drawing of drawings) list.push(drawingBounds(drawing));
    for (const marker of markers) list.push(markerBounds(marker));
    return list.length ? unionBounds(list) : null;
  });

  function exportJSON() {
    const user = useUserStore().snapshot();
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      user,
      map: { width: MAP.width, height: MAP.height },
      userEntities: userEntities.map((e) => ({
        key: e.key,
        title: e.title,
        category: e.category,
        anchor: e.anchor,
        bodyBounds: e.bodyBounds,
        text: e.text,
        style: e.style,
        wrap: e.wrap,
      })),
      drawings: drawings.map((d) => ({ ...d })),
      textStyle: { ...textStyle },
      markers: markers.map((m) => ({ cx: m.cx, cy: m.cy, colorKey: m.colorKey })),
    };
    return JSON.stringify(payload, null, 2);
  }

  function refreshCacheMeta() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) {
        cacheSavedAt.value = "";
        return;
      }
      const parsed = JSON.parse(raw);
      cacheSavedAt.value = parsed && parsed.savedAt ? parsed.savedAt : "";
    } catch {
      cacheSavedAt.value = "";
    }
  }

  function saveCache() {
    try {
      const payload = { savedAt: new Date().toISOString(), json: exportJSON() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
      cacheSavedAt.value = payload.savedAt;
      flash("已缓存到本地，刷新后仍可加载");
      return true;
    } catch {
      flash("缓存失败，存储空间可能已满");
      return false;
    }
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) {
        flash("本地暂无缓存");
        return false;
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.json === "string") {
        importJSON(parsed.json);
        return true;
      }
      flash("本地缓存数据已损坏");
      return false;
    } catch {
      flash("加载缓存失败");
      return false;
    }
  }

  refreshCacheMeta();

  return {
    mode,
    activeEntityKey,
    userEntities,
    drawings,
    markers,
    selectionIds,
    visibility,
    rangeRestriction,
    showInfo,
    showRewards,
    reward,
    hover,
    cursor,
    coordMode,
    preview,
    carry,
    contextMenu,
    markColorKey,
    textEdit,
    textStyle,
    message,
    revision,
    cacheSavedAt,
    drawStyle,
    hoverInfo,
    stats,
    selectionBounds,
    editBounds,
    drawStyleResolved,
    violationIds,
    currentTextStyle,
    hasTextSelection,
    bump,
    flash,
    setVisibility,
    toggleRangeRestriction,
    cycleLabelMode,
    labelAlpha,
    toggleInfo,
    toggleRewards,
    pickRewardAt,
    setReward,
    clearReward,
    enterPlaceMode,
    setMode,
    cancelMode,
    updateHover,
    clearHover,
    setCursor,
    setCoordMode,
    toggleCoordMode,
    updatePlacementPreview,
    placeAt,
    toggleMarkMode,
    setMarkColor,
    toggleMarkerAt,
    pickAt,
    pickUserAt,
    openContextMenu,
    closeContextMenu,
    contextCopy,
    contextDelete,
    contextEditText,
    openTextEditByTarget,
    setEntityText,
    setDrawingText,
    applyTextEdit,
    closeTextEdit,
    applyTextStyle,
    adjustWrap,
    wrapValue,
    beginCarryMoveEntity,
    beginCarryMoveDrawing,
    beginCarryCopyDrawing,
    beginCarryMoveMarker,
    beginCarryCopyMarker,
    pickUpForMove,
    updateCarry,
    dropCarry,
    cancelCarry,
    importJSON,
    setSelection,
    clearSelection,
    selectEntity,
    selectByMarquee,
    addDrawing,
    drawingBounds,
    markerBounds,
    setDrawStroke,
    setDrawFill,
    resetDrawStyle,
    deleteById,
    deleteSelected,
    clearUserContent,
    jumpToBounds,
    jumpToUser,
    jumpToDrawing,
    jumpToMarker,
    jumpToPreset,
    saveCache,
    loadCache,
    exportJSON,
  };
});
