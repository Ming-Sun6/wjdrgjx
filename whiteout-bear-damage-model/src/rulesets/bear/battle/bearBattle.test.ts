import { describe, expect, it } from "vitest";
import { calculateBattleDamage } from "../../../app/calculateBattleDamage";
import type { BattleDamageInput } from "../../../domain/battleDamage";
import {
  calculateBearBattleTotalDamage,
  createBearBattleTotalDamageCalculator,
} from "./calculateBearBattleTotalDamage";

const singleRoundInput: BattleDamageInput = {
  troops: [
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
  ],
  bodyHeroIds: [],
};

describe("打熊整场战斗模型", () => {
  it("敌方固定为全盾、无限血量且完整进行 10 回合", () => {
    const result = calculateBearBattleTotalDamage(singleRoundInput);

    expect(result.context).toEqual({
      totalRounds: 10,
      enemyTroopType: "shield",
      enemyInfiniteHp: true,
      enemyBaseDefense: null,
    });
    expect(result.rounds).toHaveLength(10);
    expect(result.rounds.map((round) => round.round)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("当前全部 always 技能时，整场伤害等于单回合伤害的 10 倍", () => {
    const singleRound = calculateBattleDamage(singleRoundInput);
    const battle = calculateBearBattleTotalDamage(singleRoundInput);

    expect(battle.rounds.every((round) => round.totalDamage === singleRound.finalDamage)).toBe(true);
    expect(battle.singleRoundDamage).toBe(singleRound.finalDamage);
    expect(battle.totalDamage / (singleRound.finalDamage * 10)).toBeCloseTo(1, 12);
  });

  it("整场层只调用一次现有单回合引擎，不修改基础公式", () => {
    let callCount = 0;
    const calculator = createBearBattleTotalDamageCalculator({
      calculateSingleRoundDamage(input) {
        callCount += 1;
        return calculateBattleDamage(input);
      },
    });

    const result = calculator(singleRoundInput);

    expect(callCount).toBe(1);
    expect(result.rounds).toHaveLength(10);
  });

  it("没有减防时，有效防御等于固定基础防御", () => {
    const result = calculateBearBattleTotalDamage(singleRoundInput, {
      enemyBaseDefense: 1_000,
    });
    const state = result.rounds[0]!.enemyDefense;

    expect(state.enemyBaseDefense).toBe(1_000);
    expect(state.enemyEffectiveDefense).toBe(1_000);
    expect(state.enemyEffectiveDefenseByTroop).toEqual({
      shield: 1_000,
      lancer: 1_000,
      marksman: 1_000,
    });
    expect(state.status).toBe("same-as-base-no-active-reduction");
    expect(state.affectedByDefenseReduction).toBe(false);
    expect(
      result.rounds.every(
        (round) => round.enemyDefense.enemyBaseDefense === 1_000,
      ),
    ).toBe(true);
  });

  it("减防只由既有 1+Σr 乘区结算一次，不在敌方状态层重复增伤", () => {
    const noReduction = calculateBearBattleTotalDamage(singleRoundInput, {
      enemyBaseDefense: 1_000,
    });
    const withReduction = calculateBearBattleTotalDamage(
      {
        ...singleRoundInput,
        bodyHeroIds: ["hero.body.hengdelike"],
      },
      { enemyBaseDefense: 1_000 },
    );
    const state = withReduction.rounds[0]!.enemyDefense;

    expect(
      state.defenseReductionMultiplierByTroop.shield,
    ).toBeCloseTo(1.25, 12);
    expect(state.enemyBaseDefense).toBe(1_000);
    expect(state.enemyEffectiveDefense).toBeNull();
    expect(state.enemyEffectiveDefenseByTroop).toEqual({
      shield: null,
      lancer: null,
      marksman: null,
    });
    expect(state.status).toBe("pending-effective-defense-formula");
    expect(state.defenseReductionAppliedAsDamageMultiplier).toBe(true);
    expect(withReduction.singleRoundDamage).toBeCloseTo(
      noReduction.singleRoundDamage * 1.25,
      12,
    );
    expect(
      withReduction.totalDamage / noReduction.totalDamage,
    ).toBeCloseTo(1.25, 12);
  });
});
