import type {
  HeadHeroDefinition,
  HeadHeroId,
  HeroSkillDefinition,
  SupportedHeroSkillDefinition,
} from "../../domain/hero";
import type { Skill, SkillEffectData } from "../../domain/skill";
import type { TroopType } from "../../domain/troop";

const SOURCE = "用户 v0.4 最新统一规则（2026-09-10）";

export const headHeroes = {
  "hero.head.heketuo": head({
    id: "hero.head.heketuo", name: "赫克托", troopType: "shield", generation: 5,
    weapon: "attack", exclusiveGroupIds: ["head-exclusive.shield-primary"],
    skills: [
      supported("head-skill.heketuo.thunder-strike", "雷霆出击", {
        id: "skill.head.heketuo.thunder-strike", name: "雷霆出击（5级）", trigger: { type: "always" },
        effects: [
          { type: "baseDamageIncrease", value: 2, valueByRound: decay(2), targetTroop: "shield" },
          { type: "baseDamageIncrease", value: 1, valueByRound: decay(1), targetTroop: "marksman" },
        ],
      }, "5级：第1回合盾兵伤害+200%、射手伤害+100%，之后每回合为上一回合的85%，至第10回合。"),
      supported("head-skill.heketuo.gale-strike", "疾风猛击", {
        id: "skill.head.heketuo.gale-strike", name: "疾风猛击（5级）",
        trigger: probability(.25), effects: [extraDamage(1, "all")],
      }, "5级：每回合判定一次，25%概率造成200%总伤害；extraDamage为+100%D，不产生extraAttack。"),
    ],
    notApplicable: [{ name: "生存本能", rawDescription: "降低我方受到的伤害，属于生存效果。" }],
  }),
  "hero.head.fulinte": head({
    id: "hero.head.fulinte", name: "弗林特", troopType: "shield", generation: 2,
    weapon: "none", exclusiveGroupIds: ["head-exclusive.shield-primary"],
    skills: [
      supported("head-skill.fulinte.wildfire", "野火燎原", {
        id: "skill.head.fulinte.wildfire", name: "野火燎原（5级）", trigger: { type: "always" },
        effects: [{ type: "shieldDamage", value: 1, targetTroop: "shield" }],
      }, "5级：使我方盾兵造成伤害提升100%；只作用于盾兵。"),
      supported("head-skill.fulinte.burning-will", "燃烧意志", {
        id: "skill.head.fulinte.burning-will", name: "燃烧意志（5级）", trigger: { type: "always" },
        effects: [{ type: "attack", value: .25, targetTroop: "all" }],
      }, "5级：我军全体部队攻击力提升25%，常驻生效。"),
      supported("head-skill.fulinte.endless-fire", "无尽烈火", {
        id: "skill.head.fulinte.endless-fire", name: "无尽烈火（5级）", trigger: { type: "always" },
        effects: [{ type: "penetration", value: .25, targetTroop: "all" }],
      }, "5级：我军全体部队穿透力提升25%，常驻生效。"),
    ],
  }),
  "hero.head.nimo": head({
    id: "hero.head.nimo", name: "尼莫", troopType: "shield", generation: 1,
    weapon: "attack", exclusiveGroupIds: ["head-exclusive.shield-primary"], skills: [
      supported("head-skill.nimo.prebattle-declaration", "战前宣言", {
        id: "skill.head.nimo.prebattle-declaration", name: "战前宣言（5级）", trigger: { type: "always" },
        effects: [{ type: "penetration", value: .25, targetTroop: "all" }],
      }, "5级：全体部队穿透+25%，常驻生效。"),
      supported("head-skill.nimo.swordsmanship-guidance", "剑术指导", {
        id: "skill.head.nimo.swordsmanship-guidance", name: "剑术指导（5级）", trigger: { type: "always" },
        effects: [{ type: "attack", value: .25, targetTroop: "all" }],
      }, "5级：全体部队攻击+25%，常驻生效。"),
      supported("head-skill.nimo.exquisite-swordsmanship", "精湛剑术", {
        id: "skill.head.nimo.exquisite-swordsmanship", name: "精湛剑术（5级）", trigger: { type: "always" },
        effects: [{ type: "baseDamageIncrease", value: .30, targetTroop: "all", activeRounds: [5, 6, 9, 10] }],
      }, "5级：每4回合触发一次、持续2回合，首次round5；round5、6、9、10全体部队造成伤害+30%。"),
    ],
    exploration: ["三断斩", "剑气", "孤傲"].map((name) => ({ name, rawDescription: "已确认属于探险技能，不是远征技能。" })),
  }),
  "hero.head.miya": head({
    id: "hero.head.miya", name: "米娅", troopType: "lancer", generation: 3, weapon: "attack",
    skills: [
      supported("head-skill.miya.doom-entanglement", "厄运缠身", miaVulnerableSkill("skill.head.miya.doom-entanglement"), "5级：三兵种每回合各一次普通攻击，每次50%独立触发；同回合不叠加，下一回合vulnerable+50%。"),
      supported("head-skill.miya.lucky-blessing", "幸运加护", {
        id: "skill.head.miya.lucky-blessing", name: "幸运加护（5级）", trigger: probability(.5),
        effects: [{ type: "baseDamageIncrease", value: .5, targetTroop: "all" }],
      }, "5级：每回合独立判定一次，50%概率使当前回合基础增伤+50%；仅当回合生效。"),
    ],
    notApplicable: [{ name: "秘火解读", rawDescription: "40%概率降低敌方伤害，只影响敌方输出。" }],
  }),
  "hero.head.jinman": marksmanHead("hero.head.jinman", "津曼", 1, "none", [
    supported("head-skill.jinman.penetration", "远征穿透", {
      id: "skill.head.jinman.penetration", name: "远征穿透（5级）", trigger: { type: "always" },
      effects: [{ type: "penetration", value: .25, targetTroop: "all" }],
    }, "5级：我军全体部队穿透+25%，round1至round10常驻生效。"),
  ], [
    { name: "防御与生命提升", rawDescription: "5级：全军防御+10%、全军生命+10%，不影响我方对熊输出。" },
    { name: "建筑增益", rawDescription: "建筑资源/速度效果属于非战斗效果，不进入打熊计算。" },
  ]),
  "hero.head.alongsuo": marksmanHead("hero.head.alongsuo", "阿隆索", 2, "penetration", [
    supported("head-skill.alongsuo.penetration", "穿透提升", {
      id: "skill.head.alongsuo.penetration", name: "穿透提升（5级）", trigger: probability(.4),
      effects: [{ type: "penetration", value: .5, targetTroop: "all" }],
    }, "5级：每回合40%概率使全军穿透+50%，当回合生效，持续1回合。"),
    supported("head-skill.alongsuo.damage", "概率伤害提升", {
      id: "skill.head.alongsuo.damage", name: "概率伤害提升（5级）", trigger: probability(.5),
      effects: [{ type: "baseDamageIncrease", value: .5, targetTroop: "all" }],
    }, "5级：每回合判定一次，50%概率使当前伤害+50%，仅当回合生效。"),
  ], [{ name: "降低敌军伤害", rawDescription: "只影响敌方输出。" }]),
  "hero.head.geleige": marksmanHead("hero.head.geleige", "格雷格", 3, "none", [
    supported("head-skill.geleige.damage-refresh", "全军伤害提升", {
      id: "skill.head.geleige.damage-refresh", name: "全军伤害提升（5级）",
      trigger: { type: "probability", probability: .20, triggerPhase: "roundStart", frequency: "oncePerRound", durationRounds: 3 },
      lifecycle: { durationRounds: 3, activationTiming: "immediate", refreshMode: "refresh" },
      effects: [{ type: "baseDamageIncrease", value: .40, targetTroop: "all" }],
    }, "5级：每回合20%概率使全军伤害+40%，当回合生效并持续3回合；重复触发刷新持续时间，不叠加幅度。"),
  ], [
    { name: "敌军伤害降低", rawDescription: "20%概率使敌军伤害降低50%，持续2回合；只影响敌方输出。" },
    { name: "全军生命提升", rawDescription: "5级：全军生命+25%，不影响我方对熊输出。" },
  ]),
  "hero.head.linen": marksmanHead("hero.head.linen", "琳恩", 4, "none", [
    supported("head-skill.linen.penetration", "概率穿透提升", {
      id: "skill.head.linen.penetration", name: "概率穿透提升（5级）", trigger: probability(.40),
      effects: [{ type: "penetration", value: .50, targetTroop: "all" }],
    }, "5级：每回合判定一次，40%概率使全军穿透+50%，仅当回合生效。"),
    supported("head-skill.linen.marksman-attack-stacks", "射手攻击叠层", {
      id: "skill.head.linen.marksman-attack-stacks", name: "射手攻击叠层（5级）",
      trigger: { type: "everyNRounds", interval: 3, firstTriggerRound: 3, triggerPhase: "afterAttack" },
      lifecycle: { activationTiming: "nextRound", refreshMode: "stack", maxStacks: 3, atMaxStacks: "keep" },
      normalAttackCounter: { counterId: "counter.linen.marksman-normal", troopType: "marksman", attacksPerTrigger: 3, firstTriggerAttack: 3, counts: "normalAttackOnly" },
      effects: [{
        type: "attack", value: .05, valuePerStack: .05, targetTroop: "marksman",
        triggerApplication: "stack",
      }],
    }, "5级：射手每3次普通攻击后获得一层射手攻击+5%，可叠加至战斗结束；round4首次享受第一层，round7第二层，round10第三层。"),
  ], [{ name: "降低敌军穿透", rawDescription: "敌军穿透-20%，只影响敌方输出。" }]),
  "hero.head.gewen": marksmanHead("hero.head.gewen", "格温", 5, "penetration", [
    supported("head-skill.gewen.vulnerable", "易伤", {
      id: "skill.head.gewen.vulnerable", name: "易伤（5级）",
      trigger: { type: "probability", probability: 1, triggerPhase: "roundStart", frequency: "oncePerBattle", durationRounds: 9 },
      lifecycle: { durationRounds: 9, activationTiming: "nextRound", refreshMode: "replace" },
      effects: [{ type: "vulnerable", value: .25, targetTroop: "all" }],
    }, "5级：round1施加，round2开始vulnerable+25%。"),
    ...sixthAttackSpecialSkills("gewen"),
  ]),
  "hero.head.buladeli": marksmanHead("hero.head.buladeli", "布拉德利", 7, "none", [
    supported("head-skill.buladeli.attack", "全军攻击提升", {
      id: "skill.head.buladeli.attack", name: "全军攻击提升（5级）", trigger: { type: "always" },
      effects: [{ type: "attack", value: .25, targetTroop: "all" }],
    }, "5级：全军攻击+25%，round1至round10常驻生效。"),
    supported("head-skill.buladeli.troop-counter", "兵种克制增伤", {
      id: "skill.head.buladeli.troop-counter", name: "兵种克制增伤（5级）", trigger: { type: "always" },
      effects: [{ type: "troopVsTroopDamage", value: .25, valueByEnemyTroop: { shield: .25, lancer: .30 }, targetTroop: "all" }],
    }, "5级：对矛伤害+30%，对盾伤害+25%；巨熊为盾。"),
    supported("head-skill.buladeli.cycle", "三技能循环", {
      id: "skill.head.buladeli.cycle", name: "三技能循环（5级）", trigger: { type: "always" },
      effects: [{ type: "baseDamageIncrease", value: .30, targetTroop: "all", activeRounds: [5, 6, 9, 10] }],
    }, "5级：round5、round6、round9、round10的基础增伤+30%。"),
  ]),
  "hero.head.weien": marksmanHead("hero.head.weien", "韦恩", 6, "none", [
    supported("head-skill.weien.periodic-extra", "周期额外打击", {
      id: "skill.head.weien.periodic-extra", name: "周期额外打击（5级）",
      trigger: { type: "everyNRounds", interval: 4, firstTriggerRound: 4, triggerPhase: "beforeAttack" },
      effects: [extraDamage(1, "all")],
    }, "5级：首次round4、之后每4回合触发；10回合内round4、round8造成100% extraDamage，不产生extraAttack。"),
    supported("head-skill.weien.critical", "暴击", {
      id: "skill.head.weien.critical", name: "暴击（5级）",
      trigger: { type: "probability", probability: .25, triggerPhase: "onAttack", frequency: "oncePerRound", independentTroopTargets: ["shield", "lancer", "marksman"] },
      critProbability: .25,
      critMultiplier: 2,
      critAppliesTo: "normalAttackOnly",
      effects: [{ type: "normalAttackDamageIncrease", value: 1, targetTroop: "all" }],
    }, "5级：每回合盾、矛、射普通攻击分别独立进行一次25%暴击判定；触发时普通攻击×2，不作用于extraDamage或skillDamage。"),
  ], [{ name: "兵种目标额外伤害", rawDescription: "只对矛兵/射手目标生效；巨熊为盾兵，不适用。" }]),
  "hero.head.xiula": marksmanHead("hero.head.xiula", "修拉", 9, "none", [
    supported("head-skill.xiula.counter-strike", "射手攻击计数", {
      id: "skill.head.xiula.counter-strike", name: "射手攻击计数（5级）", trigger: { type: "always" },
      normalAttackCounter: { counterId: "counter.xiula.marksman-normal", troopType: "marksman", attacksPerTrigger: 2, firstTriggerAttack: 2, counts: "normalAttackOnly" },
      effects: [
        { ...extraDamage(1, "marksman"), activeRounds: [2, 4, 6, 8, 10] },
        { type: "vulnerable", value: .25, targetTroop: "all", activeRounds: [3, 5, 7, 9] },
      ],
    }, "5级：射手每2次普通攻击触发；round2/4/6/8/10造成100% extraDamage，并使下一回合vulnerable+25%（round3/5/7/9生效）。"),
    supported("head-skill.xiula.marksman-damage", "射手伤害提升", {
      id: "skill.head.xiula.marksman-damage", name: "射手伤害提升（5级）", trigger: { type: "always" },
      effects: [{ type: "marksmanDamage", value: .10, targetTroop: "marksman" }],
    }, "5级：射手造成伤害+10%，round1至round10常驻生效。"),
  ], [{ name: "我方受到伤害降低", rawDescription: "只影响我方承伤，不影响我方对熊输出。" }]),
  "hero.head.hengdelike": marksmanHead("hero.head.hengdelike", "亨德里克", 8, "attack", [
    supported("head-skill.hengdelike.defense-reduction", "减防", {
      id: "skill.head.hengdelike.defense-reduction", name: "减防（5级）", trigger: { type: "always" },
      effects: [{ type: "defenseReduction", value: .25, targetTroop: "all" }],
    }, "5级：敌方防御降低25%，等效倍率1.25。"),
    supported("head-skill.hengdelike.round3-extra", "第三技能", {
      id: "skill.head.hengdelike.round3-extra", name: "第三技能（5级）", trigger: { type: "always" },
      effects: [{ ...extraDamage(.40, "all"), activeRounds: [3, 6, 9] }],
    }, "5级：每3回合触发一次；round3、round6、round9造成40% extraDamage，以当前普通攻击伤害为basis，不产生额外攻击事件。"),
  ], [{ name: "第二技能", rawDescription: "只影响敌方输出。" }]),
  "hero.head.bulanqi": marksmanHead("hero.head.bulanqi", "布兰琪", 10, "penetration", [
    supported("head-skill.bulanqi.penetration", "全军穿透", {
      id: "skill.head.bulanqi.penetration", name: "全军穿透（5级）", trigger: { type: "always" },
      effects: [{ type: "penetration", value: .25, targetTroop: "all" }],
    }, "5级：全军穿透+25%。"),
    supported("head-skill.bulanqi.extra-damage", "额外伤害", {
      id: "skill.head.bulanqi.extra-damage", name: "额外伤害（5级）", trigger: { type: "always" },
      effects: [{ ...extraDamage(.75, "all"), activeRounds: [3, 6, 9] }],
    }, "5级：每3回合触发一次，首次round3；round3、round6、round9造成75% extraDamage，不产生extraAttack。"),
  ], [{ name: "第三技能", rawDescription: "只针对矛兵/射手目标；巨熊为盾，不适用。" }]),
  "hero.head.lufusi": marksmanHead("hero.head.lufusi", "鲁弗斯", 11, "attack", [
    supported("head-skill.lufusi.fire-warband", "火焰战团", {
      id: "skill.head.lufusi.fire-warband", name: "火焰战团（5级）", trigger: { type: "always" },
      effects: [{ type: "attack", value: .25, targetTroop: "all" }],
    }, "5级：全军攻击+25%。"),
    supported("head-skill.lufusi.armor-breaking-extra", "碎甲一击·额外伤害", {
      id: "skill.head.lufusi.armor-breaking-extra", name: "碎甲一击·额外伤害（5级）", trigger: { type: "always" },
      effects: [extraDamage(.60, "all")],
    }, "5级：每次普通攻击造成60% extraDamage，不产生extraAttack。"),
    supported("head-skill.lufusi.armor-breaking-vulnerable", "碎甲一击·易伤", {
      id: "skill.head.lufusi.armor-breaking-vulnerable", name: "碎甲一击·易伤（5级）",
      trigger: { type: "probability", probability: 1, triggerPhase: "roundStart", frequency: "oncePerRound", durationRounds: 1 },
      lifecycle: { durationRounds: 1, activationTiming: "nextRound", refreshMode: "refresh" },
      effects: [{ type: "vulnerable", value: .25, targetTroop: "all" }],
    }, "5级：每回合施加vulnerable+25%，下一回合生效，持续1回合；round10施加的效果不进入本场。"),
  ], [{ name: "暴烈震慑", rawDescription: "降低敌方穿透，只影响敌方输出。" }]),
  "hero.head.lijijia": marksmanHead("hero.head.lijijia", "丽姬娅", 12, "none", [
    supported("head-skill.lijijia.defense-reduction", "敌军防御降低", {
      id: "skill.head.lijijia.defense-reduction", name: "敌军防御降低（5级）", trigger: { type: "always" },
      effects: [{ type: "defenseReduction", value: .25, targetTroop: "all" }],
    }, "5级：敌军防御-25%，round1至round10常驻生效；按已确认减防乘区1+Σr结算。"),
    supported("head-skill.lijijia.counter-extra-vulnerable", "射手攻击计数·额伤与易伤", {
      id: "skill.head.lijijia.counter-extra-vulnerable", name: "射手攻击计数·额伤与易伤（5级）", trigger: { type: "always" },
      normalAttackCounter: sharedLygiaCounter(),
      effects: [
        { ...extraDamage(1, "marksman"), activeRounds: [2, 4, 6, 8, 10] },
        { type: "vulnerable", value: .25, targetTroop: "all", activeRounds: [3, 5, 7, 9] },
      ],
    }, "5级：共享射手普通攻击计数器；round2/4/6/8/10造成100% extraDamage，并使下一回合vulnerable+25%（round3/5/7/9生效）。"),
    supported("head-skill.lijijia.counter-extra", "射手攻击计数·额外伤害", {
      id: "skill.head.lijijia.counter-extra", name: "射手攻击计数·额外伤害（5级）", trigger: { type: "always" },
      normalAttackCounter: sharedLygiaCounter(),
      effects: [{ ...extraDamage(1, "marksman"), activeRounds: [2, 4, 6, 8, 10] }],
    }, "5级：与上一技能共享同一个射手普通攻击计数器；round2/4/6/8/10同时追加100% extraDamage。敌军伤害降低部分不影响我方输出。"),
  ]),
  "hero.head.wuerkanusi": marksmanHead("hero.head.wuerkanusi", "乌尔卡努丝", 13, "none", [
    ...sixthAttackSpecialSkills("wuerkanusi"),
    supported("head-skill.wuerkanusi.round3-cycle", "三回合爆发", {
      id: "skill.head.wuerkanusi.round3-cycle", name: "三回合爆发（5级）", trigger: { type: "always" },
      effects: [
        { type: "defenseReduction", value: .60, targetTroop: "all", activeRounds: [3, 6, 9] },
        { type: "attack", value: .60, targetTroop: "marksman", activeRounds: [3, 6, 9] },
      ],
    }, "5级：首次round3、每3回合触发；round3/6/9使敌方盾/矛防御-60%，打熊使用减防+60%，同时射手攻击+60%，仅当回合生效。"),
  ], [{ name: "敌军攻击降低", rawDescription: "敌军攻击-20%，只影响敌方输出。" }]),
  "hero.head.kala": marksmanHead("hero.head.kala", "卡拉", 14, "none", [
    supported("head-skill.kala.normal-attack", "全军普通攻击伤害", {
      id: "skill.head.kala.normal-attack", name: "全军普通攻击伤害（5级）", trigger: { type: "always" },
      effects: [{ type: "normalAttackDamageIncrease", value: .30, targetTroop: "all" }],
    }, "5级：全军普通攻击伤害+30%，round1至round10常驻生效。"),
  ], [
    { name: "敌军穿透降低", rawDescription: "敌军穿透-20%，只影响敌方输出。" },
    { name: "兵种目标额外伤害", rawDescription: "只对矛兵/射手目标生效；巨熊为盾兵，不适用。" },
  ]),
  "hero.head.weiweika": marksmanHead("hero.head.weiweika", "维薇卡", 15, "none", [
    supported("head-skill.weiweika.attack", "全军攻击提升", {
      id: "skill.head.weiweika.attack", name: "全军攻击提升（5级）", trigger: { type: "always" },
      effects: [{ type: "attack", value: .25, targetTroop: "all" }],
    }, "5级：全军攻击+25%，round1至round10常驻生效。"),
    supported("head-skill.weiweika.independent-extra", "独立概率额外伤害", {
      id: "skill.head.weiweika.independent-extra", name: "独立概率额外伤害（5级）",
      trigger: { type: "probability", probability: .20, triggerPhase: "onAttack", frequency: "oncePerRound", independentTroopTargets: ["shield", "lancer", "marksman"] },
      effects: [extraDamage(1, "all")],
    }, "5级：每回合盾、矛、射三个普通攻击分别独立进行一次20%判定；每次成功只为对应兵种追加100% extraDamage。"),
    supported("head-skill.weiweika.marksman-damage", "射手伤害提升", {
      id: "skill.head.weiweika.marksman-damage", name: "射手伤害提升（5级）", trigger: { type: "always" },
      effects: [{ type: "marksmanDamage", value: .10, targetTroop: "marksman" }],
    }, "5级：射手造成伤害+10%，round1至round10常驻生效。"),
  ]),
  "hero.head.aishilin": marksmanHead("hero.head.aishilin", "艾诗琳", 16, "none", [
    supported("head-skill.aishilin.damage", "全军伤害提升", {
      id: "skill.head.aishilin.damage", name: "全军伤害提升（5级）", trigger: { type: "always" },
      effects: [{ type: "baseDamageIncrease", value: .20, targetTroop: "all" }],
    }, "5级：全军伤害+20%，round1至round10常驻生效。"),
    supported("head-skill.aishilin.periodic-marksman-damage", "周期射手伤害", {
      id: "skill.head.aishilin.periodic-marksman-damage", name: "周期射手伤害（5级）", trigger: { type: "always" },
      effects: [{ type: "marksmanDamage", value: 1.50, targetTroop: "marksman", activeRounds: [3, 6, 9] }],
    }, "5级：首次round3、每3回合触发；round3/6/9射手伤害+150%，仅当回合生效。敌军伤害降低部分不影响我方输出。"),
    supported("head-skill.aishilin.periodic-extra", "周期射手额外伤害", {
      id: "skill.head.aishilin.periodic-extra", name: "周期射手额外伤害（5级）", trigger: { type: "always" },
      effects: [{ ...extraDamage(.40, "marksman"), activeRounds: [3, 6, 9] }],
    }, "5级：首次round3、每3回合触发；round3/6/9射手对敌军全体造成40% extraDamage，仅作用于射手攻击。"),
  ]),
} as const satisfies Record<HeadHeroId, HeadHeroDefinition>;

