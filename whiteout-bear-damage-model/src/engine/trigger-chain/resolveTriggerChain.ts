import type {
  BattleEvent,
  LinkedSkillDefinition,
  SkippedTriggerChainEffect,
  TriggerChainBranch,
  TriggerChainEffectDefinition,
  TriggerChainProbabilityTransition,
  TriggerChainResolution,
  TriggeredSkillDefinition,
} from "../../domain/battleEvent";
import type { ActiveEffect, ActiveEffectIdentity, BattleState } from "../../domain/battleState";
import type { BearBattleContext } from "../../domain/bearBattle";
import type { TransientSkillEffect } from "../../domain/probability";
import type {
  EffectLifecycle,
  ProbabilityTriggerFrequency,
  ProbabilityTriggerPhase,
  SkillEffect,
  SkillTrigger,
} from "../../domain/skill";
import { extraAttackEffectValidationErrors } from "../attacks/extraAttackEffect";
import { assertCompleteExtraDamageEffect } from "../damage/resolveDamageComponent";
import {
  activeEffectIdentityKey,
  createActiveEffect,
} from "../rounds/activeEffects";
import { validateBattleState } from "../rounds/battleState";
import { upsertDurationActiveEffect } from "../probability/createDurationProbabilityEvent";
import { addStackApplication } from "../probability/periodicStackingEffects";
import { validateProbability } from "../probability/probabilityMath";
import { matchesBattleConditions } from "./conditions";
import {
  InvalidTriggerChainError,
  TriggerChainCycleError,
  TriggerChainDepthError,
} from "./errors";

export const ABSOLUTE_MAX_TRIGGER_DEPTH = 64;

interface MutableTriggerChainBranch {
  probability: number;
  state: BattleState;
  transientEffects: readonly TransientSkillEffect[];
  events: readonly BattleEvent[];
  skippedEffects: readonly SkippedTriggerChainEffect[];
}

export interface ResolveTriggeredSkillChainInput {
  readonly transition: TriggerChainProbabilityTransition;
  readonly state: BattleState;
  readonly battleContext: BearBattleContext;
  readonly probability: number;
  readonly transientEffects?: readonly TransientSkillEffect[];
}

/**
 * 解析已经命中的根技能。联动中的独立概率会继续精确分支；本函数不计算伤害。
 */
export function resolveTriggeredSkillChain(
  input: ResolveTriggeredSkillChainInput,
): TriggerChainResolution {
  validateTriggerChainTransition(input.transition);
  validateBattleState(input.state);
  validateProbability(input.probability, "triggerChain.initialProbability");
  if (input.probability === 0) {
    return { branches: [], probabilityMass: 0, maxDepthReached: 0 };
  }

  const rootEvent = createRootSkillEvent(
    input.transition,
    input.state,
    input.battleContext,
  );
  let branches: readonly MutableTriggerChainBranch[] = [
    {
      probability: input.probability,
      state: input.state,
      transientEffects: input.transientEffects ?? [],
      events: input.transition.parentEvent === undefined
        ? [rootEvent]
        : [input.transition.parentEvent, rootEvent],
      skippedEffects: [],
    },
  ];
  branches = branches.map((branch) =>
    applySkillEffects(
      branch,
      input.transition.rootSkill,
      rootEvent,
      rootEvent,
      input.transition.trigger.probability,
      input.transition.trigger.triggerPhase,
      input.transition.trigger.frequency,
      input.battleContext,
    ),
  );
  branches = processLinkedSkills(
    branches,
    rootEvent,
    input.transition,
    input.battleContext,
  );

  const probabilityMass = branches.reduce(
    (sum, branch) => sum + branch.probability,
    0,
  );
  return {
    branches,
    probabilityMass,
    maxDepthReached: branches.reduce(
      (maximum, branch) =>
        Math.max(maximum, ...branch.events.map((event) => event.depth)),
      rootEvent.depth,
    ),
  };
}

