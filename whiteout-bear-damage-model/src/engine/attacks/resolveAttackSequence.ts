import type {
  AttackDamageResult,
  AttackEvent,
  AttackPhase,
  AttackResolutionStep,
  AttackSequenceResult,
} from "../../domain/attack";
import type { BattleState } from "../../domain/battleState";
import type { DamageBreakdown, ResolvedDamageComponent } from "../../domain/damageComponent";
import type { ResolvedSkillEffect } from "../../domain/skill";
import { validateBattleState } from "../rounds/battleState";
import { createDamageBreakdown } from "../damage/resolveDamageComponent";
import {
  ABSOLUTE_MAX_ATTACK_EVENTS,
  extraAttackEffectValidationErrors,
} from "./extraAttackEffect";
import { AttackRecursionLimitError, InvalidAttackEventError } from "./errors";

export interface AttackDamageCalculation {
  readonly damageBreakdown: DamageBreakdown;
  readonly extraDamageComponents: readonly ResolvedDamageComponent[];
  readonly extraAttackEffects: readonly ResolvedSkillEffect[];
  readonly triggeredSkills?: readonly string[];
}

export interface ResolveAttackSequenceInput {
  readonly initialState: BattleState;
  readonly primaryAttack: AttackEvent;
  readonly calculateAttack: (
    event: AttackEvent,
    state: BattleState,
  ) => AttackDamageCalculation;
  /** 测试或已确认规则显式提供；缺省时状态保持不变。 */
  readonly transitionAtPhase?: (
    state: BattleState,
    event: AttackEvent,
    phase: Exclude<AttackPhase, "damageResolution">,
  ) => BattleState;
}

/**
 * 深度优先结算一次主攻击及其子攻击。每个子攻击都会重新调用calculateAttack，
 * 并接收上一攻击完成后的最新BattleState。
 */
export function resolveAttackSequence(
  input: ResolveAttackSequenceInput,
): AttackSequenceResult {
  validateBattleState(input.initialState);
  validateAttackEvent(input.primaryAttack);
  if (input.primaryAttack.kind !== "normal" || input.primaryAttack.attackDepth !== 0) {
    throw new InvalidAttackEventError("攻击序列必须从depth=0的normal攻击开始。");
  }
  const attacks: AttackDamageResult[] = [];
  let nextAttackIndex = Math.max(1, input.primaryAttack.attackIndex + 1);

  const execute = (event: AttackEvent, startingState: BattleState): BattleState => {
    if (attacks.length >= ABSOLUTE_MAX_ATTACK_EVENTS) {
      throw new AttackRecursionLimitError(
        `单个攻击序列超过${ABSOLUTE_MAX_ATTACK_EVENTS}个事件，已阻止继续展开。`,
      );
    }
    validateAttackEvent(event);
    const stateBefore = startingState;
    let state = startingState;
    const phases: AttackPhase[] = [];
    for (const phase of ["beforeAttack", "onAttack"] as const) {
      if (event.triggerPolicy[phase]) {
        phases.push(phase);
        state = transition(input, state, event, phase);
      }
    }
    phases.push("damageResolution");
    const calculation = input.calculateAttack(event, state);
    validateCalculation(calculation, event.id);
    if (event.triggerPolicy.afterAttack) {
      phases.push("afterAttack");
      state = transition(input, state, event, "afterAttack");
    }
    const result: AttackDamageResult = {
      attackId: event.id,
      round: event.round,
      troopType: event.troopType,
      kind: event.kind,
      ...(event.sourceSkillId === undefined
        ? {}
        : { sourceSkillId: event.sourceSkillId }),
      ...(event.parentAttackId === undefined
        ? {}
        : { parentAttackId: event.parentAttackId }),
      attackIndex: event.attackIndex,
      attackDepth: event.attackDepth,
      damageScale: event.damageScale,
      normalDamage: calculation.damageBreakdown.normalDamage,
      extraDamage: calculation.damageBreakdown.extraDamage,
      totalDamage: calculation.damageBreakdown.totalDamage,
      damageBreakdown: calculation.damageBreakdown,
      extraDamageComponents: calculation.extraDamageComponents,
      triggeredSkills: calculation.triggeredSkills ?? [],
      phases,
      stateBefore,
      stateAfter: state,
    };
    attacks.push(result);

    if (!event.triggerPolicy.canTriggerExtraAttack) return state;
    for (const effect of calculation.extraAttackEffects) {
      if (effect.status !== "supported") continue;
      assertCompleteExtraAttackEffect(effect);
      for (let countIndex = 0; countIndex < effect.count!; countIndex += 1) {
        const childDepth = event.attackDepth + 1;
        if (childDepth > effect.maxAttackDepth!) {
          throw new AttackRecursionLimitError(
            `技能 ${effect.skillId} 产生depth=${childDepth}的攻击，超过显式maxAttackDepth=${effect.maxAttackDepth}。`,
          );
        }
        const child: AttackEvent = {
          id: `${event.id}.extra.${effect.skillId}.${countIndex}.${nextAttackIndex}`,
          round: event.round,
          troopType: event.troopType,
          kind: "extra",
          sourceSkillId: effect.skillId,
          parentAttackId: event.id,
          attackIndex: nextAttackIndex,
          attackDepth: childDepth,
          damageScale: event.damageScale * effect.damageScale!,
          triggerPolicy: effect.triggerPolicy!,
        };
        nextAttackIndex += 1;
        state = execute(child, state);
      }
    }
    return state;
  };

  const finalState = execute(input.primaryAttack, input.initialState);
  const primaryAttackDamage = attacks
    .filter((attack) => attack.kind === "normal")
    .reduce((sum, attack) => sum + attack.totalDamage, 0);
  const extraAttackDamage = attacks
    .filter((attack) => attack.kind === "extra")
    .reduce((sum, attack) => sum + attack.totalDamage, 0);
  const damageBreakdown = attacks.reduce(
    (sum, attack) =>
      createDamageBreakdown(
        sum.normalDamage + attack.normalDamage,
        sum.extraDamage + attack.extraDamage,
      ),
    createDamageBreakdown(0, 0),
  );
  return {
    attacks,
    finalState,
    damageBreakdown,
    primaryAttackDamage,
    extraAttackDamage,
  };
}

