import type {
  LinkedSkillDefinition,
  TriggerChainEffectDefinition,
  TriggeredSkillDefinition,
} from "../../domain/battleEvent";
import type { Skill } from "../../domain/skill";
import { InvalidTriggerChainError } from "./errors";

export interface LinkedSkillDefinitionOptions {
  readonly id?: string;
  readonly sourceId?: string;
  readonly maxTriggerDepth?: number;
}

/** 将结构化Skill直接转换为触发链定义，避免按英雄或技能名称编写适配代码。 */
export function triggeredSkillDefinitionFromSkill(
  skill: Skill,
): TriggeredSkillDefinition {
  return {
    skillId: skill.id,
    skillName: skill.name,
    status: skill.status ?? "supported",
    sourceId: skill.id,
    effects: skill.effects.map((effect, index) =>
      effectDefinition(skill, effect, index),
    ),
  };
}

export function linkedSkillDefinitionFromSkill(
  skill: Skill,
  options: LinkedSkillDefinitionOptions = {},
): LinkedSkillDefinition {
  if (
    skill.trigger.type !== "onSkillTrigger" &&
    !(
      skill.trigger.type === "probability" &&
      skill.trigger.event === "onSkillTrigger"
    )
  ) {
    throw new InvalidTriggerChainError(
      `技能 ${skill.id} 不是onSkillTrigger联动技能。`,
    );
  }
  const definition = triggeredSkillDefinitionFromSkill(skill);
  return {
    ...definition,
    id: options.id ?? `linked.${skill.id}`,
    sourceId: options.sourceId ?? definition.sourceId ?? skill.id,
    trigger: skill.trigger,
    ...(options.maxTriggerDepth === undefined
      ? {}
      : { maxTriggerDepth: options.maxTriggerDepth }),
  };
}

function effectDefinition(
  skill: Skill,
  effect: Skill["effects"][number],
  index: number,
): TriggerChainEffectDefinition {
  if (effect.triggerApplication === undefined) {
    throw new InvalidTriggerChainError(
      `联动技能 ${skill.id} 的效果 ${index} 必须声明triggerApplication。`,
    );
  }
  const status = effect.status ?? skill.status ?? "supported";
  return {
    id: `${skill.id}.effect.${index}`,
    status,
    effect,
    application: effect.triggerApplication,
    ...(effect.conditions === undefined ? {} : { conditions: effect.conditions }),
    ...(status === "pending"
      ? {
          pendingReason:
            effect.pendingReason ??
            skill.pendingReason ??
            "pending效果尚未提供原因。",
        }
      : {}),
    ...(status === "unsupported"
      ? { unsupportedReason: "当前引擎尚不支持该效果。" }
      : {}),
  };
}
