import type { BattleState } from "../../domain/battleState";
import type { WeightedBattleState } from "../../domain/probability";
import { validateBattleState } from "../rounds/battleState";
import { InvalidProbabilityError } from "./errors";

/**
 * 对完整 BattleState 做稳定序列化。数组顺序会保留；对象键顺序不会影响 key。
 * 因而只合并所有未来可观察状态字段均相同的状态。
 */
export function battleStateKey(state: BattleState): string {
  validateBattleState(state);
  return canonicalSerialize(futureRelevantBattleState(state));
}

/**
 * 伤害结算前，瞬时效果也是未来演化的一部分，必须进入精确合并键。
 * 缺省 transientEffects 与空数组规范化为同一个状态。
 */
export function weightedBattleStateKey(
  weighted: Pick<WeightedBattleState, "state" | "transientEffects">,
): string {
  validateBattleState(weighted.state);
  return canonicalSerialize({
    state: futureRelevantBattleState(weighted.state),
    transientEffects: weighted.transientEffects ?? [],
  });
}

/**
 * 已经开始生效后，首次/最近应用回合只是历史报告字段，不会改变未来伤害或状态转换。
 * 尚未生效的nextRound状态则必须保留activeFromRound，防止提前合并。
 */
function futureRelevantBattleState(state: BattleState): unknown {
  return {
    ...state,
    activeEffects: state.activeEffects.map((active) => {
      const {
        appliedRound: _appliedRound,
        lastAppliedRound: _lastAppliedRound,
        activeFromRound,
        applicationCount,
        ...future
      } = active;
      const activation = activeFromRound !== undefined && activeFromRound > state.currentRound
        ? { activeFromRound }
        : {};
      const applications = active.maxApplications !== undefined || active.decayRate !== undefined
        ? { applicationCount }
        : {};
      return { ...future, ...activation, ...applications };
    }),
  };
}

function canonicalSerialize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new InvalidProbabilityError("BattleState 不能包含非有限数值。");
      }
      return Object.is(value, -0) ? "0" : JSON.stringify(value);
    case "object":
      if (Array.isArray(value)) {
        return `[${value.map(canonicalSerialize).join(",")}]`;
      }
      return `{${Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => compareStrings(left, right))
        .map(
          ([key, entry]) =>
            `${JSON.stringify(key)}:${canonicalSerialize(entry)}`,
        )
        .join(",")}}`;
    default:
      throw new InvalidProbabilityError(
        `BattleState 包含不可序列化的 ${typeof value}。`,
      );
  }
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
