import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import { MAP } from "../data/presets.js";
import {
  GAME_VIEW,
  fitBoundsToView,
  gridLevelForScale,
  screenToWorld,
  tiltFactor,
} from "../utils/geometry.js";

const MIN_SCALE = 0.05;
const MAX_SCALE = 60;
const MAX_TILT = 1.08;

export const useViewportStore = defineStore("viewport", () => {
  const cam = reactive({
    x: MAP.center[0],
    y: MAP.center[1],
    scale: 0.6,
    rotation: 0,
    tilt: 0,
    viewW: 800,
    viewH: 600,
    flipAxes: true,
  });

  let animId = 0;
  const zoomPercent = ref(0);
  const gridLevelInfo = ref({ level: 1, block: 1 });

  function clampScale(value) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
  }

  function setViewSize(w, h) {
    cam.viewW = w;
    cam.viewH = h;
  }

  function panByScreen(dx, dy) {
    const cos = Math.cos(cam.rotation);
    const sin = Math.sin(cam.rotation);
    const tf = tiltFactor(cam);
    const sx = dx;
    const sy = dy / tf;
    const wx = (sx * cos + sy * sin) / cam.scale;
    const wy = (-sx * sin + sy * cos) / cam.scale;
    if (cam.flipAxes) {
      cam.x -= wy;
      cam.y -= wx;
    } else {
      cam.x -= wx;
      cam.y -= wy;
    }
  }

  function toggleFlipAxes() {
    cam.flipAxes = !cam.flipAxes;
  }

  function fitForCam(bounds, padding) {
    if (cam.flipAxes) {
      const fitted = fitBoundsToView([bounds[1], bounds[0], bounds[3], bounds[2]], cam.viewW, cam.viewH, padding);
      return { x: fitted.y, y: fitted.x, scale: fitted.scale };
    }
    return fitBoundsToView(bounds, cam.viewW, cam.viewH, padding);
  }

  function zoomAt(factor, sx, sy) {
    const before = screenToWorld(cam, sx, sy);
    cam.scale = clampScale(cam.scale * factor);
    const after = screenToWorld(cam, sx, sy);
    cam.x += before.x - after.x;
    cam.y += before.y - after.y;
  }

  function setScale(value) {
    cam.scale = clampScale(value);
  }

  function rotateBy(delta) {
    cam.rotation = (cam.rotation + delta) % (Math.PI * 2);
  }

  function setRotation(value) {
    cam.rotation = value % (Math.PI * 2);
  }

  function setTilt(value) {
    cam.tilt = Math.min(MAX_TILT, Math.max(0, value));
  }

  function applyGameView() {
    setRotation(GAME_VIEW.rotation);
    setTilt(GAME_VIEW.tilt);
  }

  function refreshGridLevel() {
    gridLevelInfo.value = gridLevelForScale(cam.scale);
  }

  function refreshZoomPercent() {
    zoomPercent.value = Math.round(cam.scale * 100);
  }

  function stopAnim() {
    if (animId) cancelAnimationFrame(animId);
    animId = 0;
  }

  function reset() {
    stopAnim();
    const fitted = fitForCam(MAP.bounds, 0.05);
    cam.x = fitted.x;
    cam.y = fitted.y;
    cam.scale = clampScale(fitted.scale);
    cam.rotation = 0;
    cam.tilt = 0;
  }

  function fitBounds(bounds, { animate = true, padding = 0.18 } = {}) {
    stopAnim();
    const target = fitForCam(bounds, padding);
    target.scale = clampScale(target.scale);
    if (!animate) {
      cam.x = target.x;
      cam.y = target.y;
      cam.scale = target.scale;
      return;
    }
    const from = { x: cam.x, y: cam.y, scale: cam.scale };
    const start = performance.now();
    const duration = 320;
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      cam.x = from.x + (target.x - from.x) * ease;
      cam.y = from.y + (target.y - from.y) * ease;
      cam.scale = from.scale + (target.scale - from.scale) * ease;
      animId = t < 1 ? requestAnimationFrame(step) : 0;
    };
    animId = requestAnimationFrame(step);
  }

  return {
    cam,
    MIN_SCALE,
    MAX_SCALE,
    MAX_TILT,
    setViewSize,
    panByScreen,
    toggleFlipAxes,
    zoomAt,
    setScale,
    rotateBy,
    setRotation,
    setTilt,
    applyGameView,
    reset,
    fitBounds,
    stopAnim,
    zoomPercent,
    refreshZoomPercent,
    gridLevelInfo,
    refreshGridLevel,
  };
});
