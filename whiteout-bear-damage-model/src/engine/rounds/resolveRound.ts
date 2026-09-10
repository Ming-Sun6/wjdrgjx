import type { BattleDamageResult } from "../../domain/battleDamage";
import type { ActiveEffect, BattleState, RoundPhase, RoundState } from "../../domain/battleState";
import type { BearBattleContext } from "../../domain/bearBattle";
import { advanceBattleState, validateBattleContext, validateBattleState } from "./battleState";
import { InvalidBattleStateError, UnimplementedRoundMechanicsError } from "./errors";

export interface RoundResolverContext {
  readonly battleContext: BearBattleContext;
  readonly battleState: BattleState;
  readonly roundState: RoundState;
}

/** 时序策略扩展点；正式入口当前不提供动态状态策略。 */
export interface RoundEffectStatePolicy {
  readonly updateEffects: (
    context: RoundResolverContext,
    damage: BattleDamageResult,
  ) => readonly ActiveEffect[];
}

export interface RoundResolverDependencies {
  /** 接收当前有效状态；伤害交由现有引擎/未来显式适配器计算。 */
  readonly calculateDamage: (context: RoundResolverContext) => BattleDamageResult;
  readonly effectStatePolicy?: RoundEffectStatePolicy;
}

export interface ResolvedRound {
  readonly round: number;
  readonly damage: BattleDamageResult;
  readonly stateBefore: BattleState;
  readonly stateAfter: BattleState;
  readonly phases: readonly RoundPhase[];
}

export function resolveRound(
  context: BearBattleContext,
  state: BattleState,
  dependencies: RoundResolverDependencies,
): ResolvedRound {
  validateBattleContext(context);
  validateBattleState(state);
  if (state.status === "completed") {
    throw new InvalidBattleStateError("战斗已完成，不能结算第 11 回合。");
  }
  if (dependencies.effectStatePolicy === undefined && state.activeEffects.some(hasDynamicState)) {
    throw new UnimplementedRoundMechanicsError("动态效果必须由显式时序策略处理；当前正式模型仅计算常驻效果。");
  }

  const phases: RoundPhase[] = ["roundStart", "readActiveEffects", "resolveSkills"];
  const damage = dependencies.calculateDamage({
    battleContext: context,
    battleState: state,
    roundState: { round: state.currentRound, phase: "calculateDamage" },
  });
  phases.push("calculateDamage", "updateState");
  const nextEffects = dependencies.effectStatePolicy?.updateEffects({
    battleContext: context,
    battleState: state,
    roundState: { round: state.currentRound, phase: "updateState" },
  }, damage) ?? state.activeEffects;
  const nextState = advanceBattleState(state, nextEffects);
  phases.push("roundEnd");
  return {
    round: state.currentRound,
    damage,
    stateBefore: state,
    stateAfter: nextState,
    phases,
  };
}

function hasDynamicState(active: ActiveEffect): boolean {
  return active.remainingRounds !== undefined || active.durationRounds !== undefined ||
    active.refreshMode !== undefined || active.maxStacks !== undefined || active.stackCount !== 1 ||
    active.decayRate !== undefined || active.maxApplications !== undefined ||
    active.applicationCount !== 0 || active.effect.lifecycle !== undefined;
}