function sixthAttackSpecialSkills(heroKey: string): readonly HeroSkillDefinition[] {
  const counter = {
    counterId: `counter.${heroKey}.all-troops-normal`,
    troopType: "allIndependent" as const,
    attacksPerTrigger: 5,
    firstTriggerAttack: 6,
    counts: "normalAttackOnly" as const,
  };
  return [
    supported(`head-skill.${heroKey}.special-damage`, "第6次攻击特殊伤害", {
      id: `skill.head.${heroKey}.special-damage`, name: "第6次攻击特殊伤害（5级）", trigger: { type: "always" },
      normalAttackCounter: counter,
      effects: [{ ...extraDamage(1, "all"), activeRounds: [6] }],
    }, "每个兵种第6次普通攻击造成100% extraDamage；以该次普通攻击的当前基础伤害为basis，不产生extraAttack或新的AttackEvent。"),
    supported(`head-skill.${heroKey}.override`, "第7次攻击易伤覆盖", {
      id: `skill.head.${heroKey}.override`, name: "第7次攻击易伤覆盖（5级）",
      trigger: { type: "probability", probability: 1, triggerPhase: "roundStart", frequency: "explicitSchedule", triggerRounds: [7] },
      normalAttackCounter: counter,
      effects: [{ type: "vulnerable", value: .15, targetTroop: "all", zoneAggregation: "replace" }],
    }, "每个兵种第6次普通攻击后的下一次攻击（第7次普通攻击）所在回合，将当回合全部vulnerable替换为15%；不与其他vulnerable相加，下一回合恢复正常。"),
  ];
}

