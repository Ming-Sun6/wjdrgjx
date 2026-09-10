import type {
  ActiveEffect,
  ActiveEffectIdentity,
} from "../../domain/battleState";
import type {
  BernoulliStateTransition,
  ExactProbabilityScenario,
  ExplicitProbabilitySkillTrigger,
  ProbabilityRoundPlan,
  StatefulBernoulliTransition,
} from "../../domain/probability";
import type {
  EffectLifecycle,
  MultiplicativeEffectType,
  Skill,
  SkillEffect,
  SkillTrigger,
} from "../../domain/skill";
import { PROBABILITY_TRIGGER_PHASES } from "../../domain/skill";
import {
  activeEffectIdentityKey,
  createActiveEffect,
  validateActiveEffect,
} from "../rounds/activeEffects";
import { validateBattleState } from "../rounds/battleState";
import { InvalidProbabilityError } from "./errors";
import { validateProbability } from "./probabilityMath";

type EveryNRoundsTrigger = Extract<SkillTrigger, { readonly type: "everyNRounds" }>;

export interface PeriodicStackingOptions {
  readonly sourceId?: string;
  readonly eventId?: string;
  readonly scenarioId?: string;
}

export type PeriodicEventPlacement = "beforeDamage" | "afterDamage";

/** 周期判断只使用显式firstTriggerRound，不为真实技能猜测第一次触发。 */
export function isEveryNRoundsTriggerRound(
  trigger: EveryNRoundsTrigger,
  round: number,
): boolean {
  validateEveryNRoundsTrigger(trigger);
  if (!Number.isSafeInteger(round) || round < 1) {
    throw new InvalidProbabilityError("待判断回合必须是正安全整数。");
  }
  const first = trigger.firstTriggerRound!;
  return round >= first && (round - first) % trigger.interval === 0;
}

/** 创建单次周期判定；调用方或scenario负责只在周期回合安排它。 */
export function createPeriodicStackingEvent(
  skill: Skill,
  options: PeriodicStackingOptions = {},
): StatefulBernoulliTransition {
  const configuration = validatePeriodicStackingSkill(skill);
  const sourceId = options.sourceId ?? skill.id;
  const eventId = options.eventId ?? `periodic-stack.${sourceId}.${skill.id}`;
  if (!sourceId || !eventId) {
    throw new InvalidProbabilityError("周期叠层事件的sourceId和eventId不能为空。");
  }
  const trigger: ExplicitProbabilitySkillTrigger = {
    type: "probability",
    probability: configuration.probability,
    triggerPhase: configuration.trigger.triggerPhase!,
    frequency: "explicitSchedule",
  };

  return {
    kind: "stateTransition",
    id: eventId,
    trigger,
    applyTriggered: (state, context) => {
      validateBattleState(state);
      let activeEffects = state.activeEffects;
      for (const [effectIndex, effect] of skill.effects.entries()) {
        const identity: ActiveEffectIdentity = {
          sourceId,
          sourceSkillId: skill.id,
          effectId: `${skill.id}.effect.${effectIndex}`,
        };
        const incoming = createActiveEffect({
          id: `active:${activeEffectIdentityKey(identity)}`,
          identity,
          sourceSkillId: skill.id,
          effect: toStackRuntimeEffect(effect),
          ...(effect.targetTroop === undefined || effect.targetTroop === "all"
            ? {}
            : { appliesToTroop: effect.targetTroop }),
          refreshMode: "stack",
          maxStacks: configuration.lifecycle.maxStacks,
          atMaxStacks: configuration.lifecycle.atMaxStacks,
          valuePerStack: effect.valuePerStack!,
          activationTiming: configuration.lifecycle.activationTiming,
          appliedRound: context.round,
          lastAppliedRound: context.round,
          activeFromRound:
            configuration.lifecycle.activationTiming === "immediate"
              ? context.round
              : context.round + 1,
          stackCount: 1,
          applicationCount: 1,
          ...(configuration.lifecycle.maxApplications === undefined
            ? {}
            : { maxApplications: configuration.lifecycle.maxApplications }),
        });
        activeEffects = addStackApplication(activeEffects, incoming);
      }
      const next = { ...state, activeEffects };
      validateBattleState(next);
      return next;
    },
  };
}

/** 自动把周期事件放到10回合场景中；概率只在命中的周期回合判定。 */
export function createPeriodicStackingScenario(
  skill: Skill,
  options: PeriodicStackingOptions = {},
): ExactProbabilityScenario {
  const configuration = validatePeriodicStackingSkill(skill);
  const event = createPeriodicStackingEvent(skill, options);
  return {
    id: options.scenarioId ?? `scenario.${event.id}`,
    createRoundPlan: createEveryNRoundsRoundPlan(
      configuration.trigger,
      event,
      configuration.lifecycle.activationTiming === "immediate"
        ? "beforeDamage"
        : "afterDamage",
    ),
  };
}

