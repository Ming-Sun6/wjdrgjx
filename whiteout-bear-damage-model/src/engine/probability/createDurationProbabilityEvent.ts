import type {
  ActiveEffect,
  ActiveEffectIdentity,
  BattleState,
} from "../../domain/battleState";
import type {
  ExplicitProbabilitySkillTrigger,
  StatefulBernoulliTransition,
} from "../../domain/probability";
import {
  EFFECT_TYPES,
  PROBABILITY_TRIGGER_FREQUENCIES,
  PROBABILITY_TRIGGER_PHASES,
  type EffectActivationTiming,
  type ProbabilityTriggerFrequency,
  type ProbabilityTriggerPhase,
  type Skill,
  type SkillEffect,
} from "../../domain/skill";
import { assertCompleteExtraDamageEffect } from "../damage/resolveDamageComponent";
import {
  activeEffectIdentityKey,
  createActiveEffect,
  validateActiveEffect,
} from "../rounds/activeEffects";
import { validateBattleState } from "../rounds/battleState";
import { InvalidProbabilityError } from "./errors";
import { validateProbability } from "./probabilityMath";

const SUPPORTED_DURATION_PHASES: ReadonlySet<ProbabilityTriggerPhase> = new Set([
  "roundStart",
  "beforeAttack",
  "onAttack",
]);

const SUPPORTED_DURATION_FREQUENCIES: ReadonlySet<ProbabilityTriggerFrequency> =
  new Set(["oncePerBattle", "oncePerRound", "explicitSchedule"]);

export interface DurationProbabilityEventOptions {
  /** 区分同一技能的不同英雄、槽位或兵种技能实例。 */
  readonly sourceId?: string;
  readonly eventId?: string;
}

/**
 * 创建“Bernoulli触发后写入ActiveEffect”的事件。
 * 判定出现在哪些回合仍由 ExactProbabilityScenario 显式安排。
 */
export function createDurationProbabilityEvent(
  skill: Skill,
  options: DurationProbabilityEventOptions = {},
): StatefulBernoulliTransition {
  const trigger = validateDurationProbabilitySkill(skill);
  const sourceId = options.sourceId ?? skill.id;
  const eventId = options.eventId ?? `duration.${sourceId}.${skill.id}`;
  if (!sourceId || !eventId) {
    throw new InvalidProbabilityError("持续概率事件的 sourceId 和 eventId 不能为空。");
  }

  return {
    kind: "stateTransition",
    id: eventId,
    trigger,
    applyTriggered: (state, context) => {
      validateBattleState(state);
      let activeEffects = state.activeEffects;
      for (const [effectIndex, effect] of skill.effects.entries()) {
        const lifecycle = resolveDurationLifecycle(skill, effect);
        const effectId = `${skill.id}.effect.${effectIndex}`;
        const identity: ActiveEffectIdentity = {
          sourceId,
          sourceSkillId: skill.id,
          effectId,
        };
        const activeFromRound =
          lifecycle.activationTiming === "immediate"
            ? context.round
            : context.round + 1;
        const incoming = createActiveEffect({
          id: `active:${activeEffectIdentityKey(identity)}`,
          identity,
          sourceSkillId: skill.id,
          effect: toRuntimeEffect(effect),
          ...(effect.targetTroop === undefined || effect.targetTroop === "all"
            ? {}
            : { appliesToTroop: effect.targetTroop }),
          durationRounds: lifecycle.durationRounds!,
          remainingRounds: lifecycle.durationRounds!,
          refreshMode: lifecycle.refreshMode!,
          activationTiming: lifecycle.activationTiming!,
          appliedRound: context.round,
          lastAppliedRound: context.round,
          activeFromRound,
          stackCount: 1,
          applicationCount: 1,
        });
        activeEffects = upsertDurationActiveEffect(activeEffects, incoming);
      }
      const next = { ...state, activeEffects };
      validateBattleState(next);
      return next;
    },
  };
}

