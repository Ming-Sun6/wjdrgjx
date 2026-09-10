import { describe, expect, it } from "vitest";
import { calculateTenRoundExpectedDamage } from "../app/calculateTenRoundExpectedDamage";
import type { BattlePreparationConfig } from "../domain/preparation";
import type { TenRoundExpectedDamageInput } from "../domain/tenRoundExpectedDamage";
import { getHeadHeroById, getHeadHeroesByTroopType } from "./heroes/headHeroQueries";

const troops: TenRoundExpectedDamageInput["troops"] = [
  { troopType: "shield", troopCount: 10_000, troopLevelId: "T6", stats: { attackPercent: 0, penetrationPercent: 0 } },
  { troopType: "lancer", troopCount: 10_000, troopLevelId: "T6", stats: { attackPercent: 0, penetrationPercent: 0 } },
  { troopType: "marksman", troopCount: 10_000, troopLevelId: "T6", stats: { attackPercent: 0, penetrationPercent: 0 } },
];

const townAttackAndPenetration: BattlePreparationConfig = {
  baseMarchCapacity: 30_000,
  expert: { hunterHeartLevel: 0, bearSlayerLevel: 0 },
  town: { attack: "large", penetration: "large", defenseReduction: "none", marchCapacity: "none" },
  pet: { attackLevel: 0, penetrationLevel: 0, defenseReductionLevel: 0, capacityLevel: 0 },
  troopSkillLevels: { marksmanBlazingStarLevel: 0, lancerT12SkillLevel: 0 },
};

describe("弗林特盾兵车头", () => {
  it("以2代盾兵车头录入，三个5级远征技能均为supported", () => {
    const flint = getHeadHeroById("hero.head.fulinte")!;
    expect(flint).toMatchObject({
      name: "弗林特",
      generation: 2,
      troopType: "shield",
      role: "head",
    });
    expect(getHeadHeroesByTroopType("shield").map((hero) => hero.id)).toContain(flint.id);
    expect(flint.headSkills).toHaveLength(3);
    expect(flint.headSkills.every((definition) => definition.status === "supported")).toBe(true);
    expect(flint.headSkills.some((definition) => definition.status === "pending")).toBe(false);
  });

  it("三个技能分别使用shieldDamage、attack和penetration正式字段", () => {
    const skills = getHeadHeroById("hero.head.fulinte")!.headSkills;
    expect(skills[0]?.skill?.effects).toEqual([
      expect.objectContaining({ type: "shieldDamage", value: 1, targetTroop: "shield" }),
    ]);
    expect(skills[1]?.skill?.effects).toEqual([
      expect.objectContaining({ type: "attack", value: .25, targetTroop: "all" }),
    ]);
    expect(skills[2]?.skill?.effects).toEqual([
      expect.objectContaining({ type: "penetration", value: .25, targetTroop: "all" }),
    ]);
  });

  it("盾兵专属伤害只令盾兵乘2，全军攻击与穿透在十回合均生效", () => {
    const baseline = calculateTenRoundExpectedDamage({ troops, bodyHeroIds: [] });
    const result = calculateTenRoundExpectedDamage({
      troops,
      bodyHeroIds: [],
      headFormation: { shieldHeroId: "hero.head.fulinte" },
    });
    for (const round of result.expectedDamageByRound) {
      const base = baseline.expectedDamageByRound[round.round - 1]!;
      expect(round.expectedShieldDamage).toBeCloseTo(base.expectedShieldDamage * 2 * 1.25 * 1.25, 9);
      expect(round.expectedLancerDamage).toBeCloseTo(base.expectedLancerDamage * 1.25 * 1.25, 9);
      expect(round.expectedMarksmanDamage).toBeCloseTo(base.expectedMarksmanDamage * 1.25 * 1.25, 9);
      // 正式伤害通道把已按兵种筛选的专属伤害归一到基础增伤乘区；
      // 原始技能数据仍保留shieldDamage语义，且这里只命中盾兵。
      expect(round.expectedMultipliersByTroop.shield?.byEffectType.baseDamageIncrease).toBeCloseTo(2, 12);
      expect(round.expectedMultipliersByTroop.lancer?.byEffectType.baseDamageIncrease).toBeCloseTo(1, 12);
      expect(round.expectedMultipliersByTroop.marksman?.byEffectType.baseDamageIncrease).toBeCloseTo(1, 12);
      for (const troopType of ["shield", "lancer", "marksman"] as const) {
        expect(round.expectedMultipliersByTroop[troopType]?.byEffectType.attack).toBeCloseTo(1.25, 12);
        expect(round.expectedMultipliersByTroop[troopType]?.byEffectType.penetration).toBeCloseTo(1.25, 12);
      }
    }
  });

  it("车头与车身skill同区加算，Buff仍作为独立大乘区", () => {
    const withBody = calculateTenRoundExpectedDamage({
      troops,
      bodyHeroIds: ["hero.body.shuyun", "hero.body.jiexi"],
      headFormation: { shieldHeroId: "hero.head.fulinte" },
    });
    expect(withBody.expectedDamageByRound[0]!.expectedMultipliersByTroop.shield?.byEffectType.attack).toBeCloseTo(1.5, 12);
    expect(withBody.expectedDamageByRound[0]!.expectedMultipliersByTroop.shield?.byEffectType.penetration).toBeCloseTo(1.5, 12);

    const withBuff = calculateTenRoundExpectedDamage({
      troops,
      bodyHeroIds: [],
      headFormation: { shieldHeroId: "hero.head.fulinte" },
      preparation: townAttackAndPenetration,
    });
    const multipliers = withBuff.expectedDamageByRound[0]!.expectedMultipliersByTroop.shield!.byEffectType;
    expect(multipliers.attack).toBeCloseTo(1.25, 12);
    expect(multipliers.buffAttack).toBeCloseTo(1.20, 12);
    expect(multipliers.penetration).toBeCloseTo(1.25, 12);
    expect(multipliers.buffPenetration).toBeCloseTo(1.20, 12);
  });
});
