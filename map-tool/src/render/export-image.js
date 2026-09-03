import { defaultTextStyle } from "../data/styles.js";
import { MAP, presetEntities } from "../data/presets.js";
import { GAME_VIEW } from "../utils/geometry.js";
import { CanvasRenderer, buildPresetLabels } from "./canvas-renderer.js";

const MIN_SCALE = 8;
const MAX_EDIT_SCALE = 40;
const EDIT_TARGET = 4000;
const PAD = 48;
const JPEG_QUALITY = 0.9;
const MOBILE_MAX = 4096;
const CREDIT = "4265区 Max联盟 浅酌清月";

function isMobile() {
  return typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
}

function downloadCanvas(canvas, jpeg, filename) {
  const type = jpeg ? "image/jpeg" : "image/png";
  const quality = jpeg ? JPEG_QUALITY : undefined;
  const click = (href) => {
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  if (canvas.toBlob) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          click(canvas.toDataURL(type, quality));
          resolve();
          return;
        }
        const url = URL.createObjectURL(blob);
        click(url);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        resolve();
      }, type, quality);
    });
  }
  click(canvas.toDataURL(type, quality));
  return Promise.resolve();
}

function exportVisibility(src) {
  const vis = src || {};
  const pick = (key, fallback) => (typeof vis[key] === "boolean" ? vis[key] : fallback);
  return {
    grid: true,
    zones: pick("zones", true),
    sunCity: pick("sunCity", true),
    strongholds: pick("strongholds", true),
    fortresses: pick("fortresses", true),
    engineering: pick("engineering", true),
    userEntities: pick("userEntities", true),
    drawings: pick("drawings", true),
    labels: pick("labels", true),
    icons: pick("icons", true),
    adjacencyRange: pick("adjacencyRange", true),
    effectRange: pick("effectRange", true),
  };
}

function stampCredit(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const size = Math.max(16, Math.round(canvas.width / 60));
  ctx.font = `600 ${size}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  const pad = Math.round(size * 0.9);
  const x = canvas.width - pad;
  const y = canvas.height - pad;
  ctx.lineWidth = Math.max(2, size / 8);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
  ctx.strokeText(CREDIT, x, y);
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.fillText(CREDIT, x, y);
  ctx.restore();
}

function regionFrame(region, bounds) {
  if (region === "edit" && bounds) {
    const [x0, y0, x1, y1] = bounds;
    let spanX = x1 - x0 + 1;
    let spanY = y1 - y0 + 1;
    const pad = Math.max(3, Math.round(Math.max(spanX, spanY) * 0.08));
    spanX += pad * 2;
    spanY += pad * 2;
    return { cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2, spanX, spanY };
  }
  return { cx: MAP.center[0], cy: MAP.center[1], spanX: MAP.width, spanY: MAP.height };
}

function canvasSize(scale, rotation, tilt, spanX, spanY, flipAxes) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const tf = Math.max(0.2, Math.cos(tilt));
  const hx = (flipAxes ? spanY : spanX) / 2;
  const hy = (flipAxes ? spanX : spanY) / 2;
  let maxX = 0;
  let maxY = 0;
  for (const [dx, dy] of [[-hx, -hy], [hx, -hy], [-hx, hy], [hx, hy]]) {
    const x = dx * scale;
    const y = dy * scale;
    const rx = x * cos - y * sin;
    const ry = (x * sin + y * cos) * tf;
    maxX = Math.max(maxX, Math.abs(rx));
    maxY = Math.max(maxY, Math.abs(ry));
  }
  return {
    width: Math.ceil(maxX * 2) + PAD * 2,
    height: Math.ceil(maxY * 2) + PAD * 2,
  };
}

export function exportImage(userEntities, drawings, markers = [], {
  view = "flat",
  region = "full",
  bounds = null,
  flipAxes = false,
  visibility = null,
  textStyle = null,
  labelAlpha = 1,
  showIcons = true,
  violationIds = null,
} = {}) {
  const game = view === "game";
  const rotation = game ? GAME_VIEW.rotation : 0;
  const tilt = game ? GAME_VIEW.tilt : 0;
  const { cx, cy, spanX, spanY } = regionFrame(region, bounds);
  let scale = MIN_SCALE;
  if (region === "edit") {
    const span = Math.max(1, spanX, spanY);
    scale = Math.min(MAX_EDIT_SCALE, Math.max(MIN_SCALE, EDIT_TARGET / span));
  }
  let { width, height } = canvasSize(scale, rotation, tilt, spanX, spanY, flipAxes);
  if (isMobile()) {
    const maxSide = Math.max(width, height);
    if (maxSide > MOBILE_MAX) {
      scale = Math.max(1, scale * MOBILE_MAX / maxSide);
      ({ width, height } = canvasSize(scale, rotation, tilt, spanX, spanY, flipAxes));
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  new CanvasRenderer(canvas).renderStatic({
    cam: { x: cx, y: cy, scale, rotation, tilt, viewW: width, viewH: height, flipAxes },
    dpr: 1,
    visibility: exportVisibility(visibility),
    presetEntities,
    userEntities,
    drawings,
    selectionBounds: [],
    violationIds: violationIds || null,
    markers,
    markPreview: { active: false },
    hover: null,
    cursorCell: null,
    preview: null,
    carry: null,
    activeDraft: null,
    labels: buildPresetLabels(),
    showLabels: labelAlpha > 0,
    labelAlpha,
    showIcons,
    textStyle: textStyle || { ...defaultTextStyle, updatedAt: 0 },
    forceFineGrid: true,
  });
  stampCredit(canvas);
  const jpeg = view === "game";
  const filename = `endless-winter-map-${region}-${view}-${Date.now()}.${jpeg ? "jpg" : "png"}`;
  return downloadCanvas(canvas, jpeg, filename);
}