function sharedLygiaCounter() {
  return {
    counterId: "counter.lijijia.marksman-normal.shared",
    troopType: "marksman" as const,
    attacksPerTrigger: 2,
    firstTriggerAttack: 2,
    counts: "normalAttackOnly" as const,
  };
}

function probability(probabilityValue:number){return {type:"probability" as const,probability:probabilityValue,triggerPhase:"beforeAttack" as const,frequency:"oncePerRound" as const}}
function extraDamage(value:number,targetTroop:"all"|TroopType){return {type:"extraDamage" as const,value,targetTroop,basis:"postMultiplierDamage" as const,damageCategory:"extra" as const,applicableMultiplierZones:[] as const}}
function decay(first:number){return Array.from({length:10},(_,index)=>first*.85**index)}
function miaVulnerableSkill(id:string):Skill{return{id,name:"厄运缠身（5级）",status:"supported",trigger:{type:"probability",probability:.5,triggerPhase:"onAttack",frequency:"oncePerRound",attemptsPerRound:3,durationRounds:1,instanceAggregation:{groupId:"bear.miya.next-round-vulnerable-50",stackingMode:"probabilityOnly",magnitudeStacking:false}},lifecycle:{durationRounds:1,activationTiming:"nextRound",refreshMode:"refresh"},effects:[{type:"vulnerable",value:.5,targetTroop:"all"}]}}

