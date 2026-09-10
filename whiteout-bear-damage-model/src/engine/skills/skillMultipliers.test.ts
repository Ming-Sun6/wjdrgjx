import { describe, expect, it } from "vitest";
import type {
  Skill,
  SkillEffect,
  SkillTrigger,
} from "../../domain/skill";
import type { TroopType } from "../../domain/troop";
import { aggregateMultipliers } from "./aggregateMultipliers";
import { calculateTroopDamageWithMultipliers } from "./calculateTroopDamageWithMultipliers";
import {
  UnknownEffectTypeError,
  UnsupportedSkillTriggerError,
} from "./errors";
import { resolveSkillEffects } from "./resolveSkillEffects";

function createAlwaysSkill(
  id: string,
  effects: readonly SkillEffect[],
): Skill {
  return {
    id,
    name: id,
    effects,
    trigger: { type: "always" },
  };
}

function aggregateFor(
  troopType: TroopType,
  skills: readonly Skill[],
  damageChannel: "base" | "normalAttack" | "skill" = "base",
) {
  const effects = resolveSkillEffects(skills, troopType);
  return aggregateMultipliers(effects, { troopType, damageChannel });
}

describe("同乘区加算与跨乘区乘算", () => {
  it("两个攻击 +25% 在同一乘区得到 1.50，而不是 1.25²", () => {
    const skills = [
      createAlwaysSkill("attack-1", [{ type: "attack", value: 0.25 }]),
      createAlwaysSkill("attack-2", [{ type: "attack", value: 0.25 }]),
    ];

    const result = aggregateFor("shield", skills);

    expect(result.sumByEffectType.attack).toBeCloseTo(0.5, 12);
    expect(result.multiplierByEffectType.attack).toBeCloseTo(1.5, 12);
    expect(result.combinedMultiplier).toBeCloseTo(1.5, 12);
    expect(result.combinedMultiplier).not.toBeCloseTo(1.25 ** 2, 12);
  });

  it("攻击 +25% 与穿透 +25% 跨乘区得到 1.25²", () => {
    const skill = createAlwaysSkill("attack-and-penetration", [
      { type: "attack", value: 0.25 },
      { type: "penetration", value: 0.25 },
    ]);

    const result = aggregateFor("shield", [skill]);

    expect(result.combinedMultiplier).toBeCloseTo(1.25 ** 2, 12);
  });

  it("直接增伤 +20% 与易伤 +25% 跨乘区得到 1.2 × 1.25", () => {
    const skill = createAlwaysSkill("damage-and-vulnerable", [
      { type: "damageIncrease", value: 0.2 },
      { type: "vulnerable", value: 0.25 },
    ]);

    const result = aggregateFor("shield", [skill]);

    expect(result.combinedMultiplier).toBeCloseTo(1.2 * 1.25, 12);
  });
});

describe("兵种目标筛选", () => {
  it("marksmanDamage +20% 只影响射手", () => {
    const skill = createAlwaysSkill("marksman-only", [
      { type: "marksmanDamage", value: 0.2, targetTroop: "marksman" },
    ]);

    expect(aggregateFor("marksman", [skill]).combinedMultiplier).toBeCloseTo(
      1.2,
      12,
    );
    expect(aggregateFor("shield", [skill]).combinedMultiplier).toBe(1);
    expect(aggregateFor("lancer", [skill]).combinedMultiplier).toBe(1);
  });

  it('targetTroop="shield" 不影响矛兵和射手', () => {
    const skill = createAlwaysSkill("shield-target", [
      { type: "damageIncrease", value: 0.2, targetTroop: "shield" },
    ]);

    expect(aggregateFor("shield", [skill]).combinedMultiplier).toBeCloseTo(
      1.2,
      12,
    );
    expect(aggregateFor("lancer", [skill]).combinedMultiplier).toBe(1);
    expect(aggregateFor("marksman", [skill]).combinedMultiplier).toBe(1);
  });
});

