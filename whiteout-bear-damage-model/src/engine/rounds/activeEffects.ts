import type {
  ActiveEffect,
  ActiveEffectIdentity,
} from "../../domain/battleState";
import { InvalidBattleStateError } from "./errors";

export type ActiveEffectInput = Omit<
  ActiveEffect,
  "identity" | "stackCount" | "applicationCount"
> & {
  readonly identity?: ActiveEffectIdentity;
  readonly stackCount?: number;
  readonly applicationCount?: number;
};

/** 只建立状态，不决定在触发回合内何时开始计时。 */
export function createActiveEffect(input: ActiveEffectInput): ActiveEffect {
  const effect: ActiveEffect = {
    ...input,
    identity: input.identity ?? {
      sourceId: input.sourceSkillId,
      sourceSkillId: input.sourceSkillId,
      effectId: input.id,
    },
    stackCount: input.stackCount ?? 1,
    applicationCount: input.applicationCount ?? 0,
    ...(input.remainingRounds === undefined && input.durationRounds !== undefined
      ? { remainingRounds: input.durationRounds }
      : {}),
  };
  validateActiveEffect(effect);
  return effect;
}

export function validateActiveEffect(active: ActiveEffect): void {
  if (!active.id || !active.sourceSkillId) {
    throw new InvalidBattleStateError("效果实例 ID 和来源技能 ID 不能为空。");
  }
  if (
    !active.identity.sourceId ||
    !active.identity.sourceSkillId ||
    !active.identity.effectId
  ) {
    throw new InvalidBattleStateError("效果身份的 sourceId、sourceSkillId 和 effectId 不能为空。");
  }
  if (active.identity.sourceSkillId !== active.sourceSkillId) {
    throw new InvalidBattleStateError("效果身份中的 sourceSkillId 必须与效果来源一致。");
  }
  assertInteger(active.stackCount, "stackCount", 1);
  assertInteger(active.applicationCount, "applicationCount", 0);
  for (const key of ["durationRounds", "maxStacks", "maxApplications"] as const) {
    if (active[key] !== undefined) assertInteger(active[key], key, 1);
  }
  if (active.remainingRounds !== undefined) {
    assertInteger(active.remainingRounds, "remainingRounds", 0);
    const maximumRemainingRounds =
      active.durationRounds === undefined
        ? undefined
        : active.durationRounds + (active.activationTiming === "nextRound" ? 1 : 0);
    if (
      maximumRemainingRounds !== undefined &&
      active.remainingRounds > maximumRemainingRounds
    ) {
      throw new InvalidBattleStateError(
        "remainingRounds 不能超过当前回合覆盖量与配置 durationRounds 之和。",
      );
    }
  }
  if (active.maxStacks !== undefined && active.stackCount > active.maxStacks) {
    throw new InvalidBattleStateError("stackCount 不能超过 maxStacks。");
  }
  if (active.maxApplications !== undefined && active.applicationCount > active.maxApplications) {
    throw new InvalidBattleStateError("applicationCount 不能超过 maxApplications。");
  }
  if (active.decayRate !== undefined &&
      (!Number.isFinite(active.decayRate) || active.decayRate < 0 || active.decayRate > 1)) {
    throw new InvalidBattleStateError("decayRate 必须是 0～1 的有限数。");
  }
  if (
    active.valuePerStack !== undefined &&
    !Number.isFinite(active.valuePerStack)
  ) {
    throw new InvalidBattleStateError("valuePerStack 必须是有限数。");
  }
  if (active.refreshMode !== undefined &&
      !["refresh", "replace", "stack"].includes(active.refreshMode)) {
    throw new InvalidBattleStateError("未知 refreshMode。");
  }
  if (
    active.atMaxStacks !== undefined &&
    active.atMaxStacks !== "keep" &&
    active.atMaxStacks !== "refreshDuration"
  ) {
    throw new InvalidBattleStateError("未知 atMaxStacks 行为。");
  }
  if (
    active.activationTiming !== undefined &&
    active.activationTiming !== "immediate" &&
    active.activationTiming !== "nextRound"
  ) {
    throw new InvalidBattleStateError("未知 activationTiming。");
  }
  for (const key of ["appliedRound", "lastAppliedRound", "activeFromRound"] as const) {
    if (active[key] !== undefined) assertInteger(active[key], key, 1);
  }
  if (
    active.appliedRound !== undefined &&
    active.lastAppliedRound !== undefined &&
    active.lastAppliedRound < active.appliedRound
  ) {
    throw new InvalidBattleStateError("lastAppliedRound 不能早于 appliedRound。");
  }
  if (active.activationTiming !== undefined) {
    if (active.appliedRound === undefined || active.activeFromRound === undefined) {
      throw new InvalidBattleStateError(
        "声明 activationTiming 时必须同时提供 appliedRound 和 activeFromRound。",
      );
    }
    const expectedActiveRound =
      active.activationTiming === "immediate"
        ? active.appliedRound
        : active.appliedRound + 1;
    if (active.activeFromRound !== expectedActiveRound) {
      throw new InvalidBattleStateError(
        "activeFromRound 与 activationTiming/appliedRound 不一致。",
      );
    }
  }
}

export function activeEffectIdentityKey(
  identity: ActiveEffectIdentity,
): string {
  if (!identity.sourceId || !identity.sourceSkillId || !identity.effectId) {
    throw new InvalidBattleStateError("效果身份字段不能为空。");
  }
  return JSON.stringify([
    identity.sourceId,
    identity.sourceSkillId,
    identity.effectId,
  ]);
}

/** 显式消耗一次持续时间单位；调用时点由未来已确认的时序策略指定。 */
export function decrementEffectDurations(
  effects: readonly ActiveEffect[],
): readonly ActiveEffect[] {
  return effects.flatMap((active) => {
    validateActiveEffect(active);
    if (active.remainingRounds === undefined) return [active];
    if (active.remainingRounds <= 1) return [];
    return [{ ...active, remainingRounds: active.remainingRounds - 1 }];
  });
}

/** 超出上限明确报错，不擅自决定覆盖、刷新或丢弃。 */
export function setEffectStackCount(active: ActiveEffect, stackCount: number): ActiveEffect {
  validateActiveEffect(active);
  const next = { ...active, stackCount };
  validateActiveEffect(next);
  return next;
}

/** 仅记录一次应用；不自动触发、衰减伤害、消耗持续时间或移除状态。 */
export function recordEffectApplication(active: ActiveEffect): ActiveEffect {
  validateActiveEffect(active);
  const next = { ...active, applicationCount: active.applicationCount + 1 };
  validateActiveEffect(next);
  return next;
}

function assertInteger(value: number, label: string, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new InvalidBattleStateError(`${label} 必须是大于等于 ${minimum} 的安全整数。`);
  }
}
