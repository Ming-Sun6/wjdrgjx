import type {
  BodyHeroId,
  BodyHeroDefinition,
  HeroTier,
  PendingHeroDefinition,
  SupportedHeroDefinition,
  UnsupportedHeroDefinition,
} from "../../domain/hero";
import type { Skill } from "../../domain/skill";

/**
 * 当前已知的完整车身英雄数据库。
 * generation 未由用户提供，全部显式保存为 null，不做推测。
 */
export const bodyHeroes = {
  // S 级
  "hero.body.hengdelike": supportedBodyHero({
    id: "hero.body.hengdelike",
    name: "亨德里克",
    tier: "S",
    generation: null,
    skill: alwaysSkill(
      "skill.body.hengdelike.defense-reduction",
      "敌军全体防御降低",
      "defenseReduction",
      0.25,
      "all",
    ),
    notes: ["使敌军全体部队防御力降低25%。"],
  }),
  "hero.body.liyala": pendingBodyHero({
    id: "hero.body.liyala",
    name: "丽娅拉",
    tier: "S",
    generation: null,
    skill: null,
    notes: ["尚未提供明确可用于打熊的车身技能数据。"],
  }),
  "hero.body.aisidila": pendingBodyHero({
    id: "hero.body.aisidila",
    name: "艾丝蒂拉",
    tier: "S",
    generation: null,
    skill: null,
    notes: ["尚未提供明确可用于打熊的车身技能数据。"],
  }),
  "hero.body.ailinuo": pendingBodyHero({
    id: "hero.body.ailinuo",
    name: "埃莉诺",
    tier: "S",
    generation: null,
    skill: null,
    notes: ["尚未提供明确可用于打熊的车身技能数据。"],
  }),

  // A 级
  "hero.body.jiexi": supportedBodyHero({
    id: "hero.body.jiexi",
    name: "杰西",
    tier: "A",
    generation: null,
    skill: alwaysSkill(
      "skill.body.jiexi.penetration",
      "全军穿透提升",
      "penetration",
      0.25,
      "all",
    ),
    notes: ["使我军全体部队穿透力提升25%。"],
  }),
  "hero.body.jiesaier": supportedBodyHero({
    id: "hero.body.jiesaier",
    name: "杰塞尔",
    tier: "A",
    generation: null,
    skill: alwaysSkill(
      "skill.body.jiesaier.penetration",
      "全军穿透提升",
      "penetration",
      0.25,
      "all",
    ),
    notes: ["使我军全体部队穿透力提升25%。"],
  }),
  "hero.body.shuyun": supportedBodyHero({
    id: "hero.body.shuyun",
    name: "书允",
    tier: "A",
    generation: null,
    skill: alwaysSkill(
      "skill.body.shuyun.attack",
      "全军攻击提升",
      "attack",
      0.25,
      "all",
    ),
    notes: ["使我军全体部队攻击力提升25%。"],
  }),
  "hero.body.heluonimo": supportedBodyHero({
    id: "hero.body.heluonimo",
    name: "赫罗尼莫",
    tier: "A",
    generation: null,
    skill: alwaysSkill(
      "skill.body.heluonimo.attack",
      "车身远征攻击提升",
      "attack",
      0.25,
      "all",
    ),
    notes: ["车身只取对应远征技能：攻击提升25%；未带入车头完整技能。"],
  }),
  "hero.body.bulanqi": supportedBodyHero({
    id: "hero.body.bulanqi",
    name: "布兰琪",
    tier: "A",
    generation: null,
    skill: alwaysSkill(
      "skill.body.bulanqi.penetration",
      "全军穿透提升",
      "penetration",
      0.25,
      "all",
    ),
    notes: ["使我军全体部队穿透力提升25%。"],
  }),
  "hero.body.heerweier": supportedBodyHero({
    id: "hero.body.heerweier",
    name: "赫尔薇尔",
    tier: "A",
    generation: null,
    skill: alwaysSkill(
      "skill.body.heerweier.penetration",
      "全军穿透提升",
      "penetration",
      0.25,
      "all",
    ),
    notes: ["使我军全体部队穿透力提升25%。"],
  }),
  "hero.body.hanke": supportedBodyHero({
    id: "hero.body.hanke",
    name: "汉克",
    tier: "A",
    generation: null,
    skill: alwaysSkill(
      "skill.body.hanke.penetration",
      "全军穿透提升",
      "penetration",
      0.25,
      "all",
    ),
    notes: ["使我军全体部队穿透力提升25%。"],
  }),
  "hero.body.beiersha": supportedBodyHero({
    id: "hero.body.beiersha",
    name: "贝尔莎",
    tier: "A",
    generation: null,
    skill: alwaysSkill(
      "skill.body.beiersha.penetration",
      "全军穿透提升",
      "penetration",
      0.25,
      "all",
    ),
    notes: ["使我军全体部队穿透力提升25%。"],
  }),
  "hero.body.magenusi": supportedBodyHero({
    id: "hero.body.magenusi",
    name: "马格努斯",
    tier: "A",
    generation: null,
    skill: alwaysSkill(
      "skill.body.magenusi.attack",
      "全军攻击提升",
      "attack",
      0.25,
      "all",
    ),
    notes: ["使我军全体部队攻击力提升25%。"],
  }),
  "hero.body.weiweika": supportedBodyHero({
    id: "hero.body.weiweika",
    name: "维薇卡",
    tier: "A",
    generation: null,
    skill: alwaysSkill(
      "skill.body.weiweika.attack",
      "全军攻击提升",
      "attack",
      0.25,
      "all",
    ),
    notes: ["使我军全体部队攻击力提升25%。"],
  }),

  // B 级
  "hero.body.weien": supportedBodyHero({
    id: "hero.body.weien",
    name: "韦恩",
    tier: "B",
    generation: null,
    skill: {
      id: "skill.body.weien.periodic-extra-damage",
      name: "每4回合额外伤害",
      effects: [{
        type: "extraDamage",
        value: 1,
        targetTroop: "all",
        basis: "postMultiplierDamage",
        damageCategory: "extra",
        applicableMultiplierZones: [],
      }],
      trigger: {
        type: "everyNRounds",
        interval: 4,
        firstTriggerRound: 5,
        triggerPhase: "roundStart",
      },
    },
    notes: ["第5回合首次触发，之后每4回合一次；10回合内在round5、round9造成100% extraDamage，不产生额外攻击事件。"],
  }),
  "hero.body.suoniya": supportedBodyHero({
    id: "hero.body.suoniya",
    name: "索尼娅",
    tier: "B",
    generation: null,
    skill: alwaysSkill(
      "skill.body.suoniya.damage-increase",
      "全军伤害提升",
      "baseDamageIncrease",
      0.2,
      "all",
    ),
    notes: ["使我军全体部队造成的伤害提升20%。"],
  }),
  "hero.body.duominike": supportedBodyHero({
    id: "hero.body.duominike",
    name: "多米尼克",
    tier: "B",
    generation: null,
    skill: alwaysSkill(
      "skill.body.duominike.damage-increase",
      "全军伤害提升",
      "baseDamageIncrease",
      0.2,
      "all",
    ),
    notes: ["使我军全体部队造成的伤害提升20%。"],
  }),
  "hero.body.aishilin": supportedBodyHero({
    id: "hero.body.aishilin",
    name: "艾诗琳",
    tier: "B",
    generation: null,
    skill: alwaysSkill(
      "skill.body.aishilin.damage-increase",
      "全军伤害提升",
      "baseDamageIncrease",
      0.2,
      "all",
    ),
    notes: ["使我军全体部队造成的伤害提升20%。"],
  }),
  "hero.body.gewen": supportedBodyHero({
    id: "hero.body.gewen",
    name: "格温",
    tier: "B",
    generation: null,
    skill: {
      id: "skill.body.gewen.vulnerable", name: "目标受到伤害提升（5级）",
      trigger: { type: "probability", probability: 1, triggerPhase: "roundStart", frequency: "oncePerBattle", durationRounds: 9 },
      lifecycle: { durationRounds: 9, activationTiming: "nextRound", refreshMode: "replace" },
      effects: [{ type: "vulnerable", value: .25, targetTroop: "all" }],
    },
    notes: ["5级：第1回合施加易伤25%，下一回合开始生效。"],
  }),

  // C 级
  "hero.body.feilande": supportedBodyHero({
    id: "hero.body.feilande",
    name: "菲兰德",
    tier: "C",
    generation: null,
    skill: alwaysSkill(
      "skill.body.feilande.attack",
      "全军攻击提升",
      "attack",
      0.15,
      "all",
    ),
    notes: ["使我军全体部队攻击力提升15%。"],
  }),
  "hero.body.geligaoli": supportedBodyHero({
    id: "hero.body.geligaoli",
    name: "格里高利",
    tier: "C",
    generation: null,
    skill: alwaysSkill(
      "skill.body.geligaoli.attack",
      "全军攻击提升",
      "attack",
      0.15,
      "all",
    ),
    notes: ["使我军全体部队攻击力提升15%。"],
  }),
  "hero.body.nuola": supportedBodyHero({
    id: "hero.body.nuola",
    name: "诺拉",
    tier: "C",
    generation: null,
    skill: alwaysSkill(
      "skill.body.nuola.marksman-damage",
      "射手伤害提升",
      "baseDamageIncrease",
      0.15,
      "marksman",
    ),
    notes: ["使射手造成的伤害提升15%，不影响盾兵和矛兵。"],
  }),
  "hero.body.geleige": supportedBodyHero({
    id: "hero.body.geleige",
    name: "格雷格",
    tier: "C",
    generation: null,
    skill: {
      id: "skill.body.geleige.probability-damage-increase",
      name: "概率全军伤害提升",
      effects: [{ type: "baseDamageIncrease", value: 0.4, targetTroop: "all" }],
      trigger: {
        type: "probability",
        probability: 0.2,
        triggerPhase: "roundStart",
        frequency: "oncePerRound",
        durationRounds: 3,
      },
      lifecycle: { durationRounds: 3, activationTiming: "immediate", refreshMode: "refresh" },
    },
    notes: ["5级：每回合20%概率使全体造成伤害提升40%，当回合起持续3回合；重复触发刷新duration，不叠加。"],
  }),
  "hero.body.alongsuo": supportedBodyHero({
    id: "hero.body.alongsuo",
    name: "阿隆索",
    tier: "C",
    generation: null,
    skill: {
      id: "skill.body.alongsuo.probability-penetration",
      name: "概率全军穿透提升",
      effects: [{ type: "penetration", value: 0.5, targetTroop: "all" }],
      trigger: { type: "probability", probability: 0.4, triggerPhase: "roundStart", frequency: "oncePerRound" },
    },
    notes: ["5级：每回合40%概率使全体穿透力提升50%，当回合生效，持续1回合。"],
  }),
  "hero.body.linnen": supportedBodyHero({
    id: "hero.body.linnen",
    name: "琳恩",
    tier: "C",
    generation: null,
    skill: {
      id: "skill.body.linnen.probability-penetration",
      name: "概率全军穿透提升",
      effects: [{ type: "penetration", value: 0.5, targetTroop: "all" }],
      trigger: { type: "probability", probability: 0.4, triggerPhase: "roundStart", frequency: "oncePerRound" },
    },
    notes: ["5级：每回合40%概率使全体穿透力提升50%，当回合生效，持续1回合。"],
  }),

  // D 级
  "hero.body.miya": supportedBodyHero({
    id: "hero.body.miya",
    name: "米娅",
    tier: "D",
    generation: null,
    skill: {
      id: "skill.body.miya.probability-vulnerable",
      name: "攻击时概率施加易伤",
      effects: [{ type: "vulnerable", value: 0.5, targetTroop: "all" }],
      trigger: {
        type: "probability",
        probability: 0.5,
        triggerPhase: "onAttack",
        frequency: "oncePerRound",
        attemptsPerRound: 3,
        durationRounds: 1,
        instanceAggregation: {
          groupId: "bear.miya.next-round-vulnerable-50",
          stackingMode: "probabilityOnly",
          magnitudeStacking: false,
        },
      },
      lifecycle: { durationRounds: 1, activationTiming: "nextRound", refreshMode: "refresh" },
    },
    notes: ["5级：每回合三次普通攻击各50%独立触发；同回合不叠加，下一回合易伤+50%。"],
  }),
  "hero.body.lufusi": supportedBodyHero({
    id: "hero.body.lufusi", name: "鲁弗斯", tier: "A", generation: 11,
    skill: alwaysSkill("skill.body.lufusi.attack", "火焰战团（车身5级）", "attack", .25, "all"),
    notes: ["车身只取第一个远征技能：5级全军攻击+25%。"],
  }),
  "hero.body.lingnai": supportedBodyHero({
    id: "hero.body.lingnai",
    name: "玲奈",
    tier: "A",
    generation: null,
    skill: alwaysSkill(
      "skill.body.lingnai.normal-attack-damage",
      "普攻伤害提升",
      "normalAttackDamageIncrease",
      0.3,
      "all",
    ),
    notes: ["常驻：全体部队普通攻击伤害提升30%；不放大extraDamage或技能伤害部分。"],
  }),
  "hero.body.fuluola": pendingBodyHero({
    id: "hero.body.fuluola",
    name: "弗洛拉",
    tier: "D",
    generation: null,
    skill: null,
    notes: ["当前仅确认效果与米娅相似，完整规则和数值尚未提供。"],
  }),
} as const satisfies Record<BodyHeroId, BodyHeroDefinition>;

