export const MAP = {
  width: 1200,
  height: 1200,
  bounds: [0, 0, 1199, 1199],
  center: [599.5, 599.5],
};

export const presetGroups = [
  { key: "zones", title: "地理区域", defaultVisible: true },
  { key: "sunCity", title: "中心太阳城", defaultVisible: true },
  { key: "strongholds", title: "要塞", defaultVisible: true },
  { key: "fortresses", title: "堡垒", defaultVisible: true },
  { key: "engineering", title: "工程站", defaultVisible: true },
];

const ZONES = [
  { id: "zone_wasteland", title: "荒原", subType: "wasteland", bounds: [0, 0, 1199, 1199] },
  { id: "zone_snowland", title: "雪原", subType: "snowland", bounds: [300, 300, 899, 899] },
  { id: "zone_fertile", title: "沃土", subType: "fertileLand", bounds: [450, 450, 749, 749] },
];

const SUN_CITY = [
  { id: "sc_ruins", title: "太阳城废墟", subType: "ruins", bounds: [552, 552, 647, 647], blocking: false },
  { id: "sc_relic", title: "太阳城遗迹", subType: "relic", bounds: [586, 586, 613, 613], blocking: false },
  { id: "sc_building", title: "太阳城建筑区", subType: "buildingArea", bounds: [594, 594, 605, 605], blocking: true },
  { id: "sc_turret_n", title: "北地炮台", subType: "turret", bounds: [604, 604, 605, 605], blocking: true },
  { id: "sc_turret_s", title: "南翼炮台", subType: "turret", bounds: [594, 594, 595, 595], blocking: true },
  { id: "sc_turret_w", title: "西境炮台", subType: "turret", bounds: [594, 604, 595, 605], blocking: true },
  { id: "sc_turret_e", title: "东城炮台", subType: "turret", bounds: [604, 594, 605, 595], blocking: true },
  { id: "sc_core", title: "太阳城", subType: "core", bounds: [597, 597, 602, 602], blocking: true },
];

const STRONGHOLDS = [
  [1, [597, 800, 602, 805], [570, 773, 629, 832]],
  [2, [400, 597, 405, 603], [373, 570, 432, 629]],
  [3, [597, 400, 602, 405], [570, 373, 629, 432]],
  [4, [800, 597, 805, 602], [773, 570, 832, 629]],
];

const FORTRESSES = [
  [1, [237, 828, 242, 833], [210, 801, 269, 860]],
  [2, [237, 606, 242, 611], [210, 579, 269, 638]],
  [3, [237, 348, 242, 353], [210, 321, 269, 380]],
  [4, [366, 237, 371, 242], [339, 210, 398, 269]],
  [5, [588, 237, 593, 242], [561, 210, 620, 269]],
  [6, [846, 237, 851, 242], [819, 210, 878, 269]],
  [7, [957, 348, 962, 353], [930, 321, 989, 380]],
  [8, [957, 606, 962, 611], [930, 579, 989, 638]],
  [9, [957, 828, 962, 833], [930, 801, 989, 860]],
  [10, [846, 957, 851, 962], [819, 930, 878, 989]],
  [11, [606, 957, 611, 962], [579, 930, 638, 989]],
  [12, [366, 957, 371, 962], [339, 930, 398, 989]],
];

