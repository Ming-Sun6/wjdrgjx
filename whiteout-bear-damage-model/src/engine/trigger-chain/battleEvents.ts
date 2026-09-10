import type { AttackEvent } from "../../domain/attack";
import type { BattleEvent } from "../../domain/battleEvent";
import type { BearBattleContext } from "../../domain/bearBattle";

/** 将现有AttackEvent投影到统一事件模型；不改变攻击调度行为。 */
export function attackEventToBattleEvent(
  attack: AttackEvent,
  battleContext: BearBattleContext,
  parent?: BattleEvent,
): BattleEvent {
  const eventId = `attack-event:${attack.id}`;
  return {
    eventId,
    type: "attack",
    round: attack.round,
    ...(attack.sourceSkillId === undefined
      ? {}
      : { skillId: attack.sourceSkillId }),
    ...(parent === undefined
      ? {}
      : { sourceEventId: parent.eventId, parentEventId: parent.eventId }),
    rootEventId: parent?.rootEventId ?? eventId,
    depth: (parent?.depth ?? -1) + 1,
    attackerTroopType: attack.troopType,
    enemyTroopType: battleContext.enemyTroopType,
    attackKind: attack.kind,
  };
}