interface CommonBodyHeroInput {
  readonly id: BodyHeroId;
  readonly name: string;
  readonly tier: HeroTier;
  readonly generation: number | null;
  readonly notes: readonly string[];
}

function supportedBodyHero(
  input: CommonBodyHeroInput & { readonly skill: Skill },
): SupportedHeroDefinition {
  const skill = withCatalogMetadata(input.skill, "supported", input.notes);
  return {
    ...input,
    role: "body",
    troopType: null,
    skill,
    bodySkill: skill,
    bodySkillDefinition: {
      id: `body-skill-record.${input.id}`,
      name: skill.name,
      status: "supported",
      supported: true,
      skill,
      effectData: skill.effects.map((effect, index) =>
        toEffectData(skill.id, effect, index, "supported", input.notes),
      ),
      rawDescription: input.notes.join("；"),
      notes: input.notes,
    },
    headSkills: [],
    status: "supported",
    supported: true,
  };
}

function pendingBodyHero(
  input: CommonBodyHeroInput & { readonly skill: Skill | null },
): PendingHeroDefinition {
  const pendingReason = input.notes.join("；");
  const skill =
    input.skill === null
      ? null
      : withCatalogMetadata(input.skill, "pending", input.notes);
  return {
    ...input,
    role: "body",
    troopType: null,
    skill,
    bodySkill: skill,
    bodySkillDefinition: {
      id: `body-skill-record.${input.id}`,
      name: skill?.name ?? "车身技能资料待提供",
      status: "pending",
      supported: false,
      skill,
      effectData:
        skill?.effects.map((effect, index) =>
          toEffectData(skill.id, effect, index, "pending", input.notes),
        ) ?? [],
      rawDescription: input.notes.join("；"),
      pendingReason,
      pendingClassification: skill === null ? "DATA_SOURCE_UNCERTAIN" : "RULE_UNKNOWN",
      notes: input.notes,
    },
    headSkills: [],
    status: "pending",
    supported: false,
  };
}

