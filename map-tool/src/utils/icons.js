const BASE = "./";

const imageCache = new Map();
const listeners = new Set();

export function onIconLoad(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyIconLoad() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function loadImage(src) {
  if (!src) return null;
  let img = imageCache.get(src);
  if (!img) {
    img = new Image();
    img._status = "loading";
    imageCache.set(src, img);
    img.onload = () => {
      img._status = img.naturalWidth > 0 ? "ok" : "error";
      notifyIconLoad();
    };
    img.onerror = () => {
      img._status = "error";
    };
    img.src = src;
  }
  return img._status === "ok" ? img : null;
}

export function unitIcon(key) {
  return `${BASE}icons/units/${key}.png`;
}

export function presetIcon(key) {
  return `${BASE}icons/preset/${key}.png`;
}

export function rewardIcon(key) {
  return `${BASE}icons/rewards/${key}.png`;
}

export function rotationIcon(key) {
  return `${BASE}icons/rotation/${key}.png`;
}