/** refresh只刷新同一完整identity；数值不增加也不改变。 */
export function upsertDurationActiveEffect(
  effects: readonly ActiveEffect[],
  incoming: ActiveEffect,
): readonly ActiveEffect[] {
  validateActiveEffect(incoming);
  const incomingKey = activeEffectIdentityKey(incoming.identity);
  const index = effects.findIndex(
    (effect) => activeEffectIdentityKey(effect.identity) === incomingKey,
  );
  if (index < 0) return [...effects, incoming];

  const existing = effects[index]!;
  validateActiveEffect(existing);
  if (incoming.refreshMode === "stack") {
    throw new InvalidProbabilityError(
      `效果 ${incomingKey} 使用 stack；叠层留待下一阶段。`,
    );
  }

  let replacement: ActiveEffect;
  if (incoming.refreshMode === "refresh") {
    assertRefreshCompatible(existing, incoming);
    const refreshesWhileCurrentEffectIsActive =
      incoming.activationTiming === "nextRound" &&
      existing.activeFromRound !== undefined &&
      incoming.appliedRound !== undefined &&
      existing.activeFromRound <= incoming.appliedRound;
    replacement = {
      ...existing,
      durationRounds: incoming.durationRounds!,
      // nextRound 效果在本回合已经生效时再次触发，既不能抹掉本回合效果，
      // 也不能在回合末把刚预约的下一回合一起删除。因此这里同时保留
      // “当前回合剩余1次”与新预约的完整 duration。
      remainingRounds:
        incoming.durationRounds! + (refreshesWhileCurrentEffectIsActive ? 1 : 0),
      refreshMode: "refresh",
      lastAppliedRound: incoming.lastAppliedRound!,
      applicationCount: existing.applicationCount + 1,
    };
  } else if (incoming.refreshMode === "replace") {
    replacement = {
      ...incoming,
      applicationCount: existing.applicationCount + 1,
    };
  } else {
    throw new InvalidProbabilityError(
      `持续效果 ${incomingKey} 必须明确使用 refresh 或 replace。`,
    );
  }
  validateActiveEffect(replacement);
  return effects.map((effect, effectIndex) =>
    effectIndex === index ? replacement : effect,
  );
}

/**
 * 显式的回合后生命周期转换：只有本回合已经生效的状态才消耗一次时长。
 * 它不推进回合，适合作为 ExactProbabilityScenario.transitionAfterRound。
 */
export function advanceDurationEffectsAfterRound(
  state: BattleState,
): BattleState {
  validateBattleState(state);
  const activeEffects = state.activeEffects.flatMap((active) => {
    validateActiveEffect(active);
    if (active.remainingRounds === undefined) return [active];
    if (
      active.activeFromRound !== undefined &&
      active.activeFromRound > state.currentRound
    ) {
      return [active];
    }
    if (active.remainingRounds <= 1) return [];
    return [{ ...active, remainingRounds: active.remainingRounds - 1 }];
  });
  const next = { ...state, activeEffects };
  validateBattleState(next);
  return next;
}

export function isActiveEffectEffectiveInRound(
  active: ActiveEffect,
  round: number,
): boolean {
  validateActiveEffect(active);
  if (!Number.isSafeInteger(round) || round < 1) {
    throw new InvalidProbabilityError("效果生效回合必须是正安全整数。");
  }
  return (
    (active.remainingRounds === undefined || active.remainingRounds > 0) &&
    (active.activeFromRound === undefined || active.activeFromRound <= round)
  );
}

