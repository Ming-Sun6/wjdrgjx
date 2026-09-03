export const engineeringBuffs = {
  construction: { building: "建工工程站", attr: "建造速度", levels: ["+5.0%", "-", "+8.0%", "-"] },
  gathering: { building: "采集工程站", attr: "资源采集速度", levels: ["+5.0%", "-", "-", "-"] },
  production: { building: "生产工程站", attr: "资源生产速度", levels: ["+5.0%", "-", "-", "-"] },
  technology: { building: "科技工程站", attr: "研究速度", levels: ["+5.0%", "-", "+8.0%", "-"] },
  weapon: { building: "武器工程站", attr: "部队攻击力", levels: ["-", "+5.0%", "-", "+8.0%"] },
  training: { building: "训练工程站", attr: "训练速度", levels: ["-", "+5.0%", "-", "-"] },
  defense: { building: "防御工程站", attr: "部队防御力", levels: ["-", "+5.0%", "-", "+8.0%"] },
  expedition: { building: "远征工程站", attr: "部队出征速度", levels: ["-", "-", "+15.0%", "-"] },
};

export const engineeringTypeOrder = [
  "construction",
  "gathering",
  "production",
  "technology",
  "weapon",
  "training",
  "defense",
  "expedition",
];

export const fortressRewards = {
  title: "堡垒奖励",
  categories: [
    {
      key: "victory",
      name: "胜利奖励",
      items: [
        {
          name: "参与奖励",
          fields: [
            ["数量", "1（每个领主1个）"],
            ["奖励内容", "100钻石×4，1小时训练加速×10，1小时治疗加速×10，5000点英雄经验×5"],
            ["获取条件", "参与争夺的领主可以获得"],
          ],
        },
        {
          name: "联盟奖励",
          fields: [
            ["数量", "1（每个领主1个）"],
            ["奖励内容", "100钻石×2，5分钟建造加速×60，5分钟研究加速×60，1000生肉×400，1000木材×400，1000煤矿×80，1000铁矿×20"],
            ["获取条件", "争夺成功后所在联盟的全部领主均可以获得"],
          ],
        },
        {
          name: "可分配奖励",
          fields: [
            ["数量", "40（总数）"],
            ["奖励内容", "白银钥匙×2，5分钟通用加速×10，1000生肉×200，1000木材×200，1000煤矿×40，1000铁矿×10"],
            ["获取条件", "争夺成功后所在联盟的4阶和5阶人员，可为联盟中的领主分配该奖励"],
          ],
        },
      ],
    },
    {
      key: "control",
      name: "控制奖励",
      items: [
        {
          name: "联盟奖励",
          fields: [
            ["数量", "1（每个领主1个）"],
            ["奖励内容", "黄金钥匙×1，白银钥匙×2，5000点英雄经验×2"],
            ["获取条件", "争夺成功后所在联盟的全部领主均可以获得"],
          ],
        },
      ],
    },
    {
      key: "special",
      name: "堡垒特别奖励",
      items: [{ name: "可分配奖励", fields: [["说明", "根据每个赛季不同期数来动态变化"]] }],
    },
  ],
};

export const strongholdRewards = {
  title: "要塞奖励",
  categories: [
    {
      key: "victory",
      name: "胜利奖励",
      items: [
        {
          name: "参与奖励",
          fields: [
            ["数量", "2（每个领主2个）"],
            ["奖励内容", "100钻石×4，1小时训练加速×10，1小时治疗加速×10，5000点英雄经验×5"],
            ["获取条件", "参与争夺的领主可以获得"],
          ],
        },
        {
          name: "联盟奖励",
          fields: [
            ["数量", "2（每个领主2个）"],
            ["奖励内容", "100钻石×2，5分钟建造加速×60，5分钟研究加速×60，1000生肉×400，1000木材×400，1000煤矿×80，1000铁矿×20"],
            ["获取条件", "争夺成功后所在联盟的全部领主均可以获得"],
          ],
        },
        {
          name: "可分配奖励",
          fields: [
            ["数量", "100（总数）"],
            ["奖励内容", "白银钥匙×2，5分钟通用加速×10，1000生肉×200，1000木材×200，1000煤矿×40，1000铁矿×10"],
            ["获取条件", "争夺成功后所在联盟的4阶和5阶人员，可为联盟中的领主分配该奖励"],
          ],
        },
      ],
    },
    {
      key: "control",
      name: "控制奖励",
      items: [
        {
          name: "联盟奖励",
          fields: [
            ["数量", "2（每个领主2个）"],
            ["奖励内容", "黄金钥匙×1，白银钥匙×2，5000点英雄经验×2"],
            ["获取条件", "争夺成功后所在联盟的全部领主均可以获得"],
          ],
        },
      ],
    },
    {
      key: "special",
      name: "要塞特别奖励",
      items: [{ name: "可分配奖励", fields: [["说明", "根据每个赛季不同期数来动态变化"]] }],
    },
  ],
};

