import { describe, expect, it } from "vitest";
import { calculateBearBattleTotalDamage } from "../../rulesets/bear/battle/calculateBearBattleTotalDamage";
import { calculateTenRoundExpectedDamage } from "../../app/calculateTenRoundExpectedDamage";
import { createBearBattleTotalDamageCalculator } from "../../rulesets/bear/battle/calculateBearBattleTotalDamage";
import type { BattleDamageInput } from "../../domain/battleDamage";
import type {
  HeadHeroCatalog,
  HeadHeroDefinition,
} from "../../domain/hero";
import type { Skill } from "../../domain/skill";
import { bodyHeroCatalog } from "../../game-data/heroes/bodyHeroCatalog";
import {
  getAllHeadHeroes,
  getHeadHeroById,
  getHeadHeroesByTroopType,
  getPendingHeadSkills,
  getSupportedHeadSkills,
} from "../../game-data/heroes/headHeroQueries";
import { createBattleDamageCalculator } from "../battle/calculateBattleDamage";
import {
  IncompatibleHeadHeroSlotError,
  UnknownHeadHeroError,
} from "../battle/errors";

const troops: BattleDamageInput["troops"] = [
  {
    troopType: "shield",
    troopLevelId: "T10",
    troopCount: 10_000,
    stats: { attackPercent: 400, penetrationPercent: 100 },
  },
  {
    troopType: "lancer",
    troopLevelId: "T10",
    troopCount: 20_000,
    stats: { attackPercent: 400, penetrationPercent: 100 },
  },
  {
    troopType: "marksman",
    troopLevelId: "T10",
    troopCount: 30_000,
    stats: { attackPercent: 400, penetrationPercent: 100 },
  },
];

const supportedAttackSkill: Skill = {
  id: "skill.head.synthetic.attack",
  name: "合成测试攻击提升",
  effects: [{ type: "attack", value: 0.25, targetTroop: "all" }],
  trigger: { type: "always" },
};

const pendingMustNotApply: Skill = {
  id: "skill.head.synthetic.pending",
  name: "合成待确认技能",
  effects: [{ type: "attack", value: 10, targetTroop: "all" }],
  trigger: { type: "always" },
};

const syntheticShieldHead: HeadHeroDefinition = {
  id: "hero.head.synthetic-shield",
  name: "合成盾车头",
  tier: null,
  generation: null,
  role: "head",
  troopType: "shield",
  bodySkill: null,
  headSkills: [
    {
      id: "head-skill.synthetic.supported",
      name: "合成已支持技能",
      status: "supported",
      supported: true,
      skill: supportedAttackSkill,
      effectData: [{
        id: "effect.head.synthetic.supported.attack",
        status: "supported",
        type: "attack",
        value: 0.25,
        targetTroop: "all",
        rawDescription: "测试专用攻击提升25%。",
      }],
      rawDescription: "测试专用攻击提升25%。",
      notes: ["测试专用。"],
    },
    {
      id: "head-skill.synthetic.pending",
      name: "合成待确认技能",
      status: "pending",
      supported: false,
      skill: pendingMustNotApply,
      effectData: [{
        id: "effect.head.synthetic.pending.attack",
        status: "pending",
        type: "attack",
        value: 10,
        targetTroop: "all",
        rawDescription: "测试专用待确认效果。",
        pendingReason: "测试专用。",
      }],
      rawDescription: "测试专用待确认效果。",
      pendingReason: "测试专用。",
      notes: ["测试专用：即使带有结构化 Skill，也必须跳过。"],
    },
  ],
  notes: ["测试专用，不对应真实英雄。"],
};

const syntheticMarksmanHead: HeadHeroDefinition = {
  ...syntheticShieldHead,
  id: "hero.head.synthetic-marksman",
  name: "合成射手车头",
  troopType: "marksman",
  headSkills: [],
};

const syntheticCatalog: HeadHeroCatalog = {
  get(heroId) {
    if (heroId === syntheticShieldHead.id) return syntheticShieldHead;
    if (heroId === syntheticMarksmanHead.id) return syntheticMarksmanHead;
    return undefined;
  },
};

const calculateSynthetic = createBattleDamageCalculator({
  heroCatalog: bodyHeroCatalog,
  headHeroCatalog: syntheticCatalog,
});

