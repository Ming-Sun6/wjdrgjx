import type {
  InstantProbabilityEffectTransition,
  InstantProbabilitySkillTrigger,
  TransientSkillEffect,
} from "../../domain/probability";
import {
  EFFECT_TYPES,
  PROBABILITY_TRIGGER_FREQUENCIES,
  PROBABILITY_TRIGGER_PHASES,
  type MultiplicativeEffectType,
  type ProbabilityTriggerFrequency,
  type ProbabilityTriggerPhase,
  type Skill,
} from "../../domain/skill";
import { InvalidProbabilityError } from "./errors";
import { validateProbability } from "./probabilityMath";

const SUPPORTED_INSTANT_PHASES: ReadonlySet<ProbabilityTriggerPhase> = new Set([
  "roundStart",
  "beforeAttack",
  "onAttack",
] as const);

const SUPPORTED_INSTANT_FREQUENCIES: ReadonlySet<ProbabilityTriggerFrequency> = new Set([
  "oncePerBattle",
  "oncePerRound",
  "explicitSchedule",
] as const);

/**
 * 把一个已经确认语义的即时概率 Skill 转成现有 Bernoulli 传播器的事件。
 * 调用方仍需通过 ExactProbabilityScenario 显式安排每一次判定。
 */
export function createInstantProbabilityEvent(
  skill: Skill,
  eventId = `instant.${skill.id}`,
): InstantProbabilityEffectTransition {
  if (!eventId) {
    throw new InvalidProbabilityError("即时概率事件 ID 不能为空。");
  }
  if (skill.status !== "supported") {
    throw new InvalidProbabilityError(
      `即时概率技能 ${skill.id} 必须明确标记为 supported。`,
    );
  }
  if (skill.trigger.type !== "probability") {
    throw new InvalidProbabilityError(
      `即时概率技能 ${skill.id} 必须使用 probability trigger。`,
    );
  }
  validateProbability(skill.trigger.probability, `${skill.id}.probability`);
  if (
    skill.trigger.triggerPhase === undefined ||
    !PROBABILITY_TRIGGER_PHASES.includes(skill.trigger.triggerPhase)
  ) {
    throw new InvalidProbabilityError(
      `即时概率技能 ${skill.id} 必须明确提供 triggerPhase。`,
    );
  }
  if (!SUPPORTED_INSTANT_PHASES.has(skill.trigger.triggerPhase)) {
    throw new InvalidProbabilityError(
      `即时概率技能 ${skill.id} 的 ${skill.trigger.triggerPhase} 时点不能作用于当前伤害结算；时序待确认。`,
    );
  }
  if (
    skill.trigger.frequency === undefined ||
    !PROBABILITY_TRIGGER_FREQUENCIES.includes(skill.trigger.frequency)
  ) {
    throw new InvalidProbabilityError(
      `即时概率技能 ${skill.id} 必须明确提供判定 frequency。`,
    );
  }
  if (!SUPPORTED_INSTANT_FREQUENCIES.has(skill.trigger.frequency)) {
    throw new InvalidProbabilityError(
      `即时概率技能 ${skill.id} 的 oncePerAttack 尚缺少单次攻击粒度，不能正式结算。`,
    );
  }
  if (
    skill.trigger.durationRounds !== undefined ||
    skill.lifecycle !== undefined
  ) {
    throw new InvalidProbabilityError(
      `即时概率技能 ${skill.id} 不能包含 duration 或 lifecycle。`,
    );
  }
  if (skill.effects.length === 0) {
    throw new InvalidProbabilityError(
      `即时概率技能 ${skill.id} 必须至少包含一个乘区效果。`,
    );
  }

  const trigger: InstantProbabilitySkillTrigger = {
    type: "probability",
    probability: skill.trigger.probability,
    triggerPhase: skill.trigger.triggerPhase,
    frequency: skill.trigger.frequency,
  };
  const transientEffects = skill.effects.map(
    (effect, effectIndex): TransientSkillEffect => {
      if (effect.status !== "supported") {
        throw new InvalidProbabilityError(
          `即时概率技能 ${skill.id} 的效果 ${effectIndex} 必须明确标记为 supported。`,
        );
      }
      if (!EFFECT_TYPES.includes(effect.type)) {
        throw new InvalidProbabilityError(
          `即时概率技能 ${skill.id} 包含未知效果类型 ${effect.type as string}。`,
        );
      }
      if (effect.type === "extraDamage" || effect.type === "extraAttack") {
        throw new InvalidProbabilityError(
          `即时概率技能 ${skill.id} 不能包含 ${effect.type}。`,
        );
      }
      if (effect.lifecycle !== undefined) {
        throw new InvalidProbabilityError(
          `即时概率技能 ${skill.id} 的效果 ${effectIndex} 不能包含 lifecycle。`,
        );
      }
      if (!Number.isFinite(effect.value)) {
        throw new InvalidProbabilityError(
          `即时概率技能 ${skill.id} 的效果 ${effectIndex} 必须是有限数值。`,
        );
      }

      const { lifecycle: _unusedLifecycle, ...instantEffect } = effect;
      return {
        id: `${eventId}.effect.${effectIndex}`,
        sourceSkillId: skill.id,
        sourceSkillName: skill.name,
        effectIndex,
        effect: {
          ...instantEffect,
          type: effect.type as MultiplicativeEffectType,
        },
        triggerProbability: trigger.probability,
        triggerPhase: trigger.triggerPhase,
        triggerFrequency: trigger.frequency,
      };
    },
  );

  return {
    kind: "instantEffects",
    id: eventId,
    trigger,
    transientEffects,
  };
}

export function isInstantProbabilityEffectTransition(
  event: { readonly kind?: string },
): event is InstantProbabilityEffectTransition {
  return event.kind === "instantEffects";
}