describe("特殊乘区", () => {
  it("defenseReduction = 0.25 得到 1.25", () => {
    const skill = createAlwaysSkill("defense-reduction-25", [
      { type: "defenseReduction", value: 0.25 },
    ]);

    const result = aggregateFor("shield", [skill]);

    expect(result.sumByEffectType.defenseReduction).toBeCloseTo(0.25, 12);
    expect(result.multiplierByEffectType.defenseReduction).toBeCloseTo(1.25, 12);
  });

  it("同乘区减防 0.25 + 0.10 先加算并得到 1.35", () => {
    const skill = createAlwaysSkill("defense-reduction-sum", [
      { type: "defenseReduction", value: 0.25 },
      { type: "defenseReduction", value: 0.1 },
    ]);

    const result = aggregateFor("shield", [skill]);

    expect(result.sumByEffectType.defenseReduction).toBeCloseTo(0.35, 12);
    expect(result.multiplierByEffectType.defenseReduction).toBeCloseTo(1.35, 12);
  });

  it("攻击、穿透、减防三个独立乘区分别乘算", () => {
    const skill = createAlwaysSkill("three-independent-zones", [
      { type: "attack", value: 0.25 },
      { type: "penetration", value: 0.25 },
      { type: "defenseReduction", value: 0.25 },
    ]);

    const result = aggregateFor("shield", [skill]);

    expect(result.combinedMultiplier).toBeCloseTo(1.25 ** 3, 12);
  });

  it("extraDamage 被保留为待处理效果，不作为普通增伤乘区", () => {
    const skill = createAlwaysSkill("extra-damage", [
      { type: "extraDamage", value: 0.6 },
    ]);

    const result = aggregateFor("shield", [skill]);

    expect(result.combinedMultiplier).toBe(1);
    expect(result.deferredExtraDamageEffects).toHaveLength(1);
    expect(result.deferredExtraDamageEffects[0]?.value).toBe(0.6);
  });

  it("普攻和技能伤害乘区根据显式伤害通道分别应用", () => {
    const skill = createAlwaysSkill("damage-channels", [
      { type: "normalAttackDamage", value: 0.2 },
      { type: "skillDamage", value: 0.4 },
    ]);

    expect(aggregateFor("shield", [skill], "base").combinedMultiplier).toBe(1);
    expect(
      aggregateFor("shield", [skill], "normalAttack").combinedMultiplier,
    ).toBeCloseTo(1.2, 12);
    expect(
      aggregateFor("shield", [skill], "skill").combinedMultiplier,
    ).toBeCloseTo(1.4, 12);
  });
});

describe("配置错误与未实现触发方式", () => {
  it("未知乘区明确报错，不会静默忽略", () => {
    const invalidSkill = {
      id: "unknown-effect",
      name: "unknown-effect",
      effects: [{ type: "unknownMultiplier", value: 0.2 }],
      trigger: { type: "always" },
    } as unknown as Skill;

    expect(() => resolveSkillEffects([invalidSkill], "shield")).toThrow(
      UnknownEffectTypeError,
    );
  });

  const unsupportedTriggers: readonly SkillTrigger[] = [
    { type: "probability", probability: 0.5 },
    { type: "everyNRounds", interval: 3 },
    { type: "afterAttack" },
    { type: "stacking", maxStacks: 5 },
  ];

  it.each(unsupportedTriggers)(
    "$type 触发方式明确标记为尚未实现",
    (trigger) => {
      const skill: Skill = {
        id: `unsupported-${trigger.type}`,
        name: trigger.type,
        effects: [{ type: "attack", value: 0.25 }],
        trigger,
      };

      expect(() => resolveSkillEffects([skill], "shield")).toThrow(
        UnsupportedSkillTriggerError,
      );
    },
  );
});

describe("基础伤害组合入口", () => {
  it("基础函数结果乘以解析后的 always 乘区", () => {
    const skill = createAlwaysSkill("attack-buff", [
      { type: "attack", value: 0.25 },
    ]);
    const result = calculateTroopDamageWithMultipliers({
      baseDamageInput: {
        totalTroopCount: 100_000,
        troopCount: 20_000,
        troopType: "shield",
        troopLevelId: "T10",
        stats: { attackPercent: 400, penetrationPercent: 100 },
      },
      skills: [skill],
      damageChannel: "base",
    });

    expect(result.damage).toBeCloseTo(result.baseDamage.damage * 1.25, 12);
    expect(result.baseDamage.factors.attackMultiplier).toBe(5);
  });
});
