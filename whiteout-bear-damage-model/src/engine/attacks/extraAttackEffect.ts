import type { SkillEffect } from "../../domain/skill";

export const ABSOLUTE_MAX_ATTACK_DEPTH = 32;
export const ABSOLUTE_MAX_ATTACK_EVENTS = 1_000;

export function extraAttackEffectValidationErrors(
  effect: {
    readonly type: SkillEffect["type"] | null;
    readonly value: number | null;
    readonly count?: number | null;
    readonly damageScale?: number | null;
    readonly triggerPolicy?: SkillEffect["triggerPolicy"] | null;
    readonly maxAttackDepth?: number | null;
  },
): readonly string[] {
  if (effect.type !== "extraAttack") return [];
  const errors: string[] = [];
  if (!Number.isSafeInteger(effect.count) || (effect.count ?? 0) < 1) {
    errors.push("extraAttack.count必须是正安全整数");
  }
  if (
    typeof effect.damageScale !== "number" ||
    !Number.isFinite(effect.damageScale) ||
    effect.damageScale < 0
  ) {
    errors.push("extraAttack.damageScale必须是非负有限数");
  }
  if (
    !Number.isSafeInteger(effect.maxAttackDepth) ||
    (effect.maxAttackDepth ?? 0) < 1 ||
    (effect.maxAttackDepth ?? 0) > ABSOLUTE_MAX_ATTACK_DEPTH
  ) {
    errors.push(
      `extraAttack.maxAttackDepth必须是1～${ABSOLUTE_MAX_ATTACK_DEPTH}的安全整数`,
    );
  }
  const policy = effect.triggerPolicy;
  if (policy === undefined || policy === null) {
    errors.push("extraAttack.triggerPolicy必须显式声明");
  } else {
    for (const key of [
      "beforeAttack",
      "onAttack",
      "afterAttack",
      "canTriggerExtraAttack",
      "canTriggerExtraDamage",
    ] as const) {
      if (typeof policy[key] !== "boolean") {
        errors.push(`extraAttack.triggerPolicy.${key}必须是boolean`);
      }
    }
  }
  return errors;
}