/**
 * everyNRounds 的共享调度器。它只负责命中回合和软件结算边界，
 * 不解释具体技能的伤害或状态语义。
 */
export function createEveryNRoundsRoundPlan(
  trigger: EveryNRoundsTrigger,
  event: BernoulliStateTransition,
  placement: PeriodicEventPlacement,
): (context: { readonly round: number }) => ProbabilityRoundPlan {
  validateEveryNRoundsTrigger(trigger);
  return ({ round }) => {
    if (!isEveryNRoundsTriggerRound(trigger, round)) return {};
    return placement === "beforeDamage"
      ? { beforeDamageEvents: [event] }
      : { afterDamageEvents: [event] };
  };
}

/** 同一identity只保存一个ActiveEffect；每次成功应用只增加一层。 */
export function addStackApplication(
  effects: readonly ActiveEffect[],
  incoming: ActiveEffect,
): readonly ActiveEffect[] {
  validateActiveEffect(incoming);
  const key = activeEffectIdentityKey(incoming.identity);
  const index = effects.findIndex(
    (active) => activeEffectIdentityKey(active.identity) === key,
  );
  if (index < 0) return [...effects, incoming];

  const existing = effects[index]!;
  validateActiveEffect(existing);
  assertStackCompatible(existing, incoming);
  if (
    existing.maxApplications !== undefined &&
    existing.applicationCount >= existing.maxApplications
  ) {
    return effects;
  }
  if (existing.stackCount >= existing.maxStacks!) {
    if (existing.atMaxStacks === "keep") return effects;
    throw new InvalidProbabilityError(
      `效果 ${key} 要求在满层刷新duration；周期叠层与duration的共享/逐层时长规则尚未实现。`,
    );
  }

  const updated: ActiveEffect = {
    ...existing,
    stackCount: existing.stackCount + 1,
    applicationCount: existing.applicationCount + 1,
    lastAppliedRound: incoming.lastAppliedRound!,
  };
  validateActiveEffect(updated);
  return effects.map((active, effectIndex) =>
    effectIndex === index ? updated : active,
  );
}

interface PeriodicStackingConfiguration {
  readonly trigger: EveryNRoundsTrigger;
  readonly probability: number;
  readonly lifecycle: EffectLifecycle & {
    readonly maxStacks: number;
    readonly activationTiming: "immediate" | "nextRound";
    readonly refreshMode: "stack";
    readonly atMaxStacks: "keep" | "refreshDuration";
  };
}

function validatePeriodicStackingSkill(
  skill: Skill,
): PeriodicStackingConfiguration {
  if (skill.status !== "supported") {
    throw new InvalidProbabilityError(
      `周期叠层技能 ${skill.id} 必须明确标记supported。`,
    );
  }
  if (skill.trigger.type !== "everyNRounds") {
    throw new InvalidProbabilityError(
      `周期叠层技能 ${skill.id} 必须使用everyNRounds trigger。`,
    );
  }
  validateEveryNRoundsTrigger(skill.trigger);
  const probability = skill.trigger.probability ?? 1;
  validateProbability(probability, `${skill.id}.probability`);
  if (skill.effects.length === 0) {
    throw new InvalidProbabilityError(
      `周期叠层技能 ${skill.id} 必须至少有一个效果。`,
    );
  }
  let lifecycle: PeriodicStackingConfiguration["lifecycle"] | undefined;
  for (const [index, effect] of skill.effects.entries()) {
    const effectLifecycle = resolveStackLifecycle(skill, effect);
    if (lifecycle !== undefined && !sameStackLifecycle(lifecycle, effectLifecycle)) {
      throw new InvalidProbabilityError(
        `周期叠层技能 ${skill.id} 的多个效果使用了不同的叠层生命周期。`,
      );
    }
    lifecycle = effectLifecycle;
    if (
      effect.status !== "supported" ||
      effect.type === "extraDamage" ||
      effect.type === "extraAttack" ||
      !Number.isFinite(effect.valuePerStack)
    ) {
      throw new InvalidProbabilityError(
        `周期叠层技能 ${skill.id} 的效果 ${index} 必须是supported乘区并提供valuePerStack。`,
      );
    }
    if (effect.value !== effect.valuePerStack) {
      throw new InvalidProbabilityError(
        `周期叠层技能 ${skill.id} 的单层value必须与valuePerStack一致。`,
      );
    }
  }
  if (
    lifecycle!.activationTiming === "immediate" &&
    (skill.trigger.triggerPhase === "afterAttack" ||
      skill.trigger.triggerPhase === "roundEnd")
  ) {
    throw new InvalidProbabilityError(
      `周期叠层技能 ${skill.id} 的伤害后phase不能配置为immediate。`,
    );
  }

  return {
    trigger: skill.trigger,
    probability,
    lifecycle: lifecycle!,
  };
}

