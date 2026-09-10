import type {
  AccumulatedBattleDamage,
  WeightedBattleState,
} from "../../domain/probability";
import { validateBattleState } from "../rounds/battleState";
import { weightedBattleStateKey } from "./battleStateKey";
import { InvalidProbabilityError } from "./errors";
import { probabilityMass, validateProbability } from "./probabilityMath";

interface StateAccumulator {
  readonly state: WeightedBattleState["state"];
  readonly transientEffects: NonNullable<
    WeightedBattleState["transientEffects"]
  >;
  probability: number;
  weightedShieldDamage: number;
  weightedLancerDamage: number;
  weightedMarksmanDamage: number;
  weightedTotalDamage: number;
  weightedNormalDamage: number;
  weightedExtraDamage: number;
  weightedPrimaryAttackDamage: number;
  weightedExtraAttackDamage: number;
}

export interface MergeWeightedBattleStateOptions {
  /** 保留不同累计伤害历史，供精确总伤害分位数计算；默认只保留条件期望。 */
  readonly preserveAccumulatedDamage?: boolean;
  /** 单一未来状态最多保留的历史伤害点；超限时做确定性相邻分箱。 */
  readonly maxDamageHistoriesPerFutureState?: number;
  readonly distributionTracker?: { compressed: boolean };
}

/**
 * 合并未来演化完全相同的状态。不同历史累计伤害按条件概率加权，期望不变。
 */
export function mergeWeightedBattleStates(
  states: readonly WeightedBattleState[],
  options: MergeWeightedBattleStateOptions = {},
): readonly WeightedBattleState[] {
  if (
    options.preserveAccumulatedDamage === true &&
    options.maxDamageHistoriesPerFutureState !== undefined
  ) {
    const compressed = compressDamageHistories(
      states,
      options.maxDamageHistoriesPerFutureState,
      options.distributionTracker,
    );
    return mergeWeightedBattleStates(compressed, {
      preserveAccumulatedDamage: true,
    });
  }
  const beforeMass = probabilityMass(states);
  const groups = new Map<string, StateAccumulator>();

  for (const [index, weighted] of states.entries()) {
    validateProbability(weighted.probability, `states[${index}].probability`);
    validateBattleState(weighted.state);
    validateAccumulatedDamage(weighted.accumulatedDamage, index);
    if (weighted.probability === 0) continue;

    const key = options.preserveAccumulatedDamage
      ? `${weightedBattleStateKey(weighted)}|damage:${accumulatedDamageKey(weighted.accumulatedDamage)}`
      : weightedBattleStateKey(weighted);
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, {
        state: weighted.state,
        transientEffects: weighted.transientEffects ?? [],
        probability: weighted.probability,
        weightedShieldDamage:
          weighted.probability * weighted.accumulatedDamage.shieldDamage,
        weightedLancerDamage:
          weighted.probability * weighted.accumulatedDamage.lancerDamage,
        weightedMarksmanDamage:
          weighted.probability * weighted.accumulatedDamage.marksmanDamage,
        weightedTotalDamage:
          weighted.probability * weighted.accumulatedDamage.totalDamage,
        weightedNormalDamage:
          weighted.probability * weighted.accumulatedDamage.normalDamage,
        weightedExtraDamage:
          weighted.probability * weighted.accumulatedDamage.extraDamage,
        weightedPrimaryAttackDamage:
          weighted.probability * weighted.accumulatedDamage.primaryAttackDamage,
        weightedExtraAttackDamage:
          weighted.probability * weighted.accumulatedDamage.extraAttackDamage,
      });
      continue;
    }

    existing.probability += weighted.probability;
    existing.weightedShieldDamage +=
      weighted.probability * weighted.accumulatedDamage.shieldDamage;
    existing.weightedLancerDamage +=
      weighted.probability * weighted.accumulatedDamage.lancerDamage;
    existing.weightedMarksmanDamage +=
      weighted.probability * weighted.accumulatedDamage.marksmanDamage;
    existing.weightedTotalDamage +=
      weighted.probability * weighted.accumulatedDamage.totalDamage;
    existing.weightedNormalDamage +=
      weighted.probability * weighted.accumulatedDamage.normalDamage;
    existing.weightedExtraDamage +=
      weighted.probability * weighted.accumulatedDamage.extraDamage;
    existing.weightedPrimaryAttackDamage +=
      weighted.probability * weighted.accumulatedDamage.primaryAttackDamage;
    existing.weightedExtraAttackDamage +=
      weighted.probability * weighted.accumulatedDamage.extraAttackDamage;
  }

  const merged = [...groups.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, group]): WeightedBattleState => ({
      // 独立 Bernoulli 路径反复相加时可能得到 1 + 2e-16。这里只夹紧
      // 超出端点且处于数值容差内的计算结果，不对概率做十进制取整。
      probability:
        group.probability > 1 && group.probability - 1 <= 1e-12
          ? 1
          : group.probability < 0 && -group.probability <= 1e-12
            ? 0
            : group.probability,
      state: group.state,
      transientEffects: group.transientEffects,
      accumulatedDamage: {
        shieldDamage: group.weightedShieldDamage / group.probability,
        lancerDamage: group.weightedLancerDamage / group.probability,
        marksmanDamage: group.weightedMarksmanDamage / group.probability,
        totalDamage: group.weightedTotalDamage / group.probability,
        normalDamage: group.weightedNormalDamage / group.probability,
        extraDamage: group.weightedExtraDamage / group.probability,
        primaryAttackDamage:
          group.weightedPrimaryAttackDamage / group.probability,
        extraAttackDamage:
          group.weightedExtraAttackDamage / group.probability,
      },
    }));

  const afterMass = probabilityMass(merged);
  if (Math.abs(afterMass - beforeMass) > Number.EPSILON * Math.max(1, states.length)) {
    throw new InvalidProbabilityError(
      `状态合并改变了概率和：${beforeMass} -> ${afterMass}。`,
    );
  }
  return merged;
}

