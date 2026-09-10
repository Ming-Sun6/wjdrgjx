import type {
  InstantProbabilityEffectTransition,
  InstantProbabilitySkillTrigger,
  TransientSkillEffect,
} from "../../domain/probability";
import {
  EFFECT_TYPES,
  PROBABILITY_TRIGGER_FREQUENCIES,
  PROBABILITY_TRIGGER_PHASES,
  type ProbabilityTriggerFrequency,
  type ProbabilityTriggerPhase,
  type Skill,
  type SkillEffect,
  type SkillTrigger,
} from "../../domain/skill";
import { extraAttackEffectValidationErrors } from "../attacks/extraAttackEffect";
import { assertCompleteExtraDamageEffect } from "../damage/resolveDamageComponent";
import { InvalidProbabilityError } from "./errors";
import { validateProbability } from "./probabilityMath";

const SUPPORTED_EXTRA_ATTACK_PHASES: ReadonlySet<ProbabilityTriggerPhase> =
  new Set(["roundStart", "beforeAttack", "onAttack", "afterAttack"]);
const SUPPORTED_EXTRA_ATTACK_FREQUENCIES: ReadonlySet<ProbabilityTriggerFrequency> =
  new Set(["oncePerBattle", "oncePerRound", "explicitSchedule"]);

export interface ExtraAttackEventOptions {
  readonly eventId?: string;
}

/**
 * 将字段完整的 probability + extraAttack 转换为现有精确概率事件。
 * 触发分支携带的是攻击指令，不会把它折算成伤害倍率。
 */
export function createExtraAttackProbabilityEvent(
  skill: Skill,
  options: ExtraAttackEventOptions = {},
): InstantProbabilityEffectTransition {
  if (skill.status !== "supported") {
    throw new InvalidProbabilityError(
      `额外攻击技能 ${skill.id} 必须明确标记supported。`,
    );
  }
  if (skill.trigger.type !== "probability") {
    throw new InvalidProbabilityError(
      `额外攻击技能 ${skill.id} 必须使用probability trigger。`,
    );
  }
  const trigger = validateTrigger(skill.id, skill.trigger);
  if (skill.lifecycle !== undefined || skill.effects.length === 0) {
    throw new InvalidProbabilityError(
      `即时额外攻击技能 ${skill.id} 不能包含lifecycle且必须至少有一个效果。`,
    );
  }
  let extraAttackCount = 0;
  for (const [effectIndex, effect] of skill.effects.entries()) {
    if (effect.status !== "supported" || effect.lifecycle !== undefined) {
      throw new InvalidProbabilityError(
        `额外攻击技能 ${skill.id} 的效果 ${effectIndex} 必须是无lifecycle的supported效果。`,
      );
    }
    if (!EFFECT_TYPES.includes(effect.type)) {
      throw new InvalidProbabilityError(
        `额外攻击技能 ${skill.id} 包含未知效果类型。`,
      );
    }
    if (effect.type === "extraAttack") {
      extraAttackCount += 1;
      const errors = extraAttackEffectValidationErrors(effect);
      if (errors.length > 0) {
        throw new InvalidProbabilityError(
          `额外攻击技能 ${skill.id} 的效果 ${effectIndex}：${errors.join("；")}。`,
        );
      }
    } else if (effect.type === "extraDamage") {
      try {
        assertCompleteExtraDamageEffect(effect, `额外攻击技能 ${skill.id} 的效果 ${effectIndex}`);
      } catch (error) {
        throw new InvalidProbabilityError(
          error instanceof Error ? error.message : String(error),
        );
      }
    } else if (trigger.triggerPhase === "afterAttack") {
      throw new InvalidProbabilityError(
        `额外攻击技能 ${skill.id} 的afterAttack事件不能把普通乘区追溯应用到已完成攻击。`,
      );
    }
  }
  if (extraAttackCount === 0) {
    throw new InvalidProbabilityError(
      `额外攻击技能 ${skill.id} 至少需要一个extraAttack效果。`,
    );
  }
  const eventId = options.eventId ?? `extra-attack.${skill.id}`;
  if (!eventId) throw new InvalidProbabilityError("额外攻击事件ID不能为空。");
  return {
    kind: "instantEffects",
    id: eventId,
    trigger,
    transientEffects: skill.effects.map(
      (effect, effectIndex): TransientSkillEffect => ({
        id: `${eventId}.effect.${effectIndex}`,
        sourceSkillId: skill.id,
        sourceSkillName: skill.name,
        effectIndex,
        effect: withoutLifecycle(effect),
        triggerProbability: trigger.probability,
        triggerPhase: trigger.triggerPhase,
        triggerFrequency: trigger.frequency,
      }),
    ),
  };
}

function validateTrigger(
  skillId: string,
  trigger: Extract<SkillTrigger, { type: "probability" }>,
): InstantProbabilitySkillTrigger {
  validateProbability(trigger.probability, `${skillId}.probability`);
  if (
    trigger.triggerPhase === undefined ||
    !PROBABILITY_TRIGGER_PHASES.includes(trigger.triggerPhase) ||
    !SUPPORTED_EXTRA_ATTACK_PHASES.has(trigger.triggerPhase)
  ) {
    throw new InvalidProbabilityError(
      `额外攻击技能 ${skillId} 必须提供当前可执行的triggerPhase。`,
    );
  }
  if (
    trigger.frequency === undefined ||
    !PROBABILITY_TRIGGER_FREQUENCIES.includes(trigger.frequency) ||
    !SUPPORTED_EXTRA_ATTACK_FREQUENCIES.has(trigger.frequency)
  ) {
    throw new InvalidProbabilityError(
      `额外攻击技能 ${skillId} 必须提供当前可执行的frequency；oncePerAttack判定粒度尚未实现。`,
    );
  }
  if (trigger.durationRounds !== undefined) {
    throw new InvalidProbabilityError(
      `即时额外攻击技能 ${skillId} 不能声明duration。`,
    );
  }
  return trigger as InstantProbabilitySkillTrigger;
}

function withoutLifecycle(
  effect: SkillEffect,
): SkillEffect & { readonly lifecycle?: never } {
  const { lifecycle: _unusedLifecycle, ...runtime } = effect;
  return runtime;
}

