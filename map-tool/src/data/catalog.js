import { LayerRule } from "./styles.js";

function unit(key, title, width, height, category, extra = {}) {
  return {
    key,
    title,
    category,
    size: { width, height },
    layers: [{ key: "body", title: "本体", size: { width, height }, rule: LayerRule.SOLID }],
    ...extra,
  };
}

function hq(key, title, shortLabel) {
  return {
    key,
    title,
    category: "territory",
    shortLabel,
    description: "联盟总部：本体需在图内且不重叠；作用/接壤范围允许重叠与超出",
    size: { width: 3, height: 3 },
    anchorLayer: "body",
    layers: [
      { key: "adjacency", title: "接壤范围", size: { width: 23, height: 23 }, rule: LayerRule.FREE, styleKey: "hqAdjacency" },
      { key: "effect", title: "作用范围", size: { width: 15, height: 15 }, rule: LayerRule.FREE, styleKey: "hqEffect" },
      { key: "body", title: "本体", size: { width: 3, height: 3 }, rule: LayerRule.SOLID },
    ],
  };
}

export const catalog = [
  {
    key: "obstacle",
    title: "障碍物",
    styleKey: "obstacle",
    items: [
      unit("mountain", "山体", 1, 1, "obstacle", { description: "障碍物：红色禁放区域，其上无法放置其他内容" }),
      unit("water", "水域", 1, 1, "obstacle", { description: "障碍物：红色禁放区域，其上无法放置其他内容" }),
    ],
  },
  {
    key: "basics",
    title: "基础单位",
    styleKey: "basics",
    items: [
      unit("town", "城镇", 2, 2, "basics", { description: "玩家主基地", shortLabel: "镇" }),
      unit("troop", "部队", 1, 1, "basics", { description: "行军或驻守的军队单位", shortLabel: "队" }),
    ],
  },
  {
    key: "territory",
    title: "联盟领地",
    styleKey: "territory",
    items: [
      hq("hq_wasteland", "荒原联盟总部", "荒总"),
      hq("hq_snowland", "雪原联盟总部", "雪总"),
      {
        key: "flag",
        title: "联盟旗帜",
        category: "territory",
        shortLabel: "旗",
        description: "最大旗帜总数：285；中心不可超出地图、中心点不可重叠；作用/接壤范围允许重叠与超出",
        maxCount: 285,
        size: { width: 1, height: 1 },
        anchorLayer: "center",
        layers: [
          { key: "adjacency", title: "接壤范围", size: { width: 15, height: 15 }, rule: LayerRule.FREE, styleKey: "flagAdjacency" },
          { key: "effect", title: "作用范围", size: { width: 7, height: 7 }, rule: LayerRule.FREE, styleKey: "flagEffect" },
          { key: "center", title: "旗帜中心", size: { width: 1, height: 1 }, rule: LayerRule.SOLID, styleKey: "flagCenter" },
        ],
      },
    ],
  },
  {
    key: "special",
    title: "特殊建筑",
    styleKey: "special",
    items: [
      unit("huntingTrap", "狩猎陷阱", 3, 3, "special", { shortLabel: "陷阱" }),
      unit("largeSawmill", "大型锯木厂", 3, 3, "special", { shortLabel: "锯木" }),
      unit("largeCoalWasher", "大型洗煤厂", 3, 3, "special", { shortLabel: "洗煤" }),
      unit("largeIronSmelter", "大型冶铁厂", 3, 3, "special", { shortLabel: "冶铁" }),
      unit("largeBreedingFarm", "大型养殖场", 3, 3, "special", { shortLabel: "养殖" }),
    ],
  },
  {
    key: "honor",
    title: "荣誉建筑",
    styleKey: "honor",
    items: [
      unit("hegemonySilverStatue", "争霸赛白银像", 2, 2, "honor", { shortLabel: "银像" }),
      unit("pioneer", "开拓者", 2, 2, "honor", { shortLabel: "拓" }),
      unit("militaryTycoon", "军工大亨", 2, 2, "honor", { shortLabel: "军工" }),
      unit("battleHorn", "战斗号角", 2, 2, "honor", { shortLabel: "号角" }),
      unit("weaponMaster", "兵器大师", 2, 2, "honor", { shortLabel: "兵器" }),
    ],
  },
  {
    key: "item",
    title: "特殊道具",
    styleKey: "item",
    items: [
      {
        key: "allianceBomb",
        title: "联盟炸弹",
        category: "item",
        shortLabel: "炸弹",
        description: "用于清除障碍物；除中心外，其范围允许重叠与超出地图",
        size: { width: 5, height: 5 },
        anchorLayer: "center",
        layers: [
          { key: "range", title: "作用范围", size: { width: 5, height: 5 }, rule: LayerRule.FREE, styleKey: "bombRange" },
          { key: "center", title: "炸弹中心", size: { width: 1, height: 1 }, rule: LayerRule.SOLID, styleKey: "bombCenter" },
        ],
      },
    ],
  },
  {
    key: "resource",
    title: "野外资源点",
    styleKey: "resource",
    items: [
      unit("abandonedLivestock", "废弃畜牧场", 1, 1, "resource", { shortLabel: "废畜", canvasIconScale: 0.65 }),
      unit("abandonedIron", "废弃炼铁场", 1, 1, "resource", { shortLabel: "废铁", canvasIconScale: 0.65 }),
      unit("abandonedWood", "废弃木材厂", 1, 1, "resource", { shortLabel: "废木", canvasIconScale: 0.65 }),
      unit("abandonedCoal", "废弃煤矿场", 1, 1, "resource", { shortLabel: "废煤", canvasIconScale: 0.65 }),
      unit("allianceLivestock", "联盟畜牧场", 2, 2, "resource", { shortLabel: "盟畜", canvasIconScale: 0.65 }),
      unit("allianceIron", "联盟炼铁厂", 2, 2, "resource", { shortLabel: "盟铁", canvasIconScale: 0.65 }),
      unit("allianceWood", "联盟木材场", 2, 2, "resource", { shortLabel: "盟木", canvasIconScale: 0.65 }),
      unit("allianceCoal", "联盟煤矿厂", 2, 2, "resource", { shortLabel: "盟煤", canvasIconScale: 0.65 }),
    ],
  },
  {
    key: "creature",
    title: "野外生物",
    styleKey: "creature",
    items: [
      unit("beast", "野兽", 1, 1, "creature", { shortLabel: "兽" }),
      unit("leviathan", "巨兽", 2, 2, "creature", { shortLabel: "巨兽" }),
      unit("yeti", "雪怪", 2, 2, "creature", { shortLabel: "雪怪" }),
    ],
  },
];

const catalogByKey = new Map();
for (const group of catalog) {
  for (const item of group.items) {
    catalogByKey.set(item.key, { ...item, groupKey: group.key, groupStyleKey: group.styleKey });
  }
}

export function getCatalogItem(key) {
  return catalogByKey.get(key) || null;
}
