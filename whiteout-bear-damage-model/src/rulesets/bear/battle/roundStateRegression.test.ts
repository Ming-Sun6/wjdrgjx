import { describe, expect, it } from "vitest";
import { calculateBattleDamage } from "../../../app/calculateBattleDamage";
import type { BattleDamageInput } from "../../../domain/battleDamage";
import type { BodyHeroId } from "../../../domain/hero";
import { getSupportedBodyHeroes } from "../../../game-data/heroes/bodyHeroQueries";
import { calculateBearBattleTotalDamage } from "./calculateBearBattleTotalDamage";

const troops: BattleDamageInput["troops"] = [
  { troopType: "shield", troopCount: 5_000, troopLevelId: "T10", stats: { attackPercent: 400, penetrationPercent: 100 } },
  { troopType: "lancer", troopCount: 34_000, troopLevelId: "T10", stats: { attackPercent: 400, penetrationPercent: 100 } },
  { troopType: "marksman", troopCount: 61_000, troopLevelId: "T10", stats: { attackPercent: 400, penetrationPercent: 100 } },
];

describe("第九步状态框架的确定性回归", () => {
  it("所有 supported 车身逐回合伤害、乘区和十回合累加值完全一致", () => {
    const selections: readonly (readonly BodyHeroId[])[] = [
      [],
      ...getSupportedBodyHeroes().map((hero) => [hero.id as BodyHeroId]),
      ["hero.body.jiexi", "hero.body.jiexi", "hero.body.jiexi", "hero.body.jiexi"],
      ["hero.body.jiexi", "hero.body.shuyun", "hero.body.hengdelike", "hero.body.gewen"],
    ];
    for (const bodyHeroIds of selections) {
      const input = { troops, bodyHeroIds };
      const single = calculateBattleDamage(input);
      // 保持第八步的浮点累加顺序，不改成乘 10 或取整。
      const originalTotal = Array.from({ length: 10 }, () => single.finalDamage).reduce((sum, damage) => sum + damage, 0);
      const battle = calculateBearBattleTotalDamage(input, { enemyBaseDefense: 1_000 });
      expect(battle.totalDamage).toBe(originalTotal);
      expect(battle.totalDamage / single.finalDamage).toBeCloseTo(10, 12);
      expect(battle.finalState).toMatchObject({ currentRound: 10, status: "completed" });
      for (const round of battle.rounds) {
        expect(round.totalDamage).toBe(single.finalDamage);
        expect(round.singleRoundResult).toEqual(single);
        expect(round.stateBefore?.currentRound).toBe(round.round);
        expect(round.enemyDefense.enemyBaseDefense).toBe(1_000);
        expect(round.activeEffects.instances?.every((active) =>
          active.remainingRounds === undefined && active.stackCount === 1 && active.applicationCount === 0,
        )).toBe(true);
      }
    }
  });

  it("四个重复车身的实例不会因 sourceSkillId 相同而被覆盖", () => {
    const result = calculateBearBattleTotalDamage({ troops, bodyHeroIds: Array<BodyHeroId>(4).fill("hero.body.jiexi") });
    for (const round of result.rounds) {
      const instances = round.activeEffects.instances!;
      expect(instances).toHaveLength(12); // 三兵种分别保留四个生效来源
      expect(new Set(instances.map((active) => active.id)).size).toBe(12);
      expect(round.activeEffects.multipliersByTroop.shield?.byEffectType.penetration).toBe(2);
    }
  });

  it("统一 N 截断公式下完整穷举样例数值保持固定", () => {
    const result = calculateBearBattleTotalDamage({
      troops,
      bodyHeroIds: ["hero.body.hengdelike", "hero.body.beiersha", "hero.body.magenusi", "hero.body.gewen"],
    });
    expect(result.singleRoundDamage).toBe(126087.75597951919);
    expect(result.totalDamage).toBe(1260877.559795192);
  });
});
