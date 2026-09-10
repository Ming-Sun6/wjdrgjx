import { describe, expect, it } from "vitest";
import type { BattleState } from "../../domain/battleState";
import type { BearBattleContext } from "../../domain/bearBattle";
import type { BattleDamageResult } from "../../domain/battleDamage";
import { DEFAULT_BEAR_BATTLE_CONTEXT } from "../../rulesets/bear/battle/constants";
import { createActiveEffect, decrementEffectDurations } from "./activeEffects";
import { advanceBattleState, createBattleState } from "./battleState";
import { resolveRound } from "./resolveRound";
import { InvalidBattleStateError, UnimplementedRoundMechanicsError } from "./errors";

const context = DEFAULT_BEAR_BATTLE_CONTEXT;
const zeroDamage: BattleDamageResult = {
  totalTroopCount: 0,
  selectedBodyHeroes: [],
  baseDamage: 0,
  damageBreakdown: { normalDamage: 0, extraDamage: 0, totalDamage: 0 },
  attacks: [],
  primaryAttackDamage: 0,
  extraAttackDamage: 0,
  finalDamage: 0,
  troopDamages: {},
};

describe("逐回合状态编排", () => {
  it("状态依次从 1 推进到 10 并完成，不存在提前结束或第 11 回合", () => {
    let state = createBattleState(context);
    const rounds: number[] = [];
    const initial = state;
    while (state.status === "ready") {
      const result = resolveRound(context, state, { calculateDamage: () => zeroDamage });
      rounds.push(result.round);
      expect(result.stateBefore).toBe(state);
      expect(result.phases).toEqual([
        "roundStart", "readActiveEffects", "resolveSkills", "calculateDamage", "updateState", "roundEnd",
      ]);
      state = result.stateAfter;
    }
    expect(rounds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(state).toMatchObject({ currentRound: 10, totalRounds: 10, status: "completed" });
    expect(initial).toMatchObject({ currentRound: 1, status: "ready" });
    expect(() => advanceBattleState(state)).toThrow(InvalidBattleStateError);
    expect(() => resolveRound(context, state, { calculateDamage: () => zeroDamage })).toThrow(InvalidBattleStateError);
  });

  it.each([
    { totalRounds: 9 }, { enemyTroopType: "lancer" }, { enemyInfiniteHp: false },
  ])("运行时拒绝改变固定打熊环境：%j", (invalid) => {
    expect(() => createBattleState({ ...context, ...invalid } as unknown as BearBattleContext)).toThrow(InvalidBattleStateError);
  });

  it("拒绝越界回合和提前完成的伪造状态", () => {
    const initial = createBattleState(context);
    for (const invalid of [
      { currentRound: 0 }, { currentRound: 11 }, { currentRound: 1.5 },
      { status: "completed", currentRound: 5 },
    ]) {
      expect(() => advanceBattleState({ ...initial, ...invalid } as BattleState)).toThrow(InvalidBattleStateError);
    }
  });

  it("同一技能来源允许多个效果实例，但实例 ID 不能重复", () => {
    const active = createActiveEffect({ id: "one", sourceSkillId: "test", effect: { type: "attack", value: 0.25 } });
    expect(createBattleState(context, [active, { ...active, id: "two" }]).activeEffects).toHaveLength(2);
    expect(() => createBattleState(context, [active, active])).toThrow(InvalidBattleStateError);
  });

  it("未提供时序策略时拒绝动态效果，不能静默忽略持续时间", () => {
    const active = createActiveEffect({ id: "timer", sourceSkillId: "test", durationRounds: 3, effect: { type: "attack", value: 0.25 } });
    const state = createBattleState(context, [active]);
    let calls = 0;
    expect(() => resolveRound(context, state, {
      calculateDamage: () => { calls += 1; return zeroDamage; },
    })).toThrow(UnimplementedRoundMechanicsError);
    expect(calls).toBe(0);
    // 推进工具本身不推断持续时间更新时点。
    expect(advanceBattleState(state).activeEffects[0]?.remainingRounds).toBe(3);
  });

  it("显式测试策略可以更新状态，并在后续回合读到新状态（不声明游戏时序）", () => {
    const active = createActiveEffect({ id: "timer", sourceSkillId: "synthetic", durationRounds: 2, effect: { type: "attack", value: 0.25 } });
    let state = createBattleState(context, [active]);
    const observations: (number | undefined)[] = [];
    for (let index = 0; index < 3; index += 1) {
      const round = resolveRound(context, state, {
        calculateDamage: ({ battleState, roundState }) => {
          expect(roundState.phase).toBe("calculateDamage");
          observations.push(battleState.activeEffects[0]?.remainingRounds);
          return zeroDamage;
        },
        effectStatePolicy: {
          updateEffects: ({ battleState, roundState }) => {
            expect(roundState.phase).toBe("updateState");
            return decrementEffectDurations(battleState.activeEffects);
          },
        },
      });
      state = round.stateAfter;
    }
    expect(observations).toEqual([2, 1, undefined]);
    expect(active.remainingRounds).toBe(2);
  });
});