const ENGINEERING = [
  [1, "construction", [1068, 138, 1070, 140], [1062, 132, 1076, 146]],
  [1, "construction", [537, 138, 539, 140], [531, 132, 545, 146]],
  [1, "construction", [138, 138, 140, 140], [132, 132, 146, 146]],
  [1, "construction", [138, 666, 140, 668], [132, 660, 146, 674]],
  [1, "construction", [138, 1038, 140, 1040], [132, 1032, 146, 1046]],
  [1, "construction", [666, 1068, 668, 1070], [660, 1062, 674, 1076]],
  [1, "construction", [1068, 1068, 1070, 1070], [1062, 1062, 1076, 1076]],
  [1, "construction", [1068, 567, 1070, 569], [1062, 561, 1076, 575]],
  [1, "gathering", [957, 138, 959, 140], [951, 132, 965, 146]],
  [1, "gathering", [537, 87, 539, 89], [531, 81, 545, 95]],
  [1, "gathering", [138, 237, 140, 239], [132, 231, 146, 245]],
  [1, "gathering", [87, 666, 89, 668], [81, 660, 95, 674]],
  [1, "gathering", [267, 1068, 269, 1070], [261, 1062, 275, 1076]],
  [1, "gathering", [636, 1137, 638, 1139], [630, 1131, 644, 1145]],
  [1, "gathering", [1068, 936, 1070, 938], [1062, 930, 1076, 944]],
  [1, "gathering", [1137, 567, 1139, 569], [1131, 561, 1145, 575]],
  [1, "production", [768, 138, 770, 140], [762, 132, 776, 146]],
  [1, "production", [237, 138, 239, 140], [231, 132, 245, 146]],
  [1, "production", [138, 327, 140, 329], [132, 321, 146, 335]],
  [1, "production", [138, 957, 140, 959], [132, 951, 146, 965]],
  [1, "production", [327, 1038, 329, 1040], [321, 1032, 335, 1046]],
  [1, "production", [957, 1068, 959, 1070], [951, 1062, 965, 1076]],
  [1, "production", [1068, 747, 1070, 749], [1062, 741, 1076, 755]],
  [1, "production", [1068, 237, 1070, 239], [1062, 231, 1076, 245]],
  [1, "technology", [936, 537, 939, 539], [930, 531, 944, 545]],
  [1, "technology", [957, 957, 959, 959], [951, 951, 965, 965]],
  [1, "technology", [537, 936, 539, 938], [531, 930, 545, 944]],
  [1, "technology", [237, 957, 239, 959], [231, 951, 245, 965]],
  [1, "technology", [267, 537, 269, 539], [261, 531, 275, 545]],
  [1, "technology", [237, 237, 239, 239], [231, 231, 245, 245]],
  [1, "technology", [666, 267, 668, 269], [660, 261, 674, 275]],
  [1, "technology", [957, 237, 959, 239], [951, 231, 965, 245]],
  [2, "defense", [957, 438, 959, 440], [951, 432, 965, 446]],
  [2, "defense", [738, 957, 740, 959], [732, 951, 746, 965]],
  [2, "defense", [237, 768, 239, 770], [231, 762, 245, 776]],
  [2, "defense", [438, 267, 440, 269], [432, 261, 446, 275]],
  [2, "defense", [666, 138, 668, 140], [660, 132, 674, 146]],
  [2, "defense", [138, 537, 140, 539], [132, 531, 146, 545]],
  [2, "defense", [537, 1038, 539, 1040], [531, 1032, 545, 1046]],
  [2, "defense", [1068, 666, 1070, 668], [1062, 660, 1076, 674]],
  [2, "training", [957, 747, 959, 749], [951, 741, 965, 755]],
  [2, "training", [486, 957, 488, 959], [480, 951, 494, 965]],
  [2, "training", [237, 486, 239, 488], [231, 480, 245, 494]],
  [2, "training", [768, 237, 770, 239], [762, 231, 776, 245]],
  [2, "training", [486, 138, 488, 140], [480, 132, 494, 146]],
  [2, "training", [138, 747, 140, 749], [132, 741, 146, 755]],
  [2, "training", [768, 1038, 770, 1040], [762, 1032, 776, 1046]],
  [2, "training", [1068, 486, 1070, 488], [1062, 480, 1076, 494]],
  [2, "weapon", [867, 138, 869, 140], [861, 132, 875, 146]],
  [2, "weapon", [366, 138, 368, 140], [360, 132, 374, 146]],
  [2, "weapon", [138, 438, 140, 440], [132, 432, 146, 446]],
  [2, "weapon", [138, 867, 140, 869], [132, 861, 146, 875]],
  [2, "weapon", [438, 1068, 440, 1070], [432, 1062, 446, 1076]],
  [2, "weapon", [867, 1068, 869, 1070], [861, 1062, 875, 1076]],
  [2, "weapon", [1068, 867, 1070, 869], [1062, 861, 1076, 875]],
  [2, "weapon", [1068, 327, 1070, 329], [1062, 321, 1076, 335]],
  [3, "construction", [867, 567, 869, 569], [861, 561, 875, 575]],
  [3, "construction", [768, 867, 770, 869], [762, 861, 776, 875]],
  [3, "construction", [327, 666, 329, 668], [321, 660, 335, 674]],
  [3, "construction", [486, 327, 488, 329], [480, 321, 494, 335]],
  [3, "technology", [867, 867, 869, 869], [861, 861, 875, 875]],
  [3, "technology", [327, 327, 329, 329], [321, 321, 335, 335]],
  [3, "technology", [327, 867, 329, 869], [321, 861, 335, 875]],
  [3, "technology", [867, 327, 869, 329], [861, 321, 875, 335]],
  [3, "expedition", [867, 666, 869, 668], [861, 660, 875, 674]],
  [3, "expedition", [486, 867, 488, 869], [480, 861, 494, 875]],
  [3, "expedition", [327, 567, 329, 569], [321, 561, 335, 575]],
  [3, "expedition", [768, 327, 770, 329], [762, 321, 776, 335]],
  [4, "defense", [816, 717, 818, 719], [810, 711, 824, 725]],
  [4, "defense", [387, 717, 389, 719], [381, 711, 395, 725]],
  [4, "defense", [588, 327, 590, 329], [582, 321, 596, 335]],
  [4, "weapon", [816, 486, 818, 488], [810, 480, 824, 494]],
  [4, "weapon", [588, 867, 590, 869], [582, 861, 596, 875]],
  [4, "weapon", [387, 486, 389, 488], [381, 480, 395, 494]],
];