export const rotationItems = {
  1: { short: "传说信物×200", full: "传说英雄信物（200个）" },
  2: { short: "传说信物×420", full: "传说英雄信物（420个）" },
  3: { short: "生命2阶×60", full: "部队生命提升2阶（12小时）（60个）" },
  4: { short: "通用加速×400", full: "1小时通用加速（400个）" },
  5: { short: "高级迁城×90", full: "高级迁城（90个）" },
  6: { short: "史诗信物箱×300", full: "史诗英雄信物自选箱（300个）" },
  7: { short: "英雄经验×300", full: "1万点英雄经验（300个）" },
  8: { short: "出征2阶×60", full: "出征容量提升2阶（12小时）（60个）" },
  9: { short: "探险技能书×600", full: "传说探险技能书（600个）" },
  10: { short: "远征技能书×600", full: "传说远征技能书（600个）" },
  11: { short: "强化零件×500", full: "100点强化经验零件（500个）" },
  12: { short: "穿透2阶×60", full: "部队穿透力提升2阶（12小时）（60个）" },
};

export const ROTATION_PHASES = 8;

export const fortressRotation = {
  1: [1, 3, 4, 5, 6, 3, 4, 7],
  2: [5, 1, 3, 7, 7, 6, 3, 4],
  3: [4, 5, 1, 3, 4, 7, 6, 3],
  4: [3, 4, 5, 9, 5, 4, 7, 6],
  5: [1, 12, 4, 10, 6, 12, 4, 7],
  6: [5, 1, 12, 4, 7, 6, 12, 4],
  7: [4, 5, 1, 5, 4, 7, 6, 12],
  8: [12, 4, 5, 7, 5, 4, 7, 6],
  9: [1, 8, 4, 12, 6, 8, 4, 7],
  10: [5, 1, 8, 9, 7, 6, 8, 4],
  11: [4, 5, 1, 10, 4, 7, 6, 8],
  12: [8, 4, 5, 4, 5, 4, 7, 6],
};

export const strongholdRotation = {
  1: [2, 11, 10, 1, 2, 11, 10, 1],
  2: [9, 2, 11, 10, 9, 2, 11, 10],
  3: [10, 9, 2, 11, 10, 9, 2, 11],
  4: [11, 10, 9, 2, 11, 10, 9, 2],
};

export function rotationCells(kind, num) {
  const table = kind === "fortress" ? fortressRotation : strongholdRotation;
  const row = table[num];
  if (!row) return [];
  return row.map((index, i) => ({
    phase: i + 1,
    index,
    short: rotationItems[index]?.short || "",
    full: rotationItems[index]?.full || "",
  }));
}

export function rotationTable(kind) {
  const table = kind === "fortress" ? fortressRotation : strongholdRotation;
  const suffix = kind === "fortress" ? "号堡垒" : "号要塞";
  return Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b)
    .map((num) => ({
      num,
      title: `${num}${suffix}`,
      cells: rotationCells(kind, num),
    }));
}

