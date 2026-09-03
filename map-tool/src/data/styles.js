export const boardStyle = {
  cellStroke: "rgba(150, 160, 175, 0.28)",
  boardFill: "rgba(28, 35, 46, 0.55)",
  boardBorder: "rgba(90, 160, 255, 0.7)",
};

export const zoneStyles = {
  wasteland: { fill: "rgba(96, 84, 66, 0.16)", stroke: "rgba(150, 130, 100, 0.5)", label: "#c9b48c" },
  snowland: { fill: "rgba(150, 190, 220, 0.14)", stroke: "rgba(170, 205, 230, 0.55)", label: "#bfe0f0" },
  fertileLand: { fill: "rgba(120, 190, 120, 0.16)", stroke: "rgba(140, 210, 140, 0.55)", label: "#a9e0a9" },
};

export const sunCityStyles = {
  ruins: { fill: "rgba(200, 90, 70, 0.10)", stroke: "rgba(210, 110, 90, 0.5)", label: "#e0a090" },
  relic: { fill: "rgba(230, 60, 60, 0.16)", stroke: "rgba(255, 80, 80, 0.85)", label: "#ff9a9a" },
  buildingArea: { fill: "rgba(255, 200, 90, 0.14)", stroke: "rgba(255, 210, 110, 0.7)", label: "#ffd680" },
  turret: { fill: "rgba(255, 150, 60, 0.35)", stroke: "rgba(255, 170, 80, 0.9)", label: "#ffc188" },
  core: { fill: "rgba(255, 215, 0, 0.45)", stroke: "rgba(255, 230, 90, 1)", label: "#fff3a0" },
};

export const battleStyles = {
  stronghold: { fill: "rgba(120, 90, 220, 0.5)", stroke: "rgba(160, 130, 255, 1)", label: "#cbb8ff" },
  strongholdRuins: { fill: "rgba(120, 90, 220, 0.10)", stroke: "rgba(150, 120, 230, 0.4)", label: "#b0a0e0" },
  fortress: { fill: "rgba(220, 80, 140, 0.5)", stroke: "rgba(255, 120, 175, 1)", label: "#ffb0d0" },
  fortressRuins: { fill: "rgba(220, 80, 140, 0.10)", stroke: "rgba(230, 110, 165, 0.4)", label: "#e0a0c0" },
};

export const engineeringStyles = {
  scorched: { fill: "rgba(90, 70, 60, 0.16)", stroke: "rgba(140, 110, 90, 0.45)", label: "#c0a890" },
  types: {
    construction: { fill: "rgba(90, 170, 255, 0.6)", stroke: "rgba(120, 190, 255, 1)", label: "构" },
    gathering: { fill: "rgba(80, 200, 140, 0.6)", stroke: "rgba(110, 220, 165, 1)", label: "采" },
    production: { fill: "rgba(255, 180, 70, 0.6)", stroke: "rgba(255, 200, 100, 1)", label: "产" },
    technology: { fill: "rgba(180, 130, 255, 0.6)", stroke: "rgba(200, 155, 255, 1)", label: "科" },
    defense: { fill: "rgba(255, 110, 110, 0.6)", stroke: "rgba(255, 140, 140, 1)", label: "防" },
    training: { fill: "rgba(120, 200, 210, 0.6)", stroke: "rgba(150, 220, 230, 1)", label: "训" },
    weapon: { fill: "rgba(230, 160, 90, 0.6)", stroke: "rgba(250, 185, 115, 1)", label: "武" },
    expedition: { fill: "rgba(160, 210, 90, 0.6)", stroke: "rgba(185, 230, 115, 1)", label: "远" },
  },
};

export const catalogStyles = {
  basics: { fill: "rgba(90, 200, 255, 0.55)", stroke: "rgba(120, 215, 255, 1)" },
  territory: { fill: "rgba(255, 200, 80, 0.55)", stroke: "rgba(255, 215, 110, 1)" },
  special: { fill: "rgba(200, 140, 255, 0.55)", stroke: "rgba(215, 165, 255, 1)" },
  honor: { fill: "rgba(255, 170, 120, 0.55)", stroke: "rgba(255, 190, 145, 1)" },
  resource: { fill: "rgba(110, 220, 160, 0.55)", stroke: "rgba(140, 235, 185, 1)" },
  creature: { fill: "rgba(255, 110, 110, 0.55)", stroke: "rgba(255, 140, 140, 1)" },
  item: { fill: "rgba(255, 90, 90, 0.55)", stroke: "rgba(255, 120, 120, 1)" },
  obstacle: { fill: "rgba(220, 60, 60, 0.5)", stroke: "rgba(255, 90, 90, 1)" },
};

export const overlayStyles = {
  flagCenter: { fill: "rgba(255, 215, 0, 0.6)", stroke: "rgba(255, 230, 90, 1)" },
  flagEffect: { fill: "rgba(255, 215, 0, 0.10)", stroke: "rgba(255, 220, 90, 0.5)" },
  flagAdjacency: { fill: "rgba(255, 180, 40, 0.05)", stroke: "rgba(255, 190, 60, 0.35)" },
  bombCenter: { fill: "rgba(255, 80, 80, 0.7)", stroke: "rgba(255, 110, 110, 1)" },
  bombRange: { fill: "rgba(255, 80, 80, 0.12)", stroke: "rgba(255, 100, 100, 0.5)" },
  hqEffect: { fill: "rgba(255, 200, 80, 0.10)", stroke: "rgba(255, 210, 100, 0.5)" },
  hqAdjacency: { fill: "rgba(255, 170, 40, 0.05)", stroke: "rgba(255, 185, 60, 0.35)" },
};

export const markColors = [
  { key: "orange", label: "橙色", color: "#ff8c1a" },
  { key: "blue", label: "蓝色", color: "#3a9bff" },
  { key: "green", label: "绿色", color: "#43d17a" },
  { key: "yellow", label: "黄色", color: "#ffd21a" },
  { key: "red", label: "红色", color: "#ff5a5a" },
  { key: "purple", label: "紫色", color: "#b072ff" },
];

export const DEFAULT_MARK_COLOR = "blue";

export const overlayUI = {
  hoverCell: { fill: "rgba(90, 170, 255, 0.18)", stroke: "rgba(120, 190, 255, 0.9)" },
  hoverEntity: { fill: "rgba(120, 200, 255, 0.12)", stroke: "rgba(150, 215, 255, 0.95)" },
  placeValid: { fill: "rgba(80, 220, 140, 0.35)", stroke: "rgba(110, 235, 165, 1)" },
  placeInvalid: { fill: "rgba(255, 80, 80, 0.35)", stroke: "rgba(255, 110, 110, 1)" },
  selected: { fill: "rgba(90, 170, 255, 0.22)", stroke: "rgba(120, 200, 255, 1)" },
  marquee: { fill: "rgba(90, 170, 255, 0.12)", stroke: "rgba(120, 200, 255, 0.9)" },
  drawing: { fill: "rgba(53, 208, 165, 0.16)", stroke: "rgba(80, 225, 185, 1)" },
  violation: { fill: "rgba(255, 60, 60, 0.16)", stroke: "rgba(255, 70, 70, 1)" },
};

export const defaultTextStyle = {
  color: "#eaf2ff",
  bgColor: "#000000",
  showBg: true,
  size: 12,
  followZoom: false,
};

export const TEXT_ZOOM_FACTOR = 0.5;
export const DEFAULT_WRAP = 6;
export const DRAWING_WRAP_RATIO = 0.5;

export const LayerRule = {
  SOLID: "solid",
  INSIDE_ONLY: "inside-only",
  FREE: "free",
};