function unsupportedBodyHero(
  input: CommonBodyHeroInput & { readonly skill: Skill },
): UnsupportedHeroDefinition {
  const unsupportedReason = input.notes.join("；");
  const skill = withCatalogMetadata(input.skill, "unsupported", input.notes);
  return {
    ...input,
    role: "body",
    troopType: null,
    skill,
    bodySkill: skill,
    bodySkillDefinition: {
      id: `body-skill-record.${input.id}`,
      name: skill.name,
      status: "unsupported",
      supported: false,
      skill,
      effectData: skill.effects.map((effect, index) =>
        toEffectData(skill.id, effect, index, "unsupported", input.notes),
      ),
      rawDescription: input.notes.join("；"),
      unsupportedReason,
      notes: input.notes,
    },
    headSkills: [],
    status: "unsupported",
    supported: false,
  };
}

function withCatalogMetadata(
  skill: Skill,
  status: Skill["status"] & ("supported" | "pending" | "unsupported"),
  notes: readonly string[],
): Skill {
  const reason = notes.join("；");
  return {
    ...skill,
    level: 5,
    status,
    rawDescription: reason,
    ...(status === "pending" ? { pendingReason: reason } : {}),
    effects: skill.effects.map((effect) => ({
      ...effect,
      status,
      rawDescription: reason,
      ...(status === "pending" ? { pendingReason: reason } : {}),
    })),
  };
}

