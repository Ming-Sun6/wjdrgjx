import type {
  ExactProbabilityScenario,
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
import { assertCompleteExtraDamageEffect } from "../damage/resolveDamageComponent";
import { InvalidProbabilityError } from "./errors";
import {
  createEveryNRoundsRoundPlan,
  isEveryNRoundsTriggerRound,
} from "./periodicStackingEffects";
import { validateProbability } from "./probabilityMath";

const SUPPORTED_EXTRA_DAMAGE_PHASES: ReadonlySet<ProbabilityTriggerPhase> =
  new Set(["roundStart", "beforeAttack", "onAttack", "afterAttack"]);

const SUPPORTED_EXTRA_DAMAGE_FREQUENCIES: ReadonlySet<ProbabilityTriggerFrequency> =
  new Set(["oncePerBattle", "oncePerRound", "explicitSchedule"]);

type EveryNRoundsTrigger = Extract<SkillTrigger, { type: "everyNRounds" }>;

export interface ExtraDamageEventOptions {
  readonly eventId?: string;
  readonly scenarioId?: string;
}

/** 创建语义完整的即时 probability + extraDamage 精确分支事件。 */
export function createExtraDamageProbabilityEvent(
  skill: Skill,
  options: ExtraDamageEventOptions = {},
): InstantProbabilityEffectTransition {
  if (skill.trigger.type !== "probability") {
    throw new InvalidProbabilityError(
      `额外伤害技能 ${skill.id} 必须使用probability trigger。`,
    );
  }
  const trigger = validateProbabilityTrigger(skill.id, skill.trigger);
  assertPhaseCompatibleEffects(skill, trigger.triggerPhase);
  return createExtraDamageTransientEvent(
    skill,
    trigger,
    options.eventId ?? `extra-damage.${skill.id}`,
  );
}

/**
 * 创建 everyNRounds + extraDamage 场景。命中回合复用共享周期调度器；
 * 额外伤害是本回合独立组件，所以 transient 不进入持久 BattleState。
 */
export function createPeriodicExtraDamageScenario(
  skill: Skill,
  options: ExtraDamageEventOptions = {},
): ExactProbabilityScenario {
  if (skill.trigger.type !== "everyNRounds") {
    throw new InvalidProbabilityError(
      `周期额外伤害技能 ${skill.id} 必须使用everyNRounds trigger。`,
    );
  }
  validateExtraDamageSkill(skill);
  validatePeriodicTrigger(skill.trigger);
  assertPhaseCompatibleEffects(skill, skill.trigger.triggerPhase!);
  const trigger: InstantProbabilitySkillTrigger = {
    type: "probability",
    probability: skill.trigger.probability ?? 1,
    triggerPhase: skill.trigger.triggerPhase!,
    frequency: "explicitSchedule",
  };
  const event = createExtraDamageTransientEvent(
    skill,
    trigger,
    options.eventId ?? `periodic-extra-damage.${skill.id}`,
  );
  return {
    id: options.scenarioId ?? `scenario.${event.id}`,
    createRoundPlan: createEveryNRoundsRoundPlan(
      skill.trigger,
      event,
      "beforeDamage",
    ),
  };
}

function createExtraDamageTransientEvent(
  skill: Skill,
  trigger: InstantProbabilitySkillTrigger,
  eventId: string,
): InstantProbabilityEffectTransition {
  validateExtraDamageSkill(skill);
  if (!eventId) {
    throw new InvalidProbabilityError("额外伤害事件ID不能为空。");
  }
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

function validateExtraDamageSkill(skill: Skill): void {
  if (skill.status !== "supported") {
    throw new InvalidProbabilityError(
      `额外伤害技能 ${skill.id} 必须明确标记supported。`,
    );
  }
  if (skill.lifecycle !== undefined) {
    throw new InvalidProbabilityError(
      `即时/周期额外伤害技能 ${skill.id} 不能包含持久lifecycle。`,
    );
  }
  if (skill.effects.length === 0) {
    throw new InvalidProbabilityError(
      `额外伤害技能 ${skill.id} 必须至少包含一个效果。`,
    );
  }
  let extraDamageCount = 0;
  for (const [effectIndex, effect] of skill.effects.entries()) {
    if (effect.status !== "supported") {
      throw new InvalidProbabilityError(
        `额外伤害技能 ${skill.id} 的效果 ${effectIndex} 必须标记supported。`,
      );
    }
    if (!EFFECT_TYPES.includes(effect.type)) {
      throw new InvalidProbabilityError(
        `额外伤害技能 ${skill.id} 包含未知效果类型。`,
      );
    }
    if (effect.lifecycle !== undefined) {
      throw new InvalidProbabilityError(
        `额外伤害技能 ${skill.id} 的即时效果不能包含lifecycle。`,
      );
    }
    if (effect.type === "extraAttack") {
      throw new InvalidProbabilityError(
        `额外伤害技能 ${skill.id} 不能包含extraAttack。`,
      );
    }
    if (!Number.isFinite(effect.value)) {
      throw new InvalidProbabilityError(
        `额外伤害技能 ${skill.id} 的效果值必须是有限数。`,
      );
    }
    if (effect.type === "extraDamage") {
      extraDamageCount += 1;
      assertCompleteExtraDamageEffect(
        effect,
        `额外伤害技能 ${skill.id} 的效果 ${effectIndex}`,
      );
    }
  }
  if (extraDamageCount === 0) {
    throw new InvalidProbabilityError(
      `额外伤害技能 ${skill.id} 至少需要一个extraDamage效果。`,
    );
  }
}

function validateProbabilityTrigger(
  skillId: string,
  trigger: Extract<SkillTrigger, { type: "probability" }>,
): InstantProbabilitySkillTrigger {
  validateProbability(trigger.probability, `${skillId}.probability`);
  if (
    trigger.triggerPhase === undefined ||
    !PROBABILITY_TRIGGER_PHASES.includes(trigger.triggerPhase) ||
    !SUPPORTED_EXTRA_DAMAGE_PHASES.has(trigger.triggerPhase)
  ) {
    throw new InvalidProbabilityError(
      `额外伤害技能 ${skillId} 必须提供当前可执行的triggerPhase。`,
    );
  }
  if (
    trigger.frequency === undefined ||
    !PROBABILITY_TRIGGER_FREQUENCIES.includes(trigger.frequency) ||
    !SUPPORTED_EXTRA_DAMAGE_FREQUENCIES.has(trigger.frequency)
  ) {
    throw new InvalidProbabilityError(
      `额外伤害技能 ${skillId} 必须提供当前可执行的frequency；oncePerAttack仍待攻击粒度。`,
    );
  }
  if (trigger.durationRounds !== undefined) {
    throw new InvalidProbabilityError(
      `即时额外伤害技能 ${skillId} 不能在trigger声明duration。`,
    );
  }
  return trigger as InstantProbabilitySkillTrigger;
}

function validatePeriodicTrigger(trigger: EveryNRoundsTrigger): void {
  // 共享判定函数同时验证 interval、firstTriggerRound 与 triggerPhase。
  isEveryNRoundsTriggerRound(trigger, 1);
  validateProbability(trigger.probability ?? 1, "periodicExtraDamage.probability");
  if (!SUPPORTED_EXTRA_DAMAGE_PHASES.has(trigger.triggerPhase!)) {
    throw new InvalidProbabilityError(
      "周期额外伤害必须使用当前可表达的triggerPhase。",
    );
  }
}

function assertPhaseCompatibleEffects(
  skill: Skill,
  phase: ProbabilityTriggerPhase,
): void {
  if (
    phase === "afterAttack" &&
    skill.effects.some((effect) => effect.type !== "extraDamage")
  ) {
    throw new InvalidProbabilityError(
      `额外伤害技能 ${skill.id} 的afterAttack事件不能把普通乘区追溯应用到已完成的主伤害；请拆分事件或确认其他phase。`,
    );
  }
}

function withoutLifecycle(
  effect: SkillEffect,
): SkillEffect & { readonly lifecycle?: never } {
  const { lifecycle: _unusedLifecycle, ...runtime } = effect;
  return runtime;
}