export function validateTriggerChainTransition(
  transition: TriggerChainProbabilityTransition,
): void {
  if (!transition.id || !transition.rootSkill.skillId) {
    throw new InvalidTriggerChainError("触发链事件ID和根技能ID不能为空。 ");
  }
  if (transition.rootSkill.status !== "supported") {
    throw new InvalidTriggerChainError("触发链根技能必须明确标记supported。 ");
  }
  validateProbability(transition.trigger.probability, `${transition.id}.probability`);
  if (
    transition.trigger.triggerPhase === undefined ||
    transition.trigger.frequency === undefined ||
    transition.trigger.frequency === "oncePerAttack"
  ) {
    throw new InvalidTriggerChainError(
      "根技能必须提供可显式调度的triggerPhase/frequency；oncePerAttack仍待攻击粒度规则。",
    );
  }
  assertTriggerDepth(transition.maxTriggerDepth, "maxTriggerDepth");
  validateTriggeredSkill(transition.rootSkill);
  const linkedIds = new Set<string>();
  for (const linked of transition.linkedSkills) {
    if (linkedIds.has(linked.id)) {
      throw new InvalidTriggerChainError(`存在重复联动规则ID：${linked.id}。`);
    }
    linkedIds.add(linked.id);
    validateLinkedSkill(linked);
  }
  assertAcyclicTriggerChain(
    transition.rootSkill.skillId,
    transition.linkedSkills,
  );
}

export function isTriggerChainProbabilityTransition(
  event: { readonly kind?: string },
): event is TriggerChainProbabilityTransition {
  return event.kind === "triggerChain";
}

function processLinkedSkills(
  initial: readonly MutableTriggerChainBranch[],
  sourceEvent: BattleEvent,
  transition: TriggerChainProbabilityTransition,
  battleContext: BearBattleContext,
): readonly MutableTriggerChainBranch[] {
  let branches = initial;
  for (const linked of transition.linkedSkills) {
    if (requiredSourceSkillId(linked.trigger) !== sourceEvent.skillId) continue;
    const next: MutableTriggerChainBranch[] = [];
    for (const branch of branches) {
      if (
        !matchesBattleConditions(linked.conditions, {
          sourceEvent,
          battleState: branch.state,
          battleContext,
        })
      ) {
        next.push(branch);
        continue;
      }
      const probability = linkedTriggerProbability(linked.trigger);
      const triggeredProbability = branch.probability * probability;
      const notTriggeredProbability = branch.probability * (1 - probability);
      if (notTriggeredProbability > 0) {
        next.push({ ...branch, probability: notTriggeredProbability });
      }
      if (triggeredProbability === 0) continue;

      const child = createLinkedSkillEvent(sourceEvent, linked, transition);
      let triggeredBranch: MutableTriggerChainBranch = {
        ...branch,
        probability: triggeredProbability,
        events: [...branch.events, child],
      };
      triggeredBranch = applySkillEffects(
        triggeredBranch,
        linked,
        sourceEvent,
        child,
        probability,
        child.triggerPhase!,
        linkedTriggerFrequency(linked.trigger),
        battleContext,
      );
      const descendants = processLinkedSkills(
        [triggeredBranch],
        child,
        transition,
        battleContext,
      );
      next.push(...descendants);
    }
    branches = next;
  }
  return branches;
}

function applySkillEffects(
  branch: MutableTriggerChainBranch,
  skill: TriggeredSkillDefinition,
  conditionSourceEvent: BattleEvent,
  producedEvent: BattleEvent,
  triggerProbability: number,
  triggerPhase: ProbabilityTriggerPhase,
  triggerFrequency: ProbabilityTriggerFrequency,
  battleContext: BearBattleContext,
): MutableTriggerChainBranch {
  let current = branch;
  for (const definition of skill.effects) {
    if (definition.status !== "supported") {
      current = {
        ...current,
        skippedEffects: [
          ...current.skippedEffects,
          skippedEffect(skill.skillId, definition),
        ],
      };
      continue;
    }
    if (
      !matchesBattleConditions(definition.conditions, {
        sourceEvent: conditionSourceEvent,
        battleState: current.state,
        battleContext,
      })
    ) {
      continue;
    }
    current = applyEffect(
      current,
      skill,
      definition,
      producedEvent,
      triggerProbability,
      triggerPhase,
      triggerFrequency,
    );
  }
  return current;
}

