import type { BattleEvent } from "../../domain/battleEvent";
import type { BattleState } from "../../domain/battleState";
import type {
  NumericConditionOperator,
  SkillEffectCondition,
} from "../../domain/skill";
import type { BearBattleContext } from "../../domain/bearBattle";
import { InvalidTriggerChainError } from "./errors";

export interface BattleConditionContext {
  readonly sourceEvent: BattleEvent;
  readonly battleState: BattleState;
  readonly battleContext: BearBattleContext;
}

export function matchesBattleConditions(
  conditions: readonly SkillEffectCondition[] = [],
  context: BattleConditionContext,
): boolean {
  return conditions.every((condition) => matchesCondition(condition, context));
}

function matchesCondition(
  condition: SkillEffectCondition,
  context: BattleConditionContext,
): boolean {
  switch (condition.type) {
    case "sourceSkillTriggered":
      return (
        context.sourceEvent.type === "skillTriggered" &&
        context.sourceEvent.triggered === true &&
        context.sourceEvent.skillId === condition.requiredSkillId
      );
    case "attackerTroopType":
      return context.sourceEvent.attackerTroopType === condition.troopType;
    case "enemyTroopType":
      return context.battleContext.enemyTroopType === condition.troopType;
    case "attackKind":
      return context.sourceEvent.attackKind === condition.attackKind;
    case "round":
      return compareNumber(
        context.sourceEvent.round,
        condition.operator,
        condition.value,
      );
    case "stackCount": {
      const stackCount =
        context.battleState.activeEffects.find(
          (active) => active.id === condition.activeEffectId,
        )?.stackCount ?? 0;
      return compareNumber(stackCount, condition.operator, condition.value);
    }
    default:
      throw new InvalidTriggerChainError("未知技能联动条件。 ");
  }
}

function compareNumber(
  actual: number,
  operator: NumericConditionOperator,
  expected: number,
): boolean {
  if (!Number.isFinite(expected)) {
    throw new InvalidTriggerChainError("条件比较值必须是有限数。 ");
  }
  switch (operator) {
    case "eq":
      return actual === expected;
    case "gte":
      return actual >= expected;
    case "lte":
      return actual <= expected;
    case "gt":
      return actual > expected;
    case "lt":
      return actual < expected;
  }
}