function toEffectData(
  skillId: string,
  effect: Skill["effects"][number],
  effectIndex: number,
  status: "supported" | "pending" | "unsupported",
  notes: readonly string[],
): import("../../domain/skill").SkillEffectData {
  const reason = notes.join("；");
  return {
    id: `${skillId}.effect.${effectIndex}`,
    status,
    type: effect.type,
    value: effect.value,
    ...(effect.valuePerStack === undefined
      ? {}
      : { valuePerStack: effect.valuePerStack }),
    ...(effect.basis === undefined ? {} : { basis: effect.basis }),
    ...(effect.damageCategory === undefined
      ? {}
      : { damageCategory: effect.damageCategory }),
    ...(effect.applicableMultiplierZones === undefined
      ? {}
      : { applicableMultiplierZones: effect.applicableMultiplierZones }),
    ...(effect.count === undefined ? {} : { count: effect.count }),
    ...(effect.damageScale === undefined
      ? {}
      : { damageScale: effect.damageScale }),
    ...(effect.triggerPolicy === undefined
      ? {}
      : { triggerPolicy: effect.triggerPolicy }),
    ...(effect.maxAttackDepth === undefined
      ? {}
      : { maxAttackDepth: effect.maxAttackDepth }),
    ...(effect.targetTroop === undefined
      ? {}
      : { targetTroop: effect.targetTroop }),
    ...(effect.lifecycle === undefined ? {} : { lifecycle: effect.lifecycle }),
    ...(effect.conditions === undefined ? {} : { conditions: effect.conditions }),
    ...(effect.triggerApplication === undefined
      ? {}
      : { triggerApplication: effect.triggerApplication }),
    ...(effect.maxTriggerDepth === undefined
      ? {}
      : { maxTriggerDepth: effect.maxTriggerDepth }),
    ...(effect.zoneAggregation === undefined
      ? {}
      : { zoneAggregation: effect.zoneAggregation }),
    ...(effect.activeRounds === undefined ? {} : { activeRounds: effect.activeRounds }),
    ...(effect.valueByRound === undefined ? {} : { valueByRound: effect.valueByRound }),
    ...(effect.valueByEnemyTroop === undefined ? {} : { valueByEnemyTroop: effect.valueByEnemyTroop }),
    rawDescription: reason,
    ...(status === "pending" ? { pendingReason: reason } : {}),
    ...(status === "unsupported" ? { unsupportedReason: reason } : {}),
  };
}

function alwaysSkill(
  id: string,
  name: string,
  type: Skill["effects"][number]["type"],
  value: number,
  targetTroop: NonNullable<Skill["effects"][number]["targetTroop"]>,
): Skill {
  return {
    id,
    name,
    effects: [{ type, value, targetTroop }],
    trigger: { type: "always" },
  };
}
