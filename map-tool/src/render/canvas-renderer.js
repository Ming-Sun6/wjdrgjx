import {
  DEFAULT_WRAP,
  DRAWING_WRAP_RATIO,
  LayerRule,
  TEXT_ZOOM_FACTOR,
  battleStyles,
  boardStyle,
  catalogStyles,
  defaultTextStyle,
  engineeringStyles,
  markColors,
  overlayStyles,
  overlayUI,
  sunCityStyles,
  zoneStyles,
} from "../data/styles.js";
import { MAP, presetEntities } from "../data/presets.js";
import {
  boundsIntersectView,
  gridLevelForScale,
  tiltFactor,
  viewWorldRect,
  worldToScreen,
} from "../utils/geometry.js";
import { loadImage, presetIcon, unitIcon } from "../utils/icons.js";

const markColorMap = {};
for (const item of markColors) markColorMap[item.key] = item.color;

export function markColor(key) {
  return markColorMap[key] || markColors[0].color;
}

function hexToRgba(hex, alpha) {
  const raw = hex.replace("#", "");
  const r = parseInt(raw.slice(0, 2), 16) || 0;
  const g = parseInt(raw.slice(2, 4), 16) || 0;
  const b = parseInt(raw.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawingWidth(drawing) {
  if (drawing.type === "rect") return drawing.bounds[2] - drawing.bounds[0] + 1;
  if (drawing.type === "circle") return drawing.r * 2;
  if (drawing.type === "line") return Math.abs(drawing.x2 - drawing.x1) || 1;
  if (drawing.type === "pencil" && drawing.points && drawing.points.length) {
    const xs = drawing.points.map((p) => p.x);
    return Math.max(...xs) - Math.min(...xs) || 1;
  }
  return 1;
}

function drawingCenter(drawing) {
  if (drawing.type === "rect") {
    return {
      x: (drawing.bounds[0] + drawing.bounds[2] + 1) / 2,
      y: (drawing.bounds[1] + drawing.bounds[3] + 1) / 2,
    };
  }
  if (drawing.type === "circle") return { x: drawing.cx, y: drawing.cy };
  if (drawing.type === "line") return { x: (drawing.x1 + drawing.x2) / 2, y: (drawing.y1 + drawing.y2) / 2 };
  if (drawing.type === "pencil" && drawing.points && drawing.points.length) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of drawing.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  }
  return { x: 0, y: 0 };
}

function presetIconKey(entity) {
  if (!entity.blocking) return null;
  if (entity.group === "engineering") return `station_${entity.level}`;
  switch (entity.subType) {
    case "buildingArea":
    case "water":
      return null;
    case "turret":
      return entity.id;
    default:
      return entity.subType;
  }
}

function presetStyle(entity) {
  switch (entity.group) {
    case "zones":
      return zoneStyles[entity.subType] || zoneStyles.wasteland;
    case "sunCity":
      return sunCityStyles[entity.subType] || sunCityStyles.ruins;
    case "strongholds":
    case "fortresses":
      return battleStyles[entity.subType] || battleStyles.stronghold;
    case "engineering":
      return entity.subType === "scorched"
        ? engineeringStyles.scorched
        : engineeringStyles.types[entity.subType] || engineeringStyles.scorched;
    default:
      return { fill: "rgba(120,120,120,0.3)", stroke: "rgba(160,160,160,0.6)" };
  }
}

function entityLayerStyle(entity, layer) {
  if (layer.styleKey && overlayStyles[layer.styleKey]) return overlayStyles[layer.styleKey];
  return catalogStyles[entity.groupStyleKey] || catalogStyles.basics;
}

const ENG_LABEL_MIN_SCALE = 7;

export function buildPresetLabels() {
  const labels = [];
  for (const entity of presetEntities) {
    const x = (entity.bounds[0] + entity.bounds[2] + 1) / 2;
    const y = (entity.bounds[1] + entity.bounds[3] + 1) / 2;
    if (entity.group === "zones") {
      labels.push({
        x: entity.bounds[0] + 30,
        y: entity.bounds[1] + 20,
        text: entity.title,
        color: zoneStyles[entity.subType]?.label,
      });
    } else if (entity.id === "sc_core") {
      labels.push({ x, y, text: entity.title, color: sunCityStyles.core.label });
    } else if (entity.subType === "stronghold") {
      labels.push({ x, y, text: entity.title, color: battleStyles.stronghold.label });
    } else if (entity.subType === "fortress") {
      labels.push({ x, y, text: entity.title, color: battleStyles.fortress.label });
    } else if (entity.group === "engineering" && entity.blocking) {
      labels.push({
        x,
        y,
        text: entity.title,
        color: engineeringStyles.types[entity.subType]?.stroke || "#dfe6ef",
        minScale: ENG_LABEL_MIN_SCALE,
      });
    }
  }
  return labels;
}

export class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.scene = null;
    this._dirty = false;
    this._rafId = 0;
    this._loop = this._loop.bind(this);
  }

  start() {
    if (!this._rafId) this._rafId = requestAnimationFrame(this._loop);
  }

  stop() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = 0;
  }

  setScene(scene) {
    this.scene = scene;
    this._dirty = true;
  }

  markDirty() {
    this._dirty = true;
  }

  renderStatic(scene) {
    this.scene = scene;
    this._render();
  }

  _loop() {
    if (this._dirty && this.scene) {
      this._dirty = false;
      try {
        this._render();
      } catch (err) {
        console.error("[CanvasRenderer] 渲染异常：", err);
      }
    }
    this._rafId = requestAnimationFrame(this._loop);
  }

  resize(w, h, dpr) {
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this._dirty = true;
  }

  _applyWorldTransform() {
    const { cam, dpr } = this.scene;
    const cx = cam.viewW / 2;
    const cy = cam.viewH / 2;
    const scale = cam.scale;
    const cos = Math.cos(cam.rotation);
    const sin = Math.sin(cam.rotation);
    const tf = tiltFactor(cam);
    const a = scale * cos;
    const b = tf * scale * sin;
    const c = -scale * sin;
    const d = tf * scale * cos;
    const e = cx - scale * (cos * cam.x - sin * cam.y);
    const f = cy - tf * scale * (sin * cam.x + cos * cam.y);
    if (cam.flipAxes) {
      const ex = cx - scale * (cos * cam.y - sin * cam.x);
      const ey = cy - tf * scale * (sin * cam.y + cos * cam.x);
      this.ctx.setTransform(c * dpr, d * dpr, a * dpr, b * dpr, ex * dpr, ey * dpr);
      return;
    }
    this.ctx.setTransform(a * dpr, b * dpr, c * dpr, d * dpr, e * dpr, f * dpr);
  }

  _render() {
    const ctx = this.ctx;
    const { cam, dpr } = this.scene;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0b0e13";
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);
    this._applyWorldTransform();
    const view = viewWorldRect(cam);
    const lw = 1 / cam.scale;
    this._drawBoard(view, lw);
    this._drawPresets(view, lw);
    if (this.scene.visibility.drawings) this._drawDrawings(view, lw);
    if (this.scene.visibility.userEntities) this._drawUserEntities(view, lw);
    this._drawSelection(lw);
    this._drawHover(lw);
    this._drawPreview(lw);
    this._drawCarry(lw);
    this._drawActiveDraft(lw);
    this._drawCursorCell(lw);
    this._drawMarkerCells(lw);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.scene.showIcons) {
      this._drawWorldSpaceIcons(view, lw);
      this._drawContentIcons();
    }
    if (this.scene.showLabels) {
      const alpha = this.scene.labelAlpha ?? 1;
      const faded = alpha < 1;
      if (faded) {
        ctx.save();
        ctx.globalAlpha = alpha;
      }
      this._drawScreenLabels();
      if (this.scene.visibility.userEntities) this._drawEntityTexts();
      if (this.scene.visibility.drawings) this._drawDrawingTexts();
      if (faded) ctx.restore();
    }
    this._drawMarkerPins();
  }

  _drawBoard(view, lw) {
    const ctx = this.ctx;
    const [x0, y0, x1, y1] = MAP.bounds;
    ctx.fillStyle = boardStyle.boardFill;
    ctx.fillRect(x0, y0, MAP.width, MAP.height);
    const left = Math.max(x0, Math.floor(view.minX));
    const top = Math.max(y0, Math.floor(view.minY));
    const right = Math.min(x1 + 1, Math.ceil(view.maxX));
    const bottom = Math.min(y1 + 1, Math.ceil(view.maxY));
    if (left >= right || top >= bottom) {
      this._drawBoardBorder(lw);
      return;
    }
    const { block } = this.scene.forceFineGrid ? { block: 1 } : gridLevelForScale(this.scene.cam.scale);
    if (this.scene.visibility.grid && block) {
      const gx = Math.ceil(left / block) * block;
      const gy = Math.ceil(top / block) * block;
      ctx.beginPath();
      ctx.lineWidth = lw;
      ctx.strokeStyle = boardStyle.cellStroke;
      if (block === 1) ctx.setLineDash([4 * lw, 3 * lw]);
      for (let x = gx; x <= right; x += block) {
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
      }
      for (let y = gy; y <= bottom; y += block) {
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
      }
      ctx.stroke();
      if (block === 1) ctx.setLineDash([]);
    }
    this._drawBoardBorder(lw);
  }

  _drawBoardBorder(lw) {
    const ctx = this.ctx;
    ctx.lineWidth = 2 * lw;
    ctx.strokeStyle = boardStyle.boardBorder;
    ctx.strokeRect(MAP.bounds[0], MAP.bounds[1], MAP.width, MAP.height);
  }

  _drawPresets(view, lw) {
    const vis = this.scene.visibility;
    for (const entity of this.scene.presetEntities) {
      if (!vis[entity.group] || !boundsIntersectView(entity.bounds, view)) continue;
      this._rect(entity.bounds, presetStyle(entity), lw, { clampFree: false });
    }
  }

  _drawUserEntities(view, lw) {
    const vis = this.scene.visibility;
    const violations = this.scene.violationIds;
    const ctx = this.ctx;
    for (const entity of this.scene.userEntities) {
      const bad = violations && violations.has(entity.id);
      if (bad) {
        ctx.save();
        ctx.globalAlpha = 0.3;
      }
      for (const layer of entity.layers) {
        if (layer.key === "adjacency" && !vis.adjacencyRange) continue;
        if (layer.key === "effect" && !vis.effectRange) continue;
        if (!boundsIntersectView(layer.bounds, view)) continue;
        this._rect(layer.bounds, entityLayerStyle(entity, layer), lw, {
          clampFree: layer.rule === LayerRule.FREE,
        });
      }
      if (entity.category === "obstacle" && boundsIntersectView(entity.bodyBounds, view)) {
        this._drawObstacleGlyph(entity.bodyBounds, entity.key, lw);
      }
      if (bad) {
        ctx.restore();
        if (boundsIntersectView(entity.bodyBounds, view)) {
          this._rect(entity.bodyBounds, overlayUI.violation, lw, { lineWidth: 2 });
        }
      }
    }
  }

  _drawObstacleGlyph(bounds, key, lw) {
    const ctx = this.ctx;
    const [x0, y0, x1, y1] = bounds;
    const left = x0;
    const top = y0;
    const right = x1 + 1;
    const bottom = y1 + 1;
    const w = right - left;
    const h = bottom - top;
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const size = Math.min(w, h);
    ctx.save();
    ctx.strokeStyle = "rgba(255, 235, 235, 0.9)";
    ctx.lineWidth = Math.max(1.2 * lw, size * 0.05);
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(right, bottom);
    ctx.moveTo(right, top);
    ctx.lineTo(left, bottom);
    ctx.stroke();
    const pad = size * 0.26;
    if (key === "water") {
      ctx.strokeStyle = "rgba(150, 210, 255, 0.98)";
      ctx.lineWidth = Math.max(1.2 * lw, size * 0.06);
      const sx = left + pad;
      const ex = right - pad;
      const step = (ex - sx) / 4;
      for (const y of [cy - h * 0.08, cy + h * 0.14]) {
        ctx.beginPath();
        ctx.moveTo(sx, y);
        ctx.quadraticCurveTo(sx + step, y - h * 0.12, sx + 2 * step, y);
        ctx.quadraticCurveTo(sx + 3 * step, y + h * 0.12, ex, y);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = "rgba(240, 245, 255, 0.98)";
      ctx.beginPath();
      ctx.moveTo(left + pad, bottom - pad);
      ctx.lineTo(cx, top + pad);
      ctx.lineTo(right - pad, bottom - pad);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  _drawDrawings() {
    for (const drawing of this.scene.drawings) {
      this._drawShape(drawing, overlayUI.drawing, 1 / this.scene.cam.scale);
    }
  }

  _drawShape(shape, fallback, lw) {
    const ctx = this.ctx;
    ctx.lineWidth = 1.5 * lw;
    ctx.strokeStyle = shape.stroke || fallback.stroke;
    ctx.fillStyle = shape.fill || fallback.fill;
    if (shape.type === "rect") {
      const [x0, y0, x1, y1] = shape.bounds;
      ctx.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
      ctx.strokeRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    } else if (shape.type === "circle") {
      ctx.beginPath();
      ctx.arc(shape.cx, shape.cy, shape.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (shape.type === "line") {
      ctx.beginPath();
      ctx.moveTo(shape.x1, shape.y1);
      ctx.lineTo(shape.x2, shape.y2);
      ctx.stroke();
    } else if (shape.type === "pencil" && shape.points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let i = 1; i < shape.points.length; i++) ctx.lineTo(shape.points[i].x, shape.points[i].y);
      ctx.stroke();
    }
  }

  _drawSelection(lw) {
    if (!this.scene.selectionBounds || !this.scene.selectionBounds.length) return;
    for (const bounds of this.scene.selectionBounds) {
      this._rect(bounds, overlayUI.selected, lw, { dash: [5 * lw, 3 * lw] });
    }
  }

  _drawHover(lw) {
    const hover = this.scene.hover;
    if (hover && hover.type === "entity" && hover.bounds) {
      this._rect(hover.bounds, overlayUI.hoverEntity, lw);
    }
  }

  _drawCursorCell(lw) {
    const cell = this.scene.cursorCell;
    if (!cell) return;
    const { block } = this.scene.forceFineGrid ? { block: 1 } : gridLevelForScale(this.scene.cam.scale);
    const size = block || 1;
    const x = Math.floor(cell.x / size) * size;
    const y = Math.floor(cell.y / size) * size;
    this._rect([x, y, x + size - 1, y + size - 1], overlayUI.hoverCell, lw, { lineWidth: 1.5 });
  }

  _drawCarry(lw) {
    const carry = this.scene.carry;
    if (!carry) return;
    if (carry.target === "entity" && carry.preview) {
      const style = carry.preview.valid ? overlayUI.placeValid : overlayUI.placeInvalid;
      for (const layer of carry.preview.layers) {
        let paint = style;
        if (layer.rule === LayerRule.FREE && layer.styleKey && overlayStyles[layer.styleKey]) {
          paint = overlayStyles[layer.styleKey];
        }
        this._rect(layer.bounds, paint, lw, { clampFree: layer.rule === LayerRule.FREE });
      }
    } else if (carry.target === "drawing" && carry.ghostShape) {
      this._drawShape(carry.ghostShape, overlayUI.drawing, lw);
    } else if (carry.target === "marker" && carry.previewCell) {
      const ctx = this.ctx;
      const cell = carry.previewCell;
      ctx.save();
      ctx.lineWidth = 2 * lw;
      ctx.strokeStyle = markColor(carry.colorKey);
      ctx.setLineDash([4 * lw, 3 * lw]);
      ctx.strokeRect(cell.x, cell.y, 1, 1);
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  _drawPreview(lw) {
    const preview = this.scene.preview;
    if (!preview) return;
    const style = preview.valid ? overlayUI.placeValid : overlayUI.placeInvalid;
    for (const layer of preview.layers) {
      let paint = style;
      if (layer.rule === LayerRule.FREE && layer.styleKey && overlayStyles[layer.styleKey]) {
        paint = overlayStyles[layer.styleKey];
      }
      this._rect(layer.bounds, paint, lw, { clampFree: layer.rule === LayerRule.FREE });
    }
  }

  _drawActiveDraft(lw) {
    const draft = this.scene.activeDraft;
    if (!draft) return;
    if (draft.kind === "marquee") {
      this._rect(draft.bounds, overlayUI.marquee, lw, { dash: [5 * lw, 3 * lw] });
    } else if (draft.shape) {
      this._drawShape(draft.shape, this.scene.drawStyle || overlayUI.drawing, lw);
    }
  }

  _rect(bounds, style, lw, opts = {}) {
    const ctx = this.ctx;
    let [x0, y0, x1, y1] = bounds;
    if (opts.clampFree) {
      const map = MAP.bounds;
      x0 = Math.max(x0, map[0]);
      y0 = Math.max(y0, map[1]);
      x1 = Math.min(x1, map[2]);
      y1 = Math.min(y1, map[3]);
      if (x0 > x1 || y0 > y1) return;
    }
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (style.fill) {
      ctx.fillStyle = style.fill;
      ctx.fillRect(x0, y0, w, h);
    }
    if (style.stroke) {
      ctx.lineWidth = (opts.lineWidth || 1) * lw;
      ctx.strokeStyle = style.stroke;
      if (opts.dash) ctx.setLineDash(opts.dash);
      ctx.strokeRect(x0, y0, w, h);
      if (opts.dash) ctx.setLineDash([]);
    }
  }

  _drawScreenLabels() {
    if (!this.scene.labels || !this.scene.labels.length) return;
    const ctx = this.ctx;
    const cam = this.scene.cam;
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const label of this.scene.labels) {
      if (label.minScale && cam.scale < label.minScale) continue;
      const p = worldToScreen(cam, label.x, label.y);
      if (p.x < -40 || p.x > cam.viewW + 40 || p.y < -20 || p.y > cam.viewH + 20) continue;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      const w = ctx.measureText(label.text).width;
      ctx.fillRect(p.x - w / 2 - 4, p.y - 9, w + 8, 18);
      ctx.fillStyle = label.color || "#dfe6ef";
      ctx.fillText(label.text, p.x, p.y);
    }
  }

  _drawMarkerCells(lw) {
    const ctx = this.ctx;
    const markers = this.scene.markers;
    if (markers && markers.length) {
      for (const marker of markers) {
        ctx.lineWidth = 2 * lw;
        ctx.strokeStyle = markColor(marker.colorKey);
        ctx.strokeRect(marker.cx, marker.cy, 1, 1);
      }
    }
    const preview = this.scene.markPreview;
    if (preview && preview.active && this.scene.cursorCell) {
      const cell = this.scene.cursorCell;
      ctx.lineWidth = 2 * lw;
      ctx.strokeStyle = preview.color;
      ctx.setLineDash([4 * lw, 3 * lw]);
      ctx.strokeRect(cell.x, cell.y, 1, 1);
      ctx.setLineDash([]);
    }
  }

  _drawMarkerPins() {
    const cam = this.scene.cam;
    const markers = this.scene.markers;
    if (markers && markers.length) {
      for (const marker of markers) {
        const p = worldToScreen(cam, marker.cx + 0.5, marker.cy + 0.5);
        this._drawLocationDot(p.x, p.y, markColor(marker.colorKey), 1);
      }
    }
    const preview = this.scene.markPreview;
    if (preview && preview.active && this.scene.cursorCell) {
      const cell = this.scene.cursorCell;
      const p = worldToScreen(cam, cell.x + 0.5, cell.y + 0.5);
      this._drawLocationDot(p.x, p.y, preview.color, 0.5);
    }
  }

  _drawLocationDot(x, y, color, alpha) {
    const cam = this.scene.cam;
    if (x < -12 || x > cam.viewW + 12 || y < -12 || y > cam.viewH + 12) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fill();
    ctx.restore();
  }

  _drawEntityTexts() {
    const entities = this.scene.userEntities;
    if (!entities || !entities.length) return;
    const violations = this.scene.violationIds;
    for (const entity of entities) {
      if (entity.category === "obstacle" || !entity.text) continue;
      const style = this._resolveTextStyle(entity);
      const px = this._fontPx(style);
      const wrap = entity.wrap && entity.wrap > 0 ? entity.wrap : DEFAULT_WRAP;
      const lines = this._wrapByChars(entity.text, wrap);
      const bounds = entity.bodyBounds;
      const faded = violations && violations.has(entity.id);
      this._drawStyledText(lines, (bounds[0] + bounds[2] + 1) / 2, (bounds[1] + bounds[3] + 1) / 2, style, px, faded);
    }
  }

  _drawDrawingTexts() {
    const drawings = this.scene.drawings;
    if (!drawings || !drawings.length) return;
    const ctx = this.ctx;
    const cam = this.scene.cam;
    for (const drawing of drawings) {
      if (!drawing.text) continue;
      const style = this._resolveTextStyle(drawing);
      const px = this._fontPx(style);
      ctx.font = `600 ${px}px "Microsoft YaHei", sans-serif`;
      let lines;
      if (drawing.wrap && drawing.wrap > 0) {
        lines = this._wrapByChars(drawing.text, drawing.wrap);
      } else {
        lines = this._wrapByWidth(ctx, drawing.text, drawingWidth(drawing) * cam.scale * DRAWING_WRAP_RATIO);
      }
      const center = drawingCenter(drawing);
      this._drawStyledText(lines, center.x, center.y, style, px, false);
    }
  }

  _resolveTextStyle(item) {
    const global = this.scene.textStyle || {};
    const style = item.style;
    if (style && style.fixed) return { ...defaultTextStyle, ...style };
    if (style && (style.updatedAt || 0) > (global.updatedAt || 0)) return { ...defaultTextStyle, ...style };
    return { ...defaultTextStyle, ...global };
  }

  _fontPx(style) {
    if (!style.followZoom) return style.size || 12;
    return Math.max(6, Math.min(300, TEXT_ZOOM_FACTOR * this.scene.cam.scale));
  }

  _wrapByChars(text, size) {
    if (!size || size <= 0 || text.length <= size) return [text];
    const lines = [];
    for (let i = 0; i < text.length; i += size) lines.push(text.slice(i, i + size));
    return lines;
  }

  _wrapByWidth(ctx, text, maxWidth) {
    if (!(maxWidth > 0)) return [text];
    const lines = [];
    let cur = "";
    for (const ch of text) {
      const next = cur + ch;
      if (cur && ctx.measureText(next).width > maxWidth) {
        lines.push(cur);
        cur = ch;
      } else {
        cur = next;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [text];
  }

  _drawStyledText(lines, x, y, style, px, faded) {
    const ctx = this.ctx;
    const cam = this.scene.cam;
    const p = worldToScreen(cam, x, y);
    if (p.x < -160 || p.x > cam.viewW + 160 || p.y < -80 || p.y > cam.viewH + 80) return;
    ctx.save();
    if (faded) ctx.globalAlpha = 0.3;
    ctx.font = `600 ${px}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lineH = px * 1.28;
    const blockH = lineH * lines.length;
    let maxW = 0;
    for (const line of lines) {
      const w = ctx.measureText(line).width;
      if (w > maxW) maxW = w;
    }
    if (style.showBg) {
      const padX = Math.max(4, px * 0.35);
      const padY = Math.max(3, px * 0.22);
      const w = maxW + padX * 2;
      const h = blockH + padY * 2;
      const r = Math.min(h / 2, Math.max(3, px * 0.35));
      this._roundRectPath(p.x - w / 2, p.y - h / 2, w, h, r);
      ctx.fillStyle = hexToRgba(style.bgColor || "#000000", 0.72);
      ctx.fill();
    }
    ctx.fillStyle = style.color || "#eaf2ff";
    let ty = p.y - blockH / 2 + lineH / 2;
    for (const line of lines) {
      ctx.fillText(line, p.x, ty);
      ty += lineH;
    }
    ctx.restore();
  }

  _roundRectPath(x, y, w, h, r) {
    const ctx = this.ctx;
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  _drawContentIcons() {
    const vis = this.scene.visibility;
    for (const entity of this.scene.presetEntities) {
      if (!entity.blocking || !vis[entity.group]) continue;
      const key = presetIconKey(entity);
      if (key) this._drawFittedIcon(entity.bounds, presetIcon(key), 1);
    }
    if (vis.userEntities) {
      const violations = this.scene.violationIds;
      for (const entity of this.scene.userEntities) {
        if (entity.key === "flag" || entity.key === "water") continue;
        const faded = violations && violations.has(entity.id);
        if (faded) {
          this.ctx.save();
          this.ctx.globalAlpha = 0.3;
        }
        this._drawFittedIcon(entity.bodyBounds, unitIcon(entity.key), entity.iconScale ?? 1);
        if (faded) this.ctx.restore();
      }
    }
  }

  _drawWorldSpaceIcons() {
    const vis = this.scene.visibility;
    for (const entity of this.scene.presetEntities) {
      if (!entity.blocking || !vis[entity.group]) continue;
      if (entity.subType === "water") this._drawFittedIconWorld(entity.bounds, unitIcon("water"), false, 0.5);
    }
    if (vis.userEntities) {
      const violations = this.scene.violationIds;
      for (const entity of this.scene.userEntities) {
        const faded = violations && violations.has(entity.id);
        if (entity.key === "flag") {
          if (faded) {
            this.ctx.save();
            this.ctx.globalAlpha = 0.3;
          }
          this._drawFittedIconWorld(entity.bodyBounds, unitIcon("flag"), true, entity.iconScale ?? 1);
          if (faded) this.ctx.restore();
        } else if (entity.key === "water") {
          if (faded) {
            this.ctx.save();
            this.ctx.globalAlpha = 0.3;
          }
          this._drawFittedIconWorld(entity.bodyBounds, unitIcon("water"), false, 0.5);
          if (faded) this.ctx.restore();
        }
      }
    }
  }

  _drawFittedIcon(bounds, src, scale = 1) {
    if (!bounds) return;
    const img = loadImage(src);
    if (!img) return;
    const cam = this.scene.cam;
    const [x0, y0, x1, y1] = bounds;
    const w = (x1 - x0 + 1) * cam.scale;
    const h = (y1 - y0 + 1) * cam.scale;
    if (w < 6 || h < 6) return;
    const nw = img.naturalWidth || 1;
    const nh = img.naturalHeight || 1;
    const pad = Math.max(w, h) * 2;
    const p = worldToScreen(cam, (x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2);
    if (p.x < -pad || p.x > cam.viewW + pad || p.y < -pad || p.y > cam.viewH + pad) return;
    const k = Math.min(w / nw, h / nh) * 0.92 * scale;
    const dw = nw * k;
    const dh = nh * k;
    this.ctx.drawImage(img, p.x - dw / 2, p.y - dh / 2, dw, dh);
  }

  _drawFittedIconWorld(bounds, src, pin, scale = 1) {
    if (!bounds) return;
    const img = loadImage(src);
    if (!img) return;
    const cam = this.scene.cam;
    const [x0, y0, x1, y1] = bounds;
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (w * cam.scale < 6 || h * cam.scale < 6) return;
    const nw = img.naturalWidth || 1;
    const nh = img.naturalHeight || 1;
    const p0 = worldToScreen(cam, x0, y0);
    const p1 = worldToScreen(cam, x1 + 1, y0);
    const p2 = worldToScreen(cam, x0, y1 + 1);
    const p3 = worldToScreen(cam, x1 + 1, y1 + 1);
    const vx = p1.x - p0.x;
    const vy = p1.y - p0.y;
    const wx = p2.x - p0.x;
    const wy = p2.y - p0.y;
    const spanX = Math.hypot(vx, vy);
    const spanY = Math.hypot(wx, wy);
    const center = { x: (p0.x + p3.x) / 2, y: (p0.y + p3.y) / 2 };
    const pad = Math.max(spanX, spanY) * 3;
    if (center.x < -pad || center.x > cam.viewW + pad || center.y < -pad || center.y > cam.viewH + pad) return;
    const ctx = this.ctx;
    const fit = 0.92;
    if (pin) {
      const k = (Math.min(spanX, spanY) * fit * scale) / nw;
      const dw = nw * k;
      const dh = nh * k;
      ctx.drawImage(img, center.x - dw / 2, center.y - dh, dw, dh);
    } else {
      const k = Math.min(w / nw, h / nh) * fit * scale;
      const dw = nw * k;
      const dh = nh * k;
      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.transform(vx / w, vy / w, wx / h, wy / h, 0, 0);
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }
  }
}
