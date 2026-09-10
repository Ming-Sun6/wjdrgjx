import type { TriggerContext, TriggerResolution } from "../../domain/battleState";
import type { SkillTrigger } from "../../domain/skill";
import { validateBattleContext, validateBattleState } from "./battleState";
import { InvalidBattleStateError } from "./errors";

/** always及具有明确来源的onSkillTrigger可确定解析；概率和时序仍由专用引擎处理。 */
export function resolveSkillTrigger(
  trigger: SkillTrigger,
  context: TriggerContext,
): TriggerResolution {
  validateBattleContext(context.battleContext);
  validateBattleState(context.battleState);
  if (context.battleState.status !== "ready" ||
      context.roundState.round !== context.battleState.currentRound) {
    throw new InvalidBattleStateError("触发上下文与当前回合不一致或战斗已结束。");
  }
  if (trigger.type === "always") return { status: "active", triggerType: "always" };
  if (trigger.type === "onSkillTrigger") {
    if (!trigger.sourceSkillId) {
      throw new InvalidBattleStateError("onSkillTrigger必须声明sourceSkillId。 ");
    }
    return context.sourceSkillId === trigger.sourceSkillId
      ? { status: "active", triggerType: "onSkillTrigger" }
      : {
          status: "inactive",
          triggerType: "onSkillTrigger",
          reason: `当前来源技能不是${trigger.sourceSkillId}。`,
        };
  }
  return {
    status: "unimplemented",
    triggerType: trigger.type,
    reason: "触发时点、持续和覆盖规则尚未确认；仅保留结构，不参与正式计算。",
  };
}
