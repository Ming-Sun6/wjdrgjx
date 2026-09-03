import { LayerRule } from "../data/styles.js";
import { MAP } from "../data/presets.js";

export function boundsOverlap(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

export function boundsContains(outer, inner) {
  return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];
}

export function pointInBounds(x, y, bounds) {
  return x >= bounds[0] && x <= bounds[2] && y >= bounds[1] && y <= bounds[3];
}

export function boundsSize(bounds) {
  return {
    width: bounds[2] - bounds[0] + 1,
    height: bounds[3] - bounds[1] + 1,
  };
}

export function boundsCenter(bounds) {
  return [(bounds[0] + bounds[2] + 1) / 2, (bounds[1] + bounds[3] + 1) / 2];
}

export function sizeToBounds(size, cx, cy) {
  const x = cx - Math.floor((size.width - 1) / 2);
  const y = cy - Math.floor((size.height - 1) / 2);
  return [x, y, x + size.width - 1, y + size.height - 1];
}

export function layoutEntity(def, cx, cy) {
  const layers = def.layers.map((layer) => ({
    key: layer.key,
    title: layer.title,
    rule: layer.rule,
    styleKey: layer.styleKey || null,
    bounds: sizeToBounds(layer.size, cx, cy),
  }));
  const body =
    layers.find((layer) => layer.rule === LayerRule.SOLID) ||
    layers.find((layer) => layer.rule === LayerRule.INSIDE_ONLY) ||
    layers[layers.length - 1];
  return {
    anchor: [cx, cy],
    layers,
    bodyBounds: body.bounds,
  };
}

export function validateLayout(layout, blockers) {
  const mapBounds = MAP.bounds;
  for (const layer of layout.layers) {
    if (layer.rule === LayerRule.FREE) continue;
    if (!boundsContains(mapBounds, layer.bounds)) {
      return { valid: false, reason: `“${layer.title}”超出了地图范围` };
    }
    if (layer.rule === LayerRule.SOLID) {
      for (const blocker of blockers) {
        if (boundsOverlap(layer.bounds, blocker)) {
          return { valid: false, reason: "与已有内容发生重叠" };
        }
      }
    }
  }
  return { valid: true, reason: "" };
}

export function rectFromPoints(x1, y1, x2, y2) {
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
}

export function unionBounds(list) {
  if (!list.length) return null;
  let [minX, minY, maxX, maxY] = list[0];
  for (let i = 1; i < list.length; i++) {
    const b = list[i];
    if (b[0] < minX) minX = b[0];
    if (b[1] < minY) minY = b[1];
    if (b[2] > maxX) maxX = b[2];
    if (b[3] > maxY) maxY = b[3];
  }
  return [minX, minY, maxX, maxY];
}

export function tiltFactor(cam) {
  return Math.max(0.2, Math.cos(cam.tilt || 0));
}

export const GAME_VIEW = {
  rotation: -(135 * Math.PI) / 180,
  tilt: (40 * Math.PI) / 180,
};

export function worldToScreen(cam, x, y) {
  const cx = cam.viewW / 2;
  const cy = cam.viewH / 2;
  const flip = !!cam.flipAxes;
  const dx = (flip ? y - cam.y : x - cam.x) * cam.scale;
  const dy = (flip ? x - cam.x : y - cam.y) * cam.scale;
  const cos = Math.cos(cam.rotation);
  const sin = Math.sin(cam.rotation);
  const tf = tiltFactor(cam);
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + (dx * sin + dy * cos) * tf,
  };
}

export function screenToWorld(cam, sx, sy) {
  const cx = cam.viewW / 2;
  const cy = cam.viewH / 2;
  const tf = tiltFactor(cam);
  const dx = sx - cx;
  const dy = (sy - cy) / tf;
  const cos = Math.cos(cam.rotation);
  const sin = Math.sin(cam.rotation);
  const rx = dx * cos + dy * sin;
  const ry = -dx * sin + dy * cos;
  return cam.flipAxes
    ? { x: ry / cam.scale + cam.x, y: rx / cam.scale + cam.y }
    : { x: rx / cam.scale + cam.x, y: ry / cam.scale + cam.y };
}

export function screenToCell(cam, sx, sy) {
  const p = screenToWorld(cam, sx, sy);
  return { x: Math.floor(p.x), y: Math.floor(p.y) };
}

export function viewWorldRect(cam) {
  const corners = [
    screenToWorld(cam, 0, 0),
    screenToWorld(cam, cam.viewW, 0),
    screenToWorld(cam, 0, cam.viewH),
    screenToWorld(cam, cam.viewW, cam.viewH),
  ];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of corners) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function fitBoundsToView(bounds, viewW, viewH, padding = 0.12) {
  const w = bounds[2] - bounds[0] + 1;
  const h = bounds[3] - bounds[1] + 1;
  const availW = viewW * (1 - padding * 2);
  const availH = viewH * (1 - padding * 2);
  const scale = Math.max(0.02, Math.min(availW / w, availH / h));
  return {
    x: (bounds[0] + bounds[2] + 1) / 2,
    y: (bounds[1] + bounds[3] + 1) / 2,
    scale,
  };
}

export const GRID_LEVELS = [
  { min: 14, block: 1 },
  { min: 7, block: 2 },
  { min: 3.5, block: 4 },
  { min: 1.8, block: 8 },
  { min: 0.9, block: 16 },
  { min: 0.45, block: 32 },
  { min: 0.22, block: 64 },
  { min: 0, block: null },
];

export function gridLevelForScale(scale) {
  for (let i = 0; i < GRID_LEVELS.length; i++) {
    if (scale >= GRID_LEVELS[i].min) {
      return { level: i + 1, block: GRID_LEVELS[i].block };
    }
  }
  return { level: 8, block: null };
}

export function boundsIntersectView(bounds, view) {
  return bounds[0] <= view.maxX && bounds[2] >= view.minX && bounds[1] <= view.maxY && bounds[3] >= view.minY;
}