function applyEffect(
  branch: MutableTriggerChainBranch,
  skill: TriggeredSkillDefinition,
  definition: TriggerChainEffectDefinition,
  event: BattleEvent,
  triggerProbability: number,
  triggerPhase: ProbabilityTriggerPhase,
  triggerFrequency: ProbabilityTriggerFrequency,
): MutableTriggerChainBranch {
  assertRuntimeEffect(definition.effect, `${skill.skillId}.${definition.id}`);
  if (definition.application === "transient") {
    if (definition.effect.lifecycle !== undefined) {
      throw new InvalidTriggerChainError(
        `联动效果 ${definition.id} 声明transient时不能携带lifecycle。`,
      );
    }
    const transient: TransientSkillEffect = {
      id: `trigger-chain:${event.eventId}:${definition.id}`,
      sourceSkillId: skill.skillId,
      sourceSkillName: skill.skillName,
      effectIndex: skill.effects.indexOf(definition),
      effect: toTransientRuntimeEffect(definition.effect),
      triggerProbability,
      triggerPhase,
      triggerFrequency,
    };
    return {
      ...branch,
      transientEffects: [...branch.transientEffects, transient],
    };
  }

  const identity: ActiveEffectIdentity = {
    sourceId: skill.sourceId ?? skill.skillId,
    sourceSkillId: skill.skillId,
    effectId: definition.id,
  };
  const lifecycle = requireLifecycle(definition);
  const activeFromRound =
    lifecycle.activationTiming === "immediate"
      ? event.round
      : event.round + 1;
  const incoming = createActiveEffect({
    id: `active:${activeEffectIdentityKey(identity)}`,
    identity,
    sourceSkillId: skill.skillId,
    effect: withoutLifecycle(definition.effect),
    ...(definition.effect.targetTroop === undefined ||
    definition.effect.targetTroop === "all"
      ? {}
      : { appliesToTroop: definition.effect.targetTroop }),
    ...lifecycle,
    activationTiming: lifecycle.activationTiming,
    appliedRound: event.round,
    lastAppliedRound: event.round,
    activeFromRound,
    ...(definition.application === "duration"
      ? {
          remainingRounds: lifecycle.durationRounds!,
          stackCount: 1,
          applicationCount: 1,
        }
      : {
          valuePerStack: definition.effect.valuePerStack!,
          stackCount: 1,
          applicationCount: 1,
        }),
  });
  const activeEffects =
    definition.application === "duration"
      ? upsertDurationActiveEffect(branch.state.activeEffects, incoming)
      : addStackApplication(branch.state.activeEffects, incoming);
  const state = { ...branch.state, activeEffects };
  validateBattleState(state);
  return { ...branch, state };
}

function requireLifecycle(
  definition: TriggerChainEffectDefinition,
): EffectLifecycle & {
  readonly activationTiming: "immediate" | "nextRound";
} {
  const lifecycle = definition.effect.lifecycle;
  if (
    lifecycle === undefined ||
    (lifecycle.activationTiming !== "immediate" &&
      lifecycle.activationTiming !== "nextRound")
  ) {
    throw new InvalidTriggerChainError(
      `联动效果 ${definition.id} 必须明确lifecycle.activationTiming。`,
    );
  }
  if (definition.application === "duration") {
    if (
      !Number.isSafeInteger(lifecycle.durationRounds) ||
      lifecycle.durationRounds! < 1 ||
      (lifecycle.refreshMode !== "refresh" &&
        lifecycle.refreshMode !== "replace") ||
      lifecycle.maxStacks !== undefined ||
      lifecycle.atMaxStacks !== undefined ||
      lifecycle.decayRate !== undefined
    ) {
      throw new InvalidTriggerChainError(
        `持续联动效果 ${definition.id} 必须声明durationRounds及refresh/replace。`,
      );
    }
  } else if (
    lifecycle.refreshMode !== "stack" ||
    !Number.isSafeInteger(lifecycle.maxStacks) ||
    lifecycle.maxStacks! < 1 ||
    lifecycle.atMaxStacks !== "keep" ||
    lifecycle.durationRounds !== undefined ||
    lifecycle.decayRate !== undefined ||
    !Number.isFinite(definition.effect.valuePerStack) ||
    definition.effect.value !== definition.effect.valuePerStack
  ) {
    throw new InvalidTriggerChainError(
      `叠层联动效果 ${definition.id} 必须声明线性valuePerStack、maxStacks和keep。`,
    );
  }
  return lifecycle as EffectLifecycle & {
    readonly activationTiming: "immediate" | "nextRound";
  };
}