function resolveStackLifecycle(
  skill: Skill,
  effect: SkillEffect,
): PeriodicStackingConfiguration["lifecycle"] {
  if (
    skill.lifecycle !== undefined &&
    effect.lifecycle !== undefined &&
    !sameStackLifecycle(skill.lifecycle, effect.lifecycle)
  ) {
    throw new InvalidProbabilityError(
      `周期叠层技能 ${skill.id} 的Skill与effect lifecycle不一致。`,
    );
  }
  const lifecycle = effect.lifecycle ?? skill.lifecycle;
  if (
    lifecycle?.refreshMode !== "stack" ||
    lifecycle.maxStacks === undefined ||
    !Number.isSafeInteger(lifecycle.maxStacks) ||
    lifecycle.maxStacks < 1
  ) {
    throw new InvalidProbabilityError(
      `周期叠层技能 ${skill.id} 必须提供stack和正整数maxStacks。`,
    );
  }
  if (
    lifecycle.activationTiming !== "immediate" &&
    lifecycle.activationTiming !== "nextRound"
  ) {
    throw new InvalidProbabilityError(
      `周期叠层技能 ${skill.id} 必须明确activationTiming。`,
    );
  }
  if (
    lifecycle.atMaxStacks !== "keep" &&
    lifecycle.atMaxStacks !== "refreshDuration"
  ) {
    throw new InvalidProbabilityError(
      `周期叠层技能 ${skill.id} 必须明确atMaxStacks行为。`,
    );
  }
  if (lifecycle.durationRounds !== undefined) {
    throw new InvalidProbabilityError(
      `周期叠层技能 ${skill.id} 已能保存duration配置，但共享/逐层到期规则尚未实现。`,
    );
  }
  if (lifecycle.atMaxStacks === "refreshDuration") {
    throw new InvalidProbabilityError(
      `周期叠层技能 ${skill.id} 的refreshDuration依赖尚未实现的叠层duration规则。`,
    );
  }
  if (lifecycle.decayRate !== undefined) {
    throw new InvalidProbabilityError(
      `周期叠层技能 ${skill.id} 不能把decay与stack混为同一数值规则。`,
    );
  }
  return lifecycle as PeriodicStackingConfiguration["lifecycle"];
}

function sameStackLifecycle(
  left: EffectLifecycle,
  right: EffectLifecycle,
): boolean {
  return (
    left.durationRounds === right.durationRounds &&
    left.activationTiming === right.activationTiming &&
    left.refreshMode === right.refreshMode &&
    left.maxStacks === right.maxStacks &&
    left.atMaxStacks === right.atMaxStacks &&
    left.decayRate === right.decayRate &&
    left.maxApplications === right.maxApplications
  );
}

function validateEveryNRoundsTrigger(trigger: EveryNRoundsTrigger): void {
  if (!Number.isSafeInteger(trigger.interval) || trigger.interval < 1) {
    throw new InvalidProbabilityError("everyNRounds.interval必须是正安全整数。");
  }
  if (
    trigger.firstTriggerRound === undefined ||
    !Number.isSafeInteger(trigger.firstTriggerRound) ||
    trigger.firstTriggerRound < 1
  ) {
    throw new InvalidProbabilityError(
      "everyNRounds必须显式提供正整数firstTriggerRound。",
    );
  }
  if (
    trigger.firstRound !== undefined &&
    trigger.firstRound !== trigger.firstTriggerRound
  ) {
    throw new InvalidProbabilityError("旧firstRound与firstTriggerRound不一致。");
  }
  if (
    trigger.triggerPhase === undefined ||
    !PROBABILITY_TRIGGER_PHASES.includes(trigger.triggerPhase)
  ) {
    throw new InvalidProbabilityError("everyNRounds必须显式提供triggerPhase。");
  }
  if (
    trigger.probability !== undefined &&
    (!Number.isFinite(trigger.probability) ||
      trigger.probability < 0 ||
      trigger.probability > 1)
  ) {
    throw new InvalidProbabilityError("everyNRounds.probability必须位于[0,1]。");
  }
}

function toStackRuntimeEffect(effect: SkillEffect): SkillEffect & {
  readonly type: MultiplicativeEffectType;
  readonly lifecycle?: never;
} {
  const { lifecycle: _unusedLifecycle, ...runtime } = effect;
  return { ...runtime, type: effect.type as MultiplicativeEffectType };
}

function assertStackCompatible(
  existing: ActiveEffect,
  incoming: ActiveEffect,
): void {
  if (
    existing.refreshMode !== "stack" ||
    existing.maxStacks !== incoming.maxStacks ||
    existing.valuePerStack !== incoming.valuePerStack ||
    existing.effect.type !== incoming.effect.type ||
    (existing.appliesToTroop ?? existing.effect.targetTroop ?? "all") !==
      (incoming.appliesToTroop ?? incoming.effect.targetTroop ?? "all") ||
    existing.activationTiming !== incoming.activationTiming ||
    existing.atMaxStacks !== incoming.atMaxStacks
  ) {
    throw new InvalidProbabilityError("同一identity的周期叠层配置不一致。");
  }
}
