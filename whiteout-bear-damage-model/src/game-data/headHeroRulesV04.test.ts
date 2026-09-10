import { describe, expect, it } from "vitest";
import { calculateTenRoundExpectedDamage } from "../app/calculateTenRoundExpectedDamage";
import type { HeadHeroId } from "../domain/hero";
import { getHeadHeroById } from "./heroes/headHeroQueries";

const troops = [
  { troopType: "shield" as const, troopCount: 10_000, troopLevelId: "T6" as const, stats: { attackPercent: 0, penetrationPercent: 0 } },
  { troopType: "lancer" as const, troopCount: 10_000, troopLevelId: "T6" as const, stats: { attackPercent: 0, penetrationPercent: 0 } },
  { troopType: "marksman" as const, troopCount: 10_000, troopLevelId: "T6" as const, stats: { attackPercent: 0, penetrationPercent: 0 } },
];

describe("v0.4正式车头英雄规则", () => {
  it("盾与矛车头代际完整", () => {
    expect(getHeadHeroById("hero.head.nimo")?.generation).toBe(1);
    expect(getHeadHeroById("hero.head.fulinte")?.generation).toBe(2);
    expect(getHeadHeroById("hero.head.heketuo")?.generation).toBe(5);
    expect(getHeadHeroById("hero.head.miya")?.generation).toBe(3);
  });

  it("韦恩extraDamage只在round4与round8", () => {
    expect(extraRounds(calculate("hero.head.weien"))).toEqual([4, 8]);
  });

  it("格温与乌尔卡努丝共享round6额伤、round7易伤覆盖时序", () => {
    for (const heroId of ["hero.head.gewen", "hero.head.wuerkanusi"] as const) {
      const result = calculate(heroId);
      expect(result.expectedDamageByRound[5]!.expectedExtraDamage).toBeGreaterThan(0);
      expect(result.expectedDamageByRound[6]!.expectedMultipliersByTroop.marksman?.byEffectType.vulnerable).toBeCloseTo(1.15, 12);
      expect(result.expectedDamageByRound[7]!.expectedMultipliersByTroop.marksman?.byEffectType.vulnerable).not.toBeCloseTo(1.15, 12);
    }
  });

  it("亨德里克40%extraDamage只在round3/6/9", () => {
    expect(extraRounds(calculate("hero.head.hengdelike"))).toEqual([3, 6, 9]);
  });

  it("修拉保持round2/4/6/8/10额伤与round3/5/7/9易伤", () => {
    const result = calculate("hero.head.xiula");
    expect(extraRounds(result)).toEqual([2, 4, 6, 8, 10]);
    expect(result.expectedDamageByRound.filter((round) =>
      (round.expectedMultipliersByTroop.marksman?.byEffectType.vulnerable ?? 1) > 1,
    ).map((round) => round.round)).toEqual([3, 5, 7, 9]);
  });

  it("布兰琪75%extraDamage只在round3/6/9", () => {
    expect(extraRounds(calculate("hero.head.bulanqi"))).toEqual([3, 6, 9]);
  });

  it("阿隆索第三输出技能为每回合50%概率当回合增伤50%", () => {
    const hero = getHeadHeroById("hero.head.alongsuo")!;
    const definition = hero.headSkills.find((entry) => entry.id === "head-skill.alongsuo.damage");
    expect(definition).toMatchObject({ status: "supported" });
    expect(definition?.skill?.trigger).toMatchObject({ type: "probability", probability: .5, frequency: "oncePerRound" });
    expect(definition?.skill?.effects[0]).toMatchObject({ type: "baseDamageIncrease", value: .5, targetTroop: "all" });
    const result = calculate(hero.id);
    for (const round of result.expectedDamageByRound) {
      expect(round.expectedMultipliersByTroop.shield?.byEffectType.baseDamageIncrease).toBeCloseTo(1.25, 12);
    }
  });

  it("布拉德利补全常驻全军攻击25%", () => {
    const hero = getHeadHeroById("hero.head.buladeli")!;
    const definition = hero.headSkills.find((entry) => entry.id === "head-skill.buladeli.attack");
    expect(definition?.skill?.effects[0]).toMatchObject({ type: "attack", value: .25, targetTroop: "all" });
    expect(calculate(hero.id).expectedDamageByRound[0]!.expectedMultipliersByTroop.shield?.byEffectType.attack).toBeCloseTo(1.25, 12);
  });

  it("维薇卡三个兵种独立20%额伤且射手伤害10%继续生效", () => {
    const result = calculate("hero.head.weiweika");
    const events = result.expectedDamageByRound[0]!.instantProbabilityEvents.filter(
      (event) => event.skillId === "skill.head.weiweika.independent-extra",
    );
    expect(events).toHaveLength(3);
    expect(result.expectedDamageByRound[0]!.expectedMultipliersByTroop.marksman?.byEffectType.baseDamageIncrease).toBeCloseTo(1.1, 12);
  });
});

function calculate(marksmanHeroId: HeadHeroId) {
  return calculateTenRoundExpectedDamage({
    troops,
    bodyHeroIds: [],
    headFormation: { marksmanHeroId },
  });
}

function extraRounds(result: ReturnType<typeof calculateTenRoundExpectedDamage>): number[] {
  return result.expectedDamageByRound
    .filter((round) => round.expectedExtraDamage > 1e-12)
    .map((round) => round.round);
}