function validateDurationProbabilitySkill(
  skill: Skill,
): ExplicitProbabilitySkillTrigger {
  if (skill.status !== "supported") {
    throw new InvalidProbabilityError(
      `持续概率技能 ${skill.id} 必须明确标记为 supported。`,
    );
  }
  if (skill.trigger.type !== "probability") {
    throw new InvalidProbabilityError(
      `持续概率技能 ${skill.id} 必须使用 probability trigger。`,
    );
  }
  validateProbability(skill.trigger.probability, `${skill.id}.probability`);
  if (
    skill.trigger.triggerPhase === undefined ||
    !PROBABILITY_TRIGGER_PHASES.includes(skill.trigger.triggerPhase) ||
    !SUPPORTED_DURATION_PHASES.has(skill.trigger.triggerPhase)
  ) {
    throw new InvalidProbabilityError(
      `持续概率技能 ${skill.id} 必须提供可在当前伤害前执行的 triggerPhase。`,
    );
  }
  if (
    skill.trigger.frequency === undefined ||
    !PROBABILITY_TRIGGER_FREQUENCIES.includes(skill.trigger.frequency) ||
    !SUPPORTED_DURATION_FREQUENCIES.has(skill.trigger.frequency)
  ) {
    throw new InvalidProbabilityError(
      `持续概率技能 ${skill.id} 必须提供当前引擎可执行的判定 frequency。`,
    );
  }
  if (skill.effects.length === 0) {
    throw new InvalidProbabilityError(
      `持续概率技能 ${skill.id} 必须至少包含一个乘区效果。`,
    );
  }
  for (const [effectIndex, effect] of skill.effects.entries()) {
    if (effect.status !== "supported") {
      throw new InvalidProbabilityError(
        `持续概率技能 ${skill.id} 的效果 ${effectIndex} 必须标记 supported。`,
      );
    }
    if (!EFFECT_TYPES.includes(effect.type)) {
      throw new InvalidProbabilityError(
        `持续概率技能 ${skill.id} 包含未知效果类型。`,
      );
    }
    if (effect.type === "extraAttack") {
      throw new InvalidProbabilityError(
        `持续概率技能 ${skill.id} 不能包含 ${effect.type}。`,
      );
    }
    if (effect.type === "extraDamage") {
      try {
        assertCompleteExtraDamageEffect(
          effect,
          `持续概率技能 ${skill.id} 的效果 ${effectIndex}`,
        );
      } catch (error) {
        throw new InvalidProbabilityError(
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    if (!Number.isFinite(effect.value)) {
      throw new InvalidProbabilityError(
        `持续概率技能 ${skill.id} 的效果值必须是有限数。`,
      );
    }
    resolveDurationLifecycle(skill, effect);
  }

  return skill.trigger as ExplicitProbabilitySkillTrigger;
}

interface SupportedDurationLifecycle {
  readonly durationRounds: number;
  readonly activationTiming: EffectActivationTiming;
  readonly refreshMode: "refresh" | "replace";
}

function resolveDurationLifecycle(
  skill: Skill,
  effect: SkillEffect,
): SupportedDurationLifecycle {
  if (
    skill.lifecycle !== undefined &&
    effect.lifecycle !== undefined &&
    !sameLifecycle(skill.lifecycle, effect.lifecycle)
  ) {
    throw new InvalidProbabilityError(
      `持续概率技能 ${skill.id} 的 Skill 与 effect lifecycle 声明不一致。`,
    );
  }
  const lifecycle = effect.lifecycle ?? skill.lifecycle;
  if (
    lifecycle?.durationRounds === undefined ||
    !Number.isSafeInteger(lifecycle.durationRounds) ||
    lifecycle.durationRounds < 1
  ) {
    throw new InvalidProbabilityError(
      `持续概率技能 ${skill.id} 必须提供正整数 durationRounds。`,
    );
  }
  if (
    lifecycle.activationTiming !== "immediate" &&
    lifecycle.activationTiming !== "nextRound"
  ) {
    throw new InvalidProbabilityError(
      `持续概率技能 ${skill.id} 必须明确 activationTiming。`,
    );
  }
  if (lifecycle.refreshMode !== "refresh" && lifecycle.refreshMode !== "replace") {
    throw new InvalidProbabilityError(
      `持续概率技能 ${skill.id} 必须明确 refresh 或 replace；stack尚未实现。`,
    );
  }
  if (
    lifecycle.maxStacks !== undefined ||
    lifecycle.atMaxStacks !== undefined ||
    lifecycle.decayRate !== undefined ||
    lifecycle.maxApplications !== undefined
  ) {
    throw new InvalidProbabilityError(
      `持续概率技能 ${skill.id} 不能包含叠层、衰减或限定应用次数。`,
    );
  }
  if (
    skill.trigger.type === "probability" &&
    skill.trigger.durationRounds !== undefined &&
    skill.trigger.durationRounds !== lifecycle.durationRounds
  ) {
    throw new InvalidProbabilityError(
      `持续概率技能 ${skill.id} 的 trigger 与 lifecycle durationRounds 不一致。`,
    );
  }
  return {
    durationRounds: lifecycle.durationRounds,
    activationTiming: lifecycle.activationTiming,
    refreshMode: lifecycle.refreshMode,
  };
}

function toRuntimeEffect(effect: SkillEffect): SkillEffect & {
  readonly lifecycle?: never;
} {
  const { lifecycle: _unusedLifecycle, ...runtime } = effect;
  return runtime;
}

function assertRefreshCompatible(
  existing: ActiveEffect,
  incoming: ActiveEffect,
): void {
  if (
    existing.effect.type !== incoming.effect.type ||
    existing.effect.value !== incoming.effect.value ||
    (existing.appliesToTroop ?? existing.effect.targetTroop ?? "all") !==
      (incoming.appliesToTroop ?? incoming.effect.targetTroop ?? "all") ||
    existing.activationTiming !== incoming.activationTiming ||
    existing.durationRounds !== incoming.durationRounds
  ) {
    throw new InvalidProbabilityError(
      `refresh不能改变效果数值、类型、目标、duration或activationTiming；需要变更时应使用replace。`,
    );
  }
}

function sameLifecycle(
  left: NonNullable<Skill["lifecycle"]>,
  right: NonNullable<Skill["lifecycle"]>,
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
