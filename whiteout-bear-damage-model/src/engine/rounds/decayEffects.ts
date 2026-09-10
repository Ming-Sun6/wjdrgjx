import type { ActiveEffect } from "../../domain/battleState";
import { validateActiveEffect } from "./activeEffects";
import { InvalidBattleStateError } from "./errors";

export interface DecayApplicationResult {
  readonly activeEffect: ActiveEffect;
  readonly applied: boolean;
  readonly applicationNumber: number | null;
  readonly appliedValue: number | null;
}

/** 第k次应用：x_k = x_1 * decayRate^(k-1)。 */
export function calculateDecayedApplicationValue(
  baseValue: number,
  decayRate: number,
  applicationNumber: number,
): number {
  if (!Number.isFinite(baseValue)) {
    throw new InvalidBattleStateError("衰减基础效果必须是有限数。");
  }
  if (!Number.isFinite(decayRate) || decayRate < 0 || decayRate > 1) {
    throw new InvalidBattleStateError("decayRate必须位于[0,1]。");
  }
  if (!Number.isSafeInteger(applicationNumber) || applicationNumber < 1) {
    throw new InvalidBattleStateError("applicationNumber必须是正安全整数。");
  }
  return baseValue * decayRate ** (applicationNumber - 1);
}

/**
 * 记录一次独立衰减应用并返回本次值；不改变stackCount，也不复制伤害公式。
 * 达到maxApplications后返回applied=false并保持原状态。
 */
export function applyDecayingEffectApplication(
  active: ActiveEffect,
): DecayApplicationResult {
  validateActiveEffect(active);
  if (active.decayRate === undefined) {
    throw new InvalidBattleStateError("衰减应用必须配置decayRate。");
  }
  if (
    active.maxApplications !== undefined &&
    active.applicationCount >= active.maxApplications
  ) {
    return {
      activeEffect: active,
      applied: false,
      applicationNumber: null,
      appliedValue: null,
    };
  }
  const applicationNumber = active.applicationCount + 1;
  const appliedValue = calculateDecayedApplicationValue(
    active.effect.value,
    active.decayRate,
    applicationNumber,
  );
  const activeEffect = { ...active, applicationCount: applicationNumber };
  validateActiveEffect(activeEffect);
  return { activeEffect, applied: true, applicationNumber, appliedValue };
}