function compressDamageHistories(
  states: readonly WeightedBattleState[],
  maximum: number,
  distributionTracker?: { compressed: boolean },
): readonly WeightedBattleState[] {
  if (!Number.isSafeInteger(maximum) || maximum < 1) {
    throw new InvalidProbabilityError("伤害分布状态上限必须是正整数。");
  }
  const byFutureState = new Map<string, WeightedBattleState[]>();
  for (const state of states) {
    const key = weightedBattleStateKey(state);
    const group = byFutureState.get(key);
    if (group === undefined) byFutureState.set(key, [state]);
    else group.push(state);
  }
  return [...byFutureState.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, group]) => {
      if (group.length <= maximum) return group;
      if (distributionTracker !== undefined) {
        distributionTracker.compressed = true;
      }
      const sorted = [...group].sort((left, right) =>
        left.accumulatedDamage.totalDamage - right.accumulatedDamage.totalDamage,
      );
      const chunkSize = Math.ceil(sorted.length / maximum);
      const compressed: WeightedBattleState[] = [];
      for (let index = 0; index < sorted.length; index += chunkSize) {
        const merged = mergeWeightedBattleStates(sorted.slice(index, index + chunkSize));
        if (merged[0] !== undefined) compressed.push(merged[0]);
      }
      return compressed;
    });
}

function accumulatedDamageKey(damage: AccumulatedBattleDamage): string {
  return [
    damage.shieldDamage,
    damage.lancerDamage,
    damage.marksmanDamage,
    damage.totalDamage,
    damage.normalDamage,
    damage.extraDamage,
    damage.primaryAttackDamage,
    damage.extraAttackDamage,
  ].map((value) => Object.is(value, -0) ? "0" : JSON.stringify(value)).join(",");
}

function validateAccumulatedDamage(
  damage: AccumulatedBattleDamage,
  index: number,
): void {
  for (const [key, value] of Object.entries(damage)) {
    if (!Number.isFinite(value)) {
      throw new InvalidProbabilityError(
        `states[${index}].accumulatedDamage.${key} 必须是有限数。`,
      );
    }
  }
}