describe("车头英雄数据与查询", () => {
  it("保存20个真实车头；46个supported技能、没有真实pending记录", () => {
    expect(getAllHeadHeroes()).toHaveLength(20);
    expect(getHeadHeroesByTroopType("shield")).toHaveLength(3);
    expect(getSupportedHeadSkills()).toHaveLength(46);
    expect(getPendingHeadSkills()).toHaveLength(0);
    expect(getHeadHeroById("hero.head.heketuo")?.name).toBe("赫克托");
  });

  it("真实车头ID和技能记录ID均唯一，车头不携带bodySkill", () => {
    const heroes = getAllHeadHeroes();
    const heroIds = heroes.map((hero) => hero.id);
    const skillRecordIds = heroes.flatMap((hero) =>
      hero.headSkills.map((skill) => skill.id),
    );

    expect(new Set(heroIds).size).toBe(heroIds.length);
    expect(new Set(skillRecordIds).size).toBe(skillRecordIds.length);
    expect(heroes.every((hero) => hero.bodySkill === null)).toBe(true);
  });

  it("格温三个真实车头技能均参与，且不再留下pending跳过记录", () => {
    const withoutHead = calculateTenRoundExpectedDamage({
      troops,
      bodyHeroIds: [],
    });
    const withGwen = calculateTenRoundExpectedDamage({
      troops,
      bodyHeroIds: [],
      headFormation: { marksmanHeroId: "hero.head.gewen" },
    });

    expect(withGwen.expectedTotalDamage).toBeGreaterThan(withoutHead.expectedTotalDamage);
    expect(
      withGwen.appliedSkills.filter((skill) => skill.ownerId === "hero.head.gewen"),
    ).toHaveLength(3);
    expect(
      withGwen.skippedPendingSkills.some((skill) => skill.ownerId === "hero.head.gewen"),
    ).toBe(false);
  });

  it("真实英雄放入错误兵种槽位会明确报错", () => {
    expect(() =>
      calculateBearBattleTotalDamage({
        troops,
        bodyHeroIds: [],
        headFormation: { shieldHeroId: "hero.head.lufusi" },
      }),
    ).toThrow(IncompatibleHeadHeroSlotError);
  });
});

describe("确定性车头技能统一接入", () => {
  it("没有车头与显式空车头的新接口都严格等于原确定性10回合结果", () => {
    const original = calculateBearBattleTotalDamage({ troops, bodyHeroIds: [] });
    const explicitEmpty = calculateBearBattleTotalDamage({
      troops,
      bodyHeroIds: [],
      headFormation: {},
    });

    expect(explicitEmpty.totalDamage).toBe(original.totalDamage);
    expect(explicitEmpty.rounds.map((round) => round.totalDamage)).toEqual(
      original.rounds.map((round) => round.totalDamage),
    );
  });

  it("合成盾车头的 always attack +25% 在10回合均生效", () => {
    const battleCalculator = createBearBattleTotalDamageCalculator({
      calculateSingleRoundDamage: calculateSynthetic,
    });
    const baseline = calculateSynthetic({ troops, bodyHeroIds: [] });
    const result = battleCalculator({
      troops,
      bodyHeroIds: [],
      headFormation: { shieldHeroId: syntheticShieldHead.id },
    });

    expect(result.rounds).toHaveLength(10);
    expect(
      result.rounds.every(
        (round) =>
          round.singleRoundResult.troopDamages.shield?.multipliers.byEffectType
            .attack === 1.25,
      ),
    ).toBe(true);
    expect(
      result.rounds.every(
        (round) => round.totalDamage === baseline.finalDamage * 1.25,
      ),
    ).toBe(true);
  });

  it("车头 attack +25% 与车身 attack +25% 在同乘区加算为1.50", () => {
    const result = calculateSynthetic({
      troops,
      bodyHeroIds: ["hero.body.shuyun"],
      headFormation: { shieldHeroId: syntheticShieldHead.id },
    });

    expect(
      result.troopDamages.shield?.multipliers.byEffectType.attack,
    ).toBeCloseTo(1.5, 12);
    expect(result.troopDamages.shield?.multipliers.combined).toBeCloseTo(
      1.5,
      12,
    );
  });

  it("同一车头的 supported A参与，pending B跳过并出现在解释结果", () => {
    const result = calculateSynthetic({
      troops,
      bodyHeroIds: [],
      headFormation: { shieldHeroId: syntheticShieldHead.id },
    });

    expect(result.appliedSkills).toEqual([
      {
        source: "head",
        heroId: syntheticShieldHead.id,
        heroName: syntheticShieldHead.name,
        skillId: supportedAttackSkill.id,
        skillName: supportedAttackSkill.name,
      },
    ]);
    expect(result.skippedSkills).toHaveLength(1);
    expect(result.skippedSkills?.[0]).toMatchObject({
      skillRecordId: "head-skill.synthetic.pending",
      skillId: pendingMustNotApply.id,
      status: "pending",
    });
    expect(
      result.troopDamages.shield?.multipliers.byEffectType.attack,
    ).toBeCloseTo(1.25, 12);
  });

  it("车头兵种与槽位不一致时明确报错", () => {
    expect(() =>
      calculateSynthetic({
        troops,
        bodyHeroIds: [],
        headFormation: { marksmanHeroId: syntheticShieldHead.id },
      }),
    ).toThrow(IncompatibleHeadHeroSlotError);
  });

  it("不存在的车头ID明确报错", () => {
    expect(() =>
      calculateSynthetic({
        troops,
        bodyHeroIds: [],
        headFormation: { shieldHeroId: "hero.head.missing" },
      }),
    ).toThrow(UnknownHeadHeroError);
  });
});