function assertRuntimeEffect(effect: SkillEffect, label: string): void {
  if (!Number.isFinite(effect.value)) {
    throw new InvalidTriggerChainError(`${label}.value必须是有限数。`);
  }
  if (effect.type === "extraDamage") {
    try {
      assertCompleteExtraDamageEffect(effect, label);
    } catch (error) {
      throw new InvalidTriggerChainError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  if (effect.type === "extraAttack") {
    const errors = extraAttackEffectValidationErrors(effect);
    if (errors.length > 0) {
      throw new InvalidTriggerChainError(`${label}：${errors.join("；")}。`);
    }
  }
}

function withoutLifecycle(effect: SkillEffect): SkillEffect {
  const {
    lifecycle: _unused,
    conditions: _conditions,
    triggerApplication: _application,
    maxTriggerDepth: _maxTriggerDepth,
    ...runtime
  } = effect;
  return { ...runtime, status: "supported" };
}

function toTransientRuntimeEffect(
  effect: SkillEffect,
): SkillEffect & { readonly lifecycle?: never } {
  const {
    lifecycle: _lifecycle,
    conditions: _conditions,
    triggerApplication: _application,
    maxTriggerDepth: _maxTriggerDepth,
    ...runtime
  } = effect;
  return { ...runtime, status: "supported" };
}

function createRootSkillEvent(
  transition: TriggerChainProbabilityTransition,
  state: BattleState,
  battleContext: BearBattleContext,
): BattleEvent {
  const parent = transition.parentEvent;
  const eventId = `${transition.id}.skill.${transition.rootSkill.skillId}`;
  return {
    eventId,
    type: "skillTriggered",
    round: state.currentRound,
    skillId: transition.rootSkill.skillId,
    triggered: true,
    ...(parent === undefined
      ? {}
      : { sourceEventId: parent.eventId, parentEventId: parent.eventId }),
    rootEventId: parent?.rootEventId ?? eventId,
    depth: (parent?.depth ?? -1) + 1,
    ...(transition.attackerTroopType === undefined
      ? {}
      : { attackerTroopType: transition.attackerTroopType }),
    enemyTroopType: battleContext.enemyTroopType,
    ...(transition.attackKind === undefined
      ? {}
      : { attackKind: transition.attackKind }),
    triggerPhase: transition.trigger.triggerPhase,
  };
}

function createLinkedSkillEvent(
  source: BattleEvent,
  linked: LinkedSkillDefinition,
  transition: TriggerChainProbabilityTransition,
): BattleEvent {
  const depth = source.depth + 1;
  const limit = linked.maxTriggerDepth ?? transition.maxTriggerDepth;
  const triggerPhase =
    linked.trigger.type === "probability"
      ? linked.trigger.triggerPhase
      : source.triggerPhase;
  if (depth > limit) {
    throw new TriggerChainDepthError(
      `技能 ${linked.skillId} 的depth=${depth}超过maxTriggerDepth=${limit}。`,
    );
  }
  return {
    eventId: `${source.eventId}.linked.${linked.id}.${linked.skillId}`,
    type: "skillTriggered",
    round: source.round,
    skillId: linked.skillId,
    triggered: true,
    sourceEventId: source.eventId,
    parentEventId: source.eventId,
    rootEventId: source.rootEventId,
    depth,
    ...(source.attackerTroopType === undefined
      ? {}
      : { attackerTroopType: source.attackerTroopType }),
    ...(source.enemyTroopType === undefined
      ? {}
      : { enemyTroopType: source.enemyTroopType }),
    ...(source.attackKind === undefined
      ? {}
      : { attackKind: source.attackKind }),
    ...(triggerPhase === undefined ? {} : { triggerPhase }),
  };
}

function validateTriggeredSkill(skill: TriggeredSkillDefinition): void {
  if (!skill.skillId || !skill.skillName) {
    throw new InvalidTriggerChainError("联动技能ID和名称不能为空。 ");
  }
  const ids = new Set<string>();
  for (const effect of skill.effects) {
    if (!effect.id || ids.has(effect.id)) {
      throw new InvalidTriggerChainError(
        `技能 ${skill.skillId} 存在空或重复effect ID。`,
      );
    }
    ids.add(effect.id);
    if (
      effect.status !== "supported" &&
      !(effect.pendingReason ?? effect.unsupportedReason)?.trim()
    ) {
      throw new InvalidTriggerChainError(
        `技能 ${skill.skillId} 的${effect.status}效果必须提供原因。`,
      );
    }
  }
}

function validateLinkedSkill(skill: LinkedSkillDefinition): void {
  if (!skill.id) throw new InvalidTriggerChainError("联动规则ID不能为空。 ");
  validateTriggeredSkill(skill);
  if (skill.maxTriggerDepth !== undefined) {
    assertTriggerDepth(skill.maxTriggerDepth, `${skill.id}.maxTriggerDepth`);
  }
  if (skill.trigger.type === "onSkillTrigger") {
    if (!skill.trigger.sourceSkillId) {
      throw new InvalidTriggerChainError(
        `联动规则 ${skill.id} 必须声明sourceSkillId。`,
      );
    }
    return;
  }
  validateProbability(skill.trigger.probability, `${skill.id}.probability`);
  if (
    skill.trigger.event !== "onSkillTrigger" ||
    !skill.trigger.requiredSkillId ||
    skill.trigger.triggerPhase === undefined ||
    skill.trigger.frequency !== "explicitSchedule"
  ) {
    throw new InvalidTriggerChainError(
      `概率联动 ${skill.id} 必须声明event=onSkillTrigger、requiredSkillId、triggerPhase和explicitSchedule。`,
    );
  }
}

function requiredSourceSkillId(trigger: LinkedSkillDefinition["trigger"]): string {
  return trigger.type === "onSkillTrigger"
    ? trigger.sourceSkillId!
    : trigger.requiredSkillId!;
}

function linkedTriggerProbability(
  trigger: LinkedSkillDefinition["trigger"],
): number {
  return trigger.type === "onSkillTrigger" ? 1 : trigger.probability;
}

function linkedTriggerFrequency(
  trigger: LinkedSkillDefinition["trigger"],
): ProbabilityTriggerFrequency {
  return trigger.type === "onSkillTrigger"
    ? "explicitSchedule"
    : trigger.frequency!;
}

function assertAcyclicTriggerChain(
  rootSkillId: string,
  linkedSkills: readonly LinkedSkillDefinition[],
): void {
  const edges = new Map<string, string[]>();
  for (const linked of linkedSkills) {
    const source = requiredSourceSkillId(linked.trigger);
    edges.set(source, [...(edges.get(source) ?? []), linked.skillId]);
  }
  const active = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];
  const visit = (skillId: string): void => {
    if (active.has(skillId)) {
      const cycleStart = path.indexOf(skillId);
      const cycle = [...path.slice(cycleStart), skillId];
      throw new TriggerChainCycleError(`检测到技能联动循环：${cycle.join(" -> ")}。`);
    }
    if (visited.has(skillId)) return;
    active.add(skillId);
    path.push(skillId);
    for (const target of edges.get(skillId) ?? []) visit(target);
    path.pop();
    active.delete(skillId);
    visited.add(skillId);
  };
  visit(rootSkillId);
}

function assertTriggerDepth(value: number, label: string): void {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > ABSOLUTE_MAX_TRIGGER_DEPTH
  ) {
    throw new TriggerChainDepthError(
      `${label}必须是1～${ABSOLUTE_MAX_TRIGGER_DEPTH}的安全整数。`,
    );
  }
}

function skippedEffect(
  skillId: string,
  definition: TriggerChainEffectDefinition,
): SkippedTriggerChainEffect {
  return {
    skillId,
    effectId: definition.id,
    status: definition.status as "pending" | "unsupported",
    reason:
      definition.pendingReason ??
      definition.unsupportedReason ??
      `${definition.status}效果未提供原因。`,
  };
}