export function assertCompleteExtraAttackEffect(
  effect: ResolvedSkillEffect,
): void {
  const errors = extraAttackEffectValidationErrors(effect);
  if (errors.length > 0) {
    throw new InvalidAttackEventError(
      `技能 ${effect.skillId} 的extraAttack配置不完整：${errors.join("；")}。`,
    );
  }
}

function transition(
  input: ResolveAttackSequenceInput,
  state: BattleState,
  event: AttackEvent,
  phase: Exclude<AttackPhase, "damageResolution">,
): BattleState {
  const next = input.transitionAtPhase?.(state, event, phase) ?? state;
  validateBattleState(next);
  if (
    next.currentRound !== state.currentRound ||
    next.totalRounds !== state.totalRounds ||
    next.status !== state.status
  ) {
    throw new InvalidAttackEventError(
      "攻击phase转换只能更新动态效果，不能推进回合或改变战斗状态。",
    );
  }
  return next;
}

function validateAttackEvent(event: AttackEvent): void {
  if (!event.id) throw new InvalidAttackEventError("AttackEvent.id不能为空。");
  if (!Number.isSafeInteger(event.round) || event.round < 1) {
    throw new InvalidAttackEventError("AttackEvent.round必须是正安全整数。");
  }
  if (!Number.isSafeInteger(event.attackIndex) || event.attackIndex < 0) {
    throw new InvalidAttackEventError("AttackEvent.attackIndex必须是非负安全整数。");
  }
  if (!Number.isSafeInteger(event.attackDepth) || event.attackDepth < 0) {
    throw new InvalidAttackEventError("AttackEvent.attackDepth必须是非负安全整数。");
  }
  if (!Number.isFinite(event.damageScale) || event.damageScale < 0) {
    throw new InvalidAttackEventError("AttackEvent.damageScale必须是非负有限数。");
  }
}

function validateCalculation(
  calculation: AttackDamageCalculation,
  attackId: string,
): void {
  const breakdown = calculation.damageBreakdown;
  if (
    !Number.isFinite(breakdown.normalDamage) ||
    !Number.isFinite(breakdown.extraDamage) ||
    !Number.isFinite(breakdown.totalDamage) ||
    breakdown.totalDamage !== breakdown.normalDamage + breakdown.extraDamage
  ) {
    throw new InvalidAttackEventError(
      `攻击 ${attackId} 返回了非法DamageBreakdown。`,
    );
  }
}