interface HeadInput { id:HeadHeroId; name:string; troopType:TroopType; generation:number|null; weapon:"attack"|"penetration"|"none"; skills:readonly HeroSkillDefinition[]; optimizableForBear?:boolean; exclusiveGroupIds?:readonly string[]; notApplicable?:readonly {name:string;rawDescription:string}[]; exploration?:readonly {name:string;rawDescription:string}[] }
function head(input:HeadInput):HeadHeroDefinition{return{id:input.id,name:input.name,tier:null,generation:input.generation,role:"head",troopType:input.troopType,bodySkill:null,headSkills:input.skills,notes:[],source:SOURCE,exclusiveWeaponBuffType:input.weapon,...(input.optimizableForBear===undefined?{}:{optimizableForBear:input.optimizableForBear}),...(input.exclusiveGroupIds?{exclusiveGroupIds:input.exclusiveGroupIds}:{}),...(input.notApplicable?{notApplicableToBearOutgoingDamage:input.notApplicable}:{}),...(input.exploration?{explorationSkills:input.exploration}:{})}}
function marksmanHead(id:HeadHeroId,name:string,generation:number,weapon:"attack"|"penetration"|"none",skills:readonly HeroSkillDefinition[],notApplicable?:readonly {name:string;rawDescription:string}[]){return head({id,name,generation,troopType:"marksman",weapon,skills,...(notApplicable?{notApplicable}:{})})}
function supported(id:string,name:string,input:Skill,rawDescription:string):SupportedHeroSkillDefinition{const skill:Skill={...input,level:5,status:"supported",rawDescription,source:SOURCE,effects:input.effects.map(effect=>({...effect,status:"supported" as const,rawDescription}))};return{id,name,status:"supported",supported:true,skill,effectData:skill.effects.map((effect,index)=>toEffectData(skill.id,effect,index)),rawDescription,notes:[rawDescription],source:SOURCE}}
function toEffectData(skillId:string,effect:Skill["effects"][number],index:number):SkillEffectData{return{id:`${skillId}.effect.${index}`,status:"supported",type:effect.type,value:effect.value,rawDescription:effect.rawDescription??"用户最新统一规则",...(effect.targetTroop===undefined?{}:{targetTroop:effect.targetTroop}),...(effect.basis===undefined?{}:{basis:effect.basis}),...(effect.damageCategory===undefined?{}:{damageCategory:effect.damageCategory}),...(effect.applicableMultiplierZones===undefined?{}:{applicableMultiplierZones:effect.applicableMultiplierZones}),...(effect.lifecycle===undefined?{}:{lifecycle:effect.lifecycle}),...(effect.valuePerStack===undefined?{}:{valuePerStack:effect.valuePerStack}),...(effect.triggerApplication===undefined?{}:{triggerApplication:effect.triggerApplication}),...(effect.zoneAggregation===undefined?{}:{zoneAggregation:effect.zoneAggregation}),...(effect.activeRounds===undefined?{}:{activeRounds:effect.activeRounds}),...(effect.valueByRound===undefined?{}:{valueByRound:effect.valueByRound}),...(effect.valueByEnemyTroop===undefined?{}:{valueByEnemyTroop:effect.valueByEnemyTroop})}}
