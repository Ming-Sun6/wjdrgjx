import type {
  BattleEvent,
  LinkedSkillDefinition,
  TriggerChainProbabilityTransition,
  TriggeredSkillDefinition,
} from "../../domain/battleEvent";
import type {
  InstantProbabilitySkillTrigger,
} from "../../domain/probability";
import type { AttackKind } from "../../domain/attack";
import type { TroopType } from "../../domain/troop";
import { validateTriggerChainTransition } from "./resolveTriggerChain";

export interface CreateTriggerChainProbabilityEventInput {
  readonly id: string;
  readonly trigger: InstantProbabilitySkillTrigger;
  readonly rootSkill: TriggeredSkillDefinition;
  readonly linkedSkills: readonly LinkedSkillDefinition[];
  readonly parentEvent?: BattleEvent;
  readonly attackerTroopType?: TroopType;
  readonly attackKind?: AttackKind;
  readonly maxTriggerDepth: number;
}

/** 建立可由精确概率传播器调度的技能触发链事件。 */
export function createTriggerChainProbabilityEvent(
  input: CreateTriggerChainProbabilityEventInput,
): TriggerChainProbabilityTransition {
  const transition: TriggerChainProbabilityTransition = {
    kind: "triggerChain",
    id: input.id,
    trigger: input.trigger,
    rootSkill: input.rootSkill,
    linkedSkills: input.linkedSkills,
    ...(input.parentEvent === undefined
      ? {}
      : { parentEvent: input.parentEvent }),
    ...(input.attackerTroopType === undefined
      ? {}
      : { attackerTroopType: input.attackerTroopType }),
    ...(input.attackKind === undefined
      ? {}
      : { attackKind: input.attackKind }),
    maxTriggerDepth: input.maxTriggerDepth,
  };
  validateTriggerChainTransition(transition);
  return transition;
}
