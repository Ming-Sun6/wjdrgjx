import type { ActiveEffect, BattleState } from "../../domain/battleState";
import type { BearBattleContext } from "../../domain/bearBattle";
import { BEAR_BATTLE_TOTAL_ROUNDS } from "../../rulesets/bear/battle/constants";
import { validateActiveEffect } from "./activeEffects";
import { InvalidBattleStateError } from "./errors";

export function createBattleState(
  context: BearBattleContext,
  activeEffects: readonly ActiveEffect[] = [],
): BattleState {
  validateBattleContext(context);
  const state: BattleState = {
    currentRound: 1,
    totalRounds: context.totalRounds,
    status: "ready",
    activeEffects: [...activeEffects],
  };
  validateBattleState(state);
  return state;
}

export function validateBattleContext(context: BearBattleContext): void {
  if (context.totalRounds !== BEAR_BATTLE_TOTAL_ROUNDS ||
      context.enemyTroopType !== "shield" || context.enemyInfiniteHp !== true) {
    throw new InvalidBattleStateError("打熊上下文必须固定 10 回合、敌方全盾且无限血量。");
  }
  if (context.enemyBaseDefense !== null &&
      (!Number.isFinite(context.enemyBaseDefense) || context.enemyBaseDefense < 0)) {
    throw new InvalidBattleStateError("巨熊基础防御必须为 null 或非负有限数。");
  }
}

export function validateBattleState(state: BattleState): void {
  if (state.totalRounds !== BEAR_BATTLE_TOTAL_ROUNDS ||
      !Number.isSafeInteger(state.currentRound) ||
      state.currentRound < 1 || state.currentRound > state.totalRounds) {
    throw new InvalidBattleStateError("战斗状态回合必须位于固定的 1～10 回合内。");
  }
  if (state.status !== "ready" && state.status !== "completed") {
    throw new InvalidBattleStateError("未知战斗状态。");
  }
  if (state.status === "completed" && state.currentRound !== state.totalRounds) {
    throw new InvalidBattleStateError("打熊不能提前结束。");
  }
  const ids = new Set<string>();
  for (const active of state.activeEffects) {
    validateActiveEffect(active);
    if (ids.has(active.id)) throw new InvalidBattleStateError(`效果实例 ID 重复：${active.id}。`);
    ids.add(active.id);
  }
}

/** 只推进回合；没有隐含的持续时间递减或触发先后规则。 */
export function advanceBattleState(
  state: BattleState,
  activeEffects: readonly ActiveEffect[] = state.activeEffects,
): BattleState {
  validateBattleState(state);
  if (state.status === "completed") {
    throw new InvalidBattleStateError("第 10 回合已结束，不能继续推进。");
  }
  const next: BattleState = {
    currentRound: state.currentRound < state.totalRounds
      ? state.currentRound + 1 : state.currentRound,
    totalRounds: state.totalRounds,
    status: state.currentRound === state.totalRounds ? "completed" : "ready",
    activeEffects: [...activeEffects],
  };
  validateBattleState(next);
  return next;
}
