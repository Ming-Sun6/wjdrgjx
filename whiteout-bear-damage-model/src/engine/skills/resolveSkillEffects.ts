import type {
  ResolvedSkillEffect,
  Skill,
  SkillEffectTarget,
} from "../../domain/skill";
import type { TroopType } from "../../domain/troop";
import {
  InvalidSkillEffectError,
  UnknownEffectTypeError,
  UnsupportedSkillTriggerError,
  UnsupportedSkillLifecycleError,
  UnsupportedSkillDataStatusError,
  UnsupportedSkillEffectDataStatusError,
} from "./errors";
import { IMPLICIT_TROOP_BY_EFFECT, isEffectType } from "./effectTypes";
import { assertCompleteExtraDamageEffect } from "../damage/resolveDamageComponent";
import { extraAttackEffectValidationErrors } from "../attacks/extraAttackEffect";

const validTargets: ReadonlySet<string> = new Set([
  "all",
  "shield",
  "lancer",
  "marksman",
]);

/**
 * 当前只解析 always 技能。其余触发方式会明确报错，不跳过，也不按期望值折算。
 */
export function resolveSkillEffects(
  skills: readonly Skill[],
  targetTroop: TroopType,
): readonly ResolvedSkillEffect[] {
  const resolved: ResolvedSkillEffect[] = [];

  for (const skill of skills) {
    if (skill.status !== undefined && skill.status !== "supported") {
      throw new UnsupportedSkillDataStatusError(skill.id, skill.status);
    }
    if (skill.trigger.type !== "always") {
      throw new UnsupportedSkillTriggerError(skill.trigger.type);
    }
    if (skill.lifecycle !== undefined || skill.effects.some((effect) => effect.lifecycle !== undefined)) {
      throw new UnsupportedSkillLifecycleError(skill.id);
    }

    skill.effects.forEach((effect, effectIndex) => {
      if (effect.status !== undefined && effect.status !== "supported") {
        throw new UnsupportedSkillEffectDataStatusError(
          skill.id,
          effectIndex,
          effect.status,
        );
      }
      if ((effect.conditions?.length ?? 0) > 0) {
        throw new InvalidSkillEffectError(
          `技能 ${skill.id} 的效果 ${effectIndex} 带有条件，必须先由条件/触发链解析器判定。`,
        );
      }
      const runtimeEffectType = effect.type as string;

      if (!isEffectType(runtimeEffectType)) {
        throw new UnknownEffectTypeError(runtimeEffectType);
      }

      if (!Number.isFinite(effect.value)) {
        throw new InvalidSkillEffectError(
          `技能 ${skill.id} 的效果值必须是有限数字。`,
        );
      }
      const effectiveStatus = effect.status ?? skill.status;
      if (effect.type === "extraDamage" && effectiveStatus === "supported") {
        assertCompleteExtraDamageEffect(effect, `技能 ${skill.id} 的效果 ${effectIndex}`);
      }
      if (effect.type === "extraAttack" && effectiveStatus === "supported") {
        const errors = extraAttackEffectValidationErrors(effect);
        if (errors.length > 0) {
          throw new InvalidSkillEffectError(
            `技能 ${skill.id} 的效果 ${effectIndex}：${errors.join("；")}。`,
          );
        }
      }

      const hasConfiguredTarget = effect.targetTroop !== undefined;
      const configuredTarget = (effect.targetTroop ?? "all") as string;

      if (!validTargets.has(configuredTarget)) {
        throw new InvalidSkillEffectError(
          `技能 ${skill.id} 使用了未知目标兵种：${configuredTarget}。`,
        );
      }

      const implicitTarget = IMPLICIT_TROOP_BY_EFFECT[runtimeEffectType];

      if (
        implicitTarget !== undefined &&
        hasConfiguredTarget &&
        configuredTarget !== implicitTarget
      ) {
        throw new InvalidSkillEffectError(
          `效果 ${runtimeEffectType} 只能以 ${implicitTarget} 为目标。`,
        );
      }

      const effectiveTarget = (implicitTarget ?? configuredTarget) as SkillEffectTarget;

      if (effectiveTarget !== "all" && effectiveTarget !== targetTroop) {
        return;
      }

      resolved.push({
        ...effect,
        ...(effectiveStatus === undefined ? {} : { status: effectiveStatus }),
        type: runtimeEffectType,
        targetTroop: effectiveTarget,
        skillId: skill.id,
        skillName: skill.name,
        effectIndex,
      });
    });
  }

  return resolved;
}
