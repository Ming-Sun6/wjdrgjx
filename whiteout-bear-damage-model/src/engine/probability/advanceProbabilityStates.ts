import type {
  BernoulliStateTransition,
  ProbabilityTransitionContext,
  WeightedBattleState,
} from "../../domain/probability";
import type { BearBattleContext } from "../../domain/bearBattle";
import { PROBABILITY_TRIGGER_PHASES } from "../../domain/skill";
import { validateBattleState } from "../rounds/battleState";
import { InvalidProbabilityError } from "./errors";
import { mergeWeightedBattleStates } from "./mergeWeightedBattleStates";
import type { MergeWeightedBattleStateOptions } from "./mergeWeightedBattleStates";
import {
  assertUnitProbabilityMass,
  validateProbability,
} from "./probabilityMath";
import { isInstantProbabilityEffectTransition } from "./createInstantProbabilityEvent";
import {
  isTriggerChainProbabilityTransition,
  resolveTriggeredSkillChain,
  validateTriggerChainTransition,
} from "../trigger-chain/resolveTriggerChain";

export interface ProbabilityStateAdvanceResult {
  readonly states: readonly WeightedBattleState[];
  readonly statesBeforeMerge: number;
  readonly statesAfterMerge: number;
}

/** 对按给定顺序声明的独立 Bernoulli 事件做精确状态分裂，再精确合并。 */
export function advanceProbabilityStates(
  states: readonly WeightedBattleState[],
  events: readonly BernoulliStateTransition[],
  battleContext: BearBattleContext,
  probabilityTolerance: number,
  mergeOptions: MergeWeightedBattleStateOptions = {},
): ProbabilityStateAdvanceResult {
  assertUnitProbabilityMass(states, probabilityTolerance, "input states");
  assertUniqueEventIds(events);
  let branches = [...states];

  for (const event of events) {
    validateEvent(event);
    const next: WeightedBattleState[] = [];
    const eventContext = (state: WeightedBattleState): ProbabilityTransitionContext => ({
      battleContext,
      round: state.state.currentRound,
      eventId: event.id,
      triggerPhase: event.trigger.triggerPhase,
    });

    for (const weighted of branches) {
      const triggeredProbability =
        weighted.probability * event.trigger.probability;
      const notTriggeredProbability =
        weighted.probability * (1 - event.trigger.probability);

      if (isTriggerChainProbabilityTransition(event)) {
        if (triggeredProbability > 0) {
          const resolution = resolveTriggeredSkillChain({
            transition: event,
            state: weighted.state,
            battleContext,
            probability: triggeredProbability,
            transientEffects: weighted.transientEffects ?? [],
          });
          next.push(
            ...resolution.branches.map((branch) => ({
              probability: branch.probability,
              state: branch.state,
              accumulatedDamage: weighted.accumulatedDamage,
              transientEffects: branch.transientEffects,
            })),
          );
        }
        if (notTriggeredProbability > 0) {
          next.push({
            probability: notTriggeredProbability,
            state: weighted.state,
            accumulatedDamage: weighted.accumulatedDamage,
            transientEffects: weighted.transientEffects ?? [],
          });
        }
        continue;
      }

      if (triggeredProbability > 0) {
        const state = isInstantProbabilityEffectTransition(event)
          ? weighted.state
          : event.applyTriggered(weighted.state, eventContext(weighted));
        validateBattleState(state);
        next.push({
          probability: triggeredProbability,
          state,
          accumulatedDamage: weighted.accumulatedDamage,
          transientEffects: isInstantProbabilityEffectTransition(event)
            ? [
                ...(weighted.transientEffects ?? []),
                ...event.transientEffects,
              ]
            : (weighted.transientEffects ?? []),
        });
      }
      if (notTriggeredProbability > 0) {
        const state = isInstantProbabilityEffectTransition(event)
          ? weighted.state
          : (event.applyNotTriggered?.(
              weighted.state,
              eventContext(weighted),
            ) ?? weighted.state);
        validateBattleState(state);
        next.push({
          probability: notTriggeredProbability,
          state,
          accumulatedDamage: weighted.accumulatedDamage,
          transientEffects: weighted.transientEffects ?? [],
        });
      }
    }
    branches = next;
  }

  const statesBeforeMerge = branches.length;
  const merged = mergeWeightedBattleStates(branches, mergeOptions);
  assertUnitProbabilityMass(merged, probabilityTolerance, "merged states");
  return {
    states: merged,
    statesBeforeMerge,
    statesAfterMerge: merged.length,
  };
}

function validateEvent(event: BernoulliStateTransition): void {
  if (!event.id) {
    throw new InvalidProbabilityError("Bernoulli event id 不能为空。");
  }
  validateProbability(event.trigger.probability, `${event.id}.probability`);
  if (!PROBABILITY_TRIGGER_PHASES.includes(event.trigger.triggerPhase)) {
    throw new InvalidProbabilityError(
      `${event.id}.triggerPhase 不是已声明的触发阶段。`,
    );
  }
  if (
    isInstantProbabilityEffectTransition(event) &&
    event.transientEffects.length === 0
  ) {
    throw new InvalidProbabilityError(
      `${event.id} 即时概率事件必须包含至少一个 transient effect。`,
    );
  }
  if (isTriggerChainProbabilityTransition(event)) {
    validateTriggerChainTransition(event);
  }
}

function assertUniqueEventIds(events: readonly BernoulliStateTransition[]): void {
  const ids = new Set<string>();
  for (const event of events) {
    if (ids.has(event.id)) {
      throw new InvalidProbabilityError(`同一事件序列中存在重复 ID：${event.id}。`);
    }
    ids.add(event.id);
  }
}