export const kingcityRewards = {
  title: "王城特权",
  subtitle: "太阳城 · 王国之心",
  categories: [
    {
      key: "consul",
      name: "执政官奖励",
      items: [
        { name: "加成奖励", fields: [["训练速度", "+50.00%"], ["训练容量", "+200"]] },
        {
          name: "礼包奖励",
          fields: [["内容", "2万钻石×1，100点强化经验零件×20，1万点英雄经验×5，3小时通用加速×10，1万生肉×200，1万木材×200，1万煤矿×40，1万铁矿×10"]],
        },
        { name: "装扮奖励", fields: [["城镇装扮", "耀日之辉"], ["行军装扮", "佛尔工号"]] },
        { name: "执政宣言", fields: [["说明", "可向整个王国的领主发出通告"]] },
      ],
    },
    {
      key: "appoint",
      name: "官职任命",
      tabs: [
        {
          name: "任命官员",
          note: "只有执政官和内政部长可以执行",
          items: [
            { name: "副执政官", fields: [["建造速度", "+10.00%"], ["研究速度", "+10.00%"], ["训练速度", "+10.00%"]] },
            { name: "内政部长", fields: [["资源生产速度", "+10.00%"]] },
            { name: "卫生部长", fields: [["治疗速度", "+100.00%"], ["军医所容量", "+5000"]] },
            { name: "国防部长", fields: [["部队穿透力", "+10.00%"]] },
            { name: "战略部长", fields: [["部队攻击力", "+10.00%"], ["出征部队容量", "+2500"]] },
            { name: "教育部长", fields: [["训练速度", "+50.00%"], ["训练容量", "+200"]] },
          ],
        },
        {
          name: "降下惩罚",
          note: "只有执政官和内政部长可以执行",
          items: [
            { name: "枯竭之罚", fields: [["建造速度", "-10.00%"], ["研究速度", "-10.00%"], ["训练速度", "-10.00%"]] },
            { name: "禁锢之罚", fields: [["资源生产速度", "-40.00%"]] },
            { name: "苦痛之罚", fields: [["治疗速度", "-15.00%"], ["军医所容量", "-2500"]] },
            { name: "折剑之罚", fields: [["部队穿透力", "-5.00%"]] },
            { name: "封印之罚", fields: [["部队攻击力", "-2.00%"], ["出征部队容量", "-1500"]] },
            { name: "滞钝之罚", fields: [["训练速度", "-25.00%"], ["训练容量", "-100"]] },
          ],
        },
      ],
    },
    {
      key: "skill",
      name: "执政官技能",
      items: [
        { name: "收纳贡品", fields: [["次数", "3"], ["效果", "消耗27000点统治力，换取300、400、500钻石"]] },
        { name: "医疗助力", fields: [["次数", "2"], ["效果", "24小时内，本王国所有领主的治疗伤兵速度提升50.00%"]] },
        { name: "重商主义", fields: [["次数", "2"], ["效果", "24小时内，本王国所有领主的建造速度提升10.00%"]] },
        { name: "研发助力", fields: [["次数", "2"], ["效果", "24小时内，本王国所有领主的研究速度提升10.00%"]] },
        { name: "战斗动员", fields: [["次数", "2"], ["效果", "24小时内，本王国所有领主的部队训练速度提升30.00%"]] },
        { name: "停火律令", fields: [["次数", "14"], ["效果", "使一个领主在1小时内无法挑战其他领主"]] },
        { name: "强制驱逐", fields: [["次数", "14"], ["效果", "强制使一个领主的城镇随机迁移，并立即为该城镇生成1个10小时的防护罩（防护罩时长不叠加，取最大值）"]] },
        { name: "全境搜查", fields: [["次数", "56"], ["效果", "快速找到任意领主的城镇所在地（仅限原王国的领主）"]] },
      ],
    },
    {
      key: "medal",
      name: "授勋",
      items: [
        {
          name: "将军嘉奖",
          fields: [["可授予数量", "1人"], ["奖励", "5000钻石×1，100点强化经验零件×10，1000点英雄经验×10，1小时训练加速×6，1小时治疗加速×6，1小时研究加速×6，1万生肉×100，1万木材×100，1万煤矿×20，1万铁矿×5"]],
        },
        {
          name: "军士嘉奖",
          fields: [["可授予数量", "5人"], ["奖励（每人）", "1000钻石×1，100点强化经验零件×7，1000点英雄经验×10，5分钟训练加速×10，5分钟治疗加速×10，5分钟研究加速×10，1000生肉×200，1000木材×200，1000煤矿×40，1000铁矿×10"]],
        },
        {
          name: "士兵嘉奖",
          fields: [["可授予数量", "30人"], ["奖励（每人）", "500钻石×1，100点强化经验零件×5，1000点英雄经验×5，1000生肉×100，1000木材×100，1000煤矿×20，1000铁矿×5"]],
        },
      ],
    },
  ],
};

export function rewardItemType(name) {
  const text = String(name);
  if (text.includes("钻石")) return "diamond";
  if (text.includes("钥匙")) return "key";
  if (text.includes("加速")) return "speed";
  if (text.includes("零件")) return "part";
  if (text.includes("经验")) return "exp";
  if (/生肉|木材|煤矿|铁矿/.test(text)) return "res";
  if (text.includes("装扮") || text.includes("号")) return "skin";
  return "other";
}

export function isRewardList(value) {
  return typeof value === "string" && value.includes("×");
}

export function parseRewardList(value) {
  return String(value)
    .split("，")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const idx = s.lastIndexOf("×");
      const name = idx >= 0 ? s.slice(0, idx) : s;
      const count = idx >= 0 ? "×" + s.slice(idx + 1) : "";
      return { name, count, type: rewardItemType(name) };
    });
}

export function signClass(value) {
  const text = String(value).trim();
  if (text === "-" || text === "") return "";
  if (text.startsWith("+")) return "gain";
  if (text.startsWith("-")) return "loss";
  return "";
}

export function rewardIconKey(label) {
  const text = String(label);
  if (text.includes("钻石")) return "diamond";
  if (text.includes("零件")) return "expPart";
  if (text.includes("经验")) return "heroExp";
  if (text.includes("加速")) return "speedup";
  if (text.includes("钥匙")) {
    if (text.includes("金")) return "goldKey";
    if (text.includes("银")) return "silverKey";
    return null;
  }
  if (text.includes("肉")) return "meat";
  if (text.includes("木材")) return "wood";
  if (text.includes("煤矿")) return "coal";
  if (text.includes("铁矿")) return "iron";
  if (text.includes("城镇装扮")) return "townSkin";
  if (text.includes("行军装扮")) return "marchSkin";
  return null;
}