export const engineeringTypeNames = {
  construction: "建工工程站",
  gathering: "采集工程站",
  production: "生产工程站",
  technology: "科技工程站",
  defense: "防御工程站",
  training: "训练工程站",
  weapon: "武器工程站",
  expedition: "远征工程站",
};

function buildPresetEntities() {
  const list = [];
  for (const z of ZONES) {
    list.push({
      id: z.id,
      title: z.title,
      group: "zones",
      subType: z.subType,
      bounds: z.bounds,
      blocking: false,
      meta: { 类型: "地理区域" },
    });
  }
  for (const s of SUN_CITY) {
    list.push({
      id: s.id,
      title: s.title,
      group: "sunCity",
      subType: s.subType,
      bounds: s.bounds,
      blocking: s.blocking,
      meta: { 类型: "太阳城设施" },
    });
  }
  for (const [num, body, ruins] of STRONGHOLDS) {
    list.push({
      id: `stronghold_${num}`,
      title: `${num}号要塞`,
      group: "strongholds",
      subType: "stronghold",
      bounds: body,
      blocking: true,
      meta: { 类型: "要塞主体", 编号: num },
    });
    list.push({
      id: `stronghold_ruins_${num}`,
      title: `${num}号要塞废墟`,
      group: "strongholds",
      subType: "strongholdRuins",
      bounds: ruins,
      blocking: false,
      meta: { 类型: "要塞废墟", 编号: num },
    });
  }
  for (const [num, body, ruins] of FORTRESSES) {
    list.push({
      id: `fortress_${num}`,
      title: `${num}号堡垒`,
      group: "fortresses",
      subType: "fortress",
      bounds: body,
      blocking: true,
      meta: { 类型: "堡垒主体", 编号: num },
    });
    list.push({
      id: `fortress_ruins_${num}`,
      title: `${num}号堡垒废墟`,
      group: "fortresses",
      subType: "fortressRuins",
      bounds: ruins,
      blocking: false,
      meta: { 类型: "堡垒废墟", 编号: num },
    });
  }
  ENGINEERING.forEach(([level, type, body, scorched], index) => {
    const name = engineeringTypeNames[type] || "工程站";
    list.push({
      id: `eng_${level}_${index}`,
      title: `${level}级${name}`,
      group: "engineering",
      subType: type,
      level,
      bounds: body,
      blocking: true,
      meta: { 类型: name, 等级: level },
    });
    list.push({
      id: `eng_scorched_${level}_${index}`,
      title: `${name}·焦土`,
      group: "engineering",
      subType: "scorched",
      level,
      bounds: scorched,
      blocking: false,
      meta: { 类型: "焦土范围", 等级: level },
    });
  });
  return list;
}

export const presetEntities = Object.freeze(buildPresetEntities());
export const blockingPresets = Object.freeze(presetEntities.filter((e) => e.blocking));
