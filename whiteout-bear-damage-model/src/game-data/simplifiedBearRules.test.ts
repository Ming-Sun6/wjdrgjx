import { describe, expect, it } from "vitest";
import { calculateTenRoundExpectedDamage } from "../app/calculateTenRoundExpectedDamage";
import { optimizeBodyHeroes } from "../optimizer/body-heroes";
import { resolveAutomaticTroopSkills } from "./troop-skills/automaticTroopSkills";

const troops = [
  { troopType: "shield" as const, troopCount: 10_000, troopLevelId: "T6" as const, stats: { attackPercent: 0, penetrationPercent: 0 } },
  { troopType: "lancer" as const, troopCount: 10_000, troopLevelId: "T6" as const, stats: { attackPercent: 0, penetrationPercent: 0 } },
  { troopType: "marksman" as const, troopCount: 10_000, troopLevelId: "T6" as const, stats: { attackPercent: 0, penetrationPercent: 0 } },
];

const baseline = () => calculateTenRoundExpectedDamage({ troops, bodyHeroIds: [] });

describe("当前正式熊模型的简化伤害语义", () => {
  it("车身韦恩仍按车身目录只在round5与round9产生100% extraDamage", () => {
    const base = baseline();
    const result = calculateTenRoundExpectedDamage({ troops, bodyHeroIds: ["hero.body.weien"] });
    for (const round of result.expectedDamageByRound) {
      const normal = base.expectedDamageByRound[round.round - 1]!.expectedNormalDamage;
      expect(round.expectedNormalDamage).toBeCloseTo(normal, 10);
      expect(round.expectedExtraDamage).toBeCloseTo([5, 9].includes(round.round) ? normal : 0, 10);
    }
  });

  it("米娅幸运加护每回合以0.5概率提供当回合damageIncrease+0.5", () => {
    const base = baseline();
    const result = calculateTenRoundExpectedDamage({ troops, bodyHeroIds: [], headFormation: { lancerHeroId: "hero.head.miya" } });
    expect(result.expectedDamageByRound[0]!.expectedTotalDamage).toBeCloseTo(base.expectedDamageByRound[0]!.expectedTotalDamage * 1.25, 10);
    expect(result.instantProbabilityEvents.some((event) => event.skillId === "skill.head.miya.lucky-blessing" && event.triggerProbability === .5)).toBe(true);
  });

  it("米娅三次独立50%触发使round2至10均以0.875概率存在下一回合易伤", () => {
    const result = calculateTenRoundExpectedDamage({
      troops,
      bodyHeroIds: [],
      headFormation: { lancerHeroId: "hero.head.miya" },
    });
    expect(result.expectedDamageByRound[0]!.expectedMultipliersByTroop.shield?.byEffectType.vulnerable).toBeCloseTo(1, 12);
    for (const round of result.expectedDamageByRound.slice(1)) {
      expect(
        round.expectedMultipliersByTroop.shield?.byEffectType.vulnerable,
      ).toBeCloseTo(1 + .875 * .5, 12);
      expect(
        round.expectedActiveEffects.find((effect) =>
          effect.sourceSkillId === "skill.head.miya.doom-entanglement"
        )?.activeProbability,
      ).toBeCloseTo(.875, 12);
    }
  });

  it.each([
    [1, 0.875, 1.4375],
    [2, 0.984375, 1.4921875],
    [3, 0.998046875, 1.4990234375],
  ] as const)("%i个米娅只合并触发概率，易伤幅度不叠加", (instanceCount, activeProbability, expectedMultiplier) => {
    const bodyHeroIds = Array.from(
      { length: instanceCount === 3 ? 2 : instanceCount },
      () => "hero.body.miya" as const,
    );
    const result = calculateTenRoundExpectedDamage({
      troops,
      bodyHeroIds,
      ...(instanceCount === 3
        ? { headFormation: { lancerHeroId: "hero.head.miya" as const } }
        : {}),
    });
    expect(
      result.expectedDamageByRound[0]!.expectedMultipliersByTroop.shield
        ?.byEffectType.vulnerable,
    ).toBeCloseTo(1, 12);
    expect(
      result.expectedDamageByRound[1]!.expectedMultipliersByTroop.shield
        ?.byEffectType.vulnerable,
    ).toBeCloseTo(expectedMultiplier, 12);
    expect(expectedMultiplier).toBeLessThanOrEqual(1.5);
    expect(expectedMultiplier).toBeCloseTo(1 + activeProbability * 0.5, 12);
  });

  it("米娅车头1加米娅车身2不会把三个期望易伤率线性相加", () => {
    const result = calculateTenRoundExpectedDamage({
      troops,
      bodyHeroIds: ["hero.body.miya", "hero.body.miya"],
      headFormation: { lancerHeroId: "hero.head.miya" },
    });
    const multiplier = result.expectedDamageByRound[1]!
      .expectedMultipliersByTroop.shield?.byEffectType.vulnerable;
    expect(multiplier).toBeCloseTo(1.4990234375, 12);
    expect(multiplier).not.toBeCloseTo(2.3125, 6);
  });

  it("布拉德利第三技能只在5/6/9/10回合提供damageIncrease+30%", () => {
    const result = calculateTenRoundExpectedDamage({ troops, bodyHeroIds: [], headFormation: { marksmanHeroId: "hero.head.buladeli" } });
    const ordinaryRoundDamage = result.expectedDamageByRound[0]!.expectedTotalDamage;
    for (const round of result.expectedDamageByRound) {
      const expected = ordinaryRoundDamage * ([5, 6, 9, 10].includes(round.round) ? 1.3 : 1);
      expect(round.expectedTotalDamage).toBeCloseTo(expected, 9);
    }
  });

  it("亨德里克第三技能在round3/6/9追加当前普通伤害40%", () => {
    const result = calculateTenRoundExpectedDamage({ troops, bodyHeroIds: [], headFormation: { marksmanHeroId: "hero.head.hengdelike" } });
    for (const round of result.expectedDamageByRound) {
      expect(round.expectedExtraDamage).toBeCloseTo([3, 6, 9].includes(round.round) ? round.expectedNormalDamage * .4 : 0, 10);
      expect(round.expectedExtraAttackDamage).toBe(0);
    }
  });

  it("鲁弗斯每回合extraDamage+60%，易伤+25%从下一回合生效", () => {
    const result = calculateTenRoundExpectedDamage({ troops, bodyHeroIds: [], headFormation: { marksmanHeroId: "hero.head.lufusi" } });
    const first = result.expectedDamageByRound[0]!;
    expect(first.expectedExtraDamage).toBeCloseTo(first.expectedNormalDamage * .6, 10);
    for (const round of result.expectedDamageByRound.slice(1)) {
      expect(round.expectedNormalDamage).toBeCloseTo(first.expectedNormalDamage * 1.25, 10);
      expect(round.expectedExtraDamage).toBeCloseTo(round.expectedNormalDamage * .6, 10);
    }
    expect(result.expectedDamageByRound).toHaveLength(10);
  });

  it("四个重复韦恩不去重，round5同区extraDamage加算为400%", () => {
    const result = calculateTenRoundExpectedDamage({ troops, bodyHeroIds: ["hero.body.weien", "hero.body.weien", "hero.body.weien", "hero.body.weien"] });
    const round5 = result.expectedDamageByRound[4]!;
    expect(round5.expectedExtraDamage).toBeCloseTo(round5.expectedNormalDamage * 4, 9);
    expect(round5.expectedTotalDamage).toBeCloseTo(round5.expectedNormalDamage * 5, 9);
  });

  it("车身韦恩与布兰琪各自遵守独立周期，未命中同回合时不误加", () => {
    const result = calculateTenRoundExpectedDamage({ troops, bodyHeroIds: ["hero.body.weien"], headFormation: { marksmanHeroId: "hero.head.bulanqi" } });
    const round5 = result.expectedDamageByRound[4]!;
    expect(round5.expectedExtraDamage).toBeCloseTo(round5.expectedNormalDamage, 9);
    const round6 = result.expectedDamageByRound[5]!;
    expect(round6.expectedExtraDamage).toBeCloseTo(round6.expectedNormalDamage * .75, 9);
  });

  it("正式入口不创建AttackEvent且extraAttack结果恒为0", () => {
    const result = calculateTenRoundExpectedDamage({ troops: troops.map((troop) => ({ ...troop, troopLevelId: "T7" as const })), bodyHeroIds: ["hero.body.weien"] });
    expect(result.expectedExtraAttackDamage).toBe(0);
    expect(result.expectedAttackCount).toBe(0);
    expect(result.expectedDamageByRound.every((round) => round.expectedExtraAttackDamage === 0 && round.expectedAttackCount === 0)).toBe(true);
  });

  it("T7连射保留原始机制标记并在正式模型映射为10%期望extraDamage", () => {
    const skill = resolveAutomaticTroopSkills([{ ...troops[2]!, troopLevelId: "T7" }]).find((entry) => entry.id.includes("rapid-fire"))!;
    expect(skill).toMatchObject({ rawMechanicType: "extraAttack", bearModelType: "extraDamageExpected" });
    expect(skill.effects[0]).toMatchObject({ type: "extraDamage", value: .1 });
  });

  it("韦恩保留正式damage pipeline能力，但不进入v0.1自动车身候选", () => {
    const direct = calculateTenRoundExpectedDamage({ troops, bodyHeroIds: ["hero.body.weien"] });
    expect(direct.expectedTotalDamage).toBeGreaterThan(0);
    expect(() => optimizeBodyHeroes({ troops }, { bodyCount: 1, candidateHeroIds: ["hero.body.weien"], topK: 1 }))
      .toThrow(/不在当前 v0.1 自动优化范围/);
  });
});
