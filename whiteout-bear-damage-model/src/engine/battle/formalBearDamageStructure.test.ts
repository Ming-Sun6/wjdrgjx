import { describe, expect, it } from "vitest";
import type { Skill } from "../../domain/skill";
import { calculateBaseTroopDamage } from "../../rulesets/bear/base-damage/calculateBaseTroopDamage";
import { applyBearSkillsToBaseTroopDamage } from "../skills/calculateTroopDamageWithMultipliers";

const base = calculateBaseTroopDamage({
  totalTroopCount: 10_000,
  troopCount: 10_000,
  troopType: "shield",
  troopLevelId: "T1",
  stats: { attackPercent: 0, penetrationPercent: 0 },
});

const skill = (id: string, effects: Skill["effects"]): Skill => ({
  id,
  name: id,
  status: "supported",
  trigger: { type: "always" },
  effects: effects.map((effect) => ({ ...effect, status: "supported" })),
});

const extra = (value: number): Skill["effects"][number] => ({
  type: "extraDamage",
  value,
  targetTroop: "all",
  basis: "postMultiplierDamage",
  damageCategory: "extra",
  applicableMultiplierZones: [],
});

describe("正式打熊普通/技能伤害分支", () => {
  it("全军增伤与兵种专属增伤同区加算，兵种克制再独立相乘", () => {
    const shield = applyBearSkillsToBaseTroopDamage(base, [
      skill("general", [{ type: "baseDamageIncrease", value: .2, targetTroop: "all" }]),
      skill("marksman", [{ type: "marksmanDamage", value: 1, targetTroop: "marksman" }]),
      skill("counter", [{ type: "troopVsTroopDamage", value: .25, targetTroop: "all" }]),
    ]);
    expect(shield.multipliers.multiplierByEffectType.baseDamageIncrease).toBeCloseTo(1.2, 12);
    expect(shield.multipliers.multiplierByEffectType.troopVsTroopDamage).toBeCloseTo(1.25, 12);
    const lancer = applyBearSkillsToBaseTroopDamage({ ...base, troopType: "lancer" }, [
      skill("general", [{ type: "baseDamageIncrease", value: .2, targetTroop: "all" }]),
      skill("marksman", [{ type: "marksmanDamage", value: 1, targetTroop: "marksman" }]),
    ]);
    expect(lancer.multipliers.multiplierByEffectType.baseDamageIncrease).toBeCloseTo(1.2, 12);

    const marksmanBase = { ...base, troopType: "marksman" as const };
    const marksman = applyBearSkillsToBaseTroopDamage(marksmanBase, [
      skill("general", [{ type: "baseDamageIncrease", value: .2, targetTroop: "all" }]),
      skill("marksman", [{ type: "marksmanDamage", value: 1, targetTroop: "marksman" }]),
      skill("counter", [{ type: "troopVsTroopDamage", value: .25, targetTroop: "all" }]),
    ]);
    expect(marksman.multipliers.multiplierByEffectType.baseDamageIncrease).toBeCloseTo(2.2, 12);
    expect(marksman.multipliers.multiplierByEffectType.troopVsTroopDamage).toBeCloseTo(1.25, 12);
    expect(marksman.damage).toBeCloseTo(marksmanBase.damage * 2.75, 12);
  });

  it("严格使用 common × (普攻倍率 + extraDamageRate × 技能倍率)", () => {
    const result = applyBearSkillsToBaseTroopDamage(base, [
      skill("base", [{ type: "baseDamageIncrease", value: .2 }]),
      skill("normal", [{ type: "normalAttackDamageIncrease", value: .3 }]),
      skill("skill", [{ type: "skillDamageIncrease", value: .2 }]),
      skill("extra", [extra(.5)]),
    ]);

    expect(result.damageBreakdown.normalDamage).toBeCloseTo(base.damage * 1.2 * 1.3, 12);
    expect(result.damageBreakdown.extraDamage).toBeCloseTo(base.damage * 1.2 * .5 * 1.2, 12);
    expect(result.damage).toBeCloseTo(base.damage * 1.2 * (1.3 + .5 * 1.2), 12);
  });

  it("多个extraDamage来源同区相加，既不相乘也不受普攻增伤放大", () => {
    const result = applyBearSkillsToBaseTroopDamage(base, [
      skill("normal", [{ type: "normalAttackDamageIncrease", value: .5 }]),
      skill("extra-a", [extra(.4)]),
      skill("extra-b", [extra(.6)]),
    ]);

    expect(result.damageBreakdown.normalDamage).toBeCloseTo(base.damage * 1.5, 12);
    expect(result.damageBreakdown.extraDamage).toBeCloseTo(base.damage, 12);
    expect(result.damage).toBeCloseTo(base.damage * 2.5, 12);
  });

  it("旧字段仅作为兼容别名，在正式路径映射到新的三个分支字段", () => {
    const legacy = applyBearSkillsToBaseTroopDamage(base, [
      skill("legacy", [
        { type: "damageIncrease", value: .2 },
        { type: "normalAttackDamage", value: .3 },
        { type: "skillDamage", value: .4 },
        extra(.5),
      ]),
    ]);
    expect(legacy.damage).toBeCloseTo(base.damage * 1.2 * (1.3 + .5 * 1.4), 12);
  });

  it("战报A/P只进入基础公式一次，Buff与Skill随后作为独立大区相乘", () => {
    const reportBase = calculateBaseTroopDamage({
      totalTroopCount: 10_000,
      troopCount: 10_000,
      troopType: "shield",
      troopLevelId: "T1",
      stats: { attackPercent: 100, penetrationPercent: 100 },
    });
    const result = applyBearSkillsToBaseTroopDamage(reportBase, [
      skill("buff", [
        { type: "buffAttack", value: .1 },
        { type: "buffPenetration", value: .1 },
      ]),
      skill("skill", [
        { type: "attack", value: .1 },
        { type: "penetration", value: .1 },
      ]),
    ]);

    expect(reportBase.factors.attackMultiplier).toBe(2);
    expect(reportBase.factors.penetrationMultiplier).toBe(2);
    expect(result.multipliers.multiplierByEffectType.buffAttack).toBe(1.1);
    expect(result.multipliers.multiplierByEffectType.attack).toBe(1.1);
    expect(result.damage).toBeCloseTo(reportBase.damage * 1.1 ** 4, 12);
  });
});
