import type { AttackEvent } from "../../domain/attack";
import type { BaseTroopDamageResult } from "../../domain/baseDamage";
import type { BattleState } from "../../domain/battleState";
import type { DamageChannel, Skill } from "../../domain/skill";
import { createDamageBreakdown, resolveExtraDamageEffect } from "../damage/resolveDamageComponent";
import { aggregateMultipliers, type AggregatedMultipliers } from "../skills/aggregateMultipliers";
import { resolveSkillEffects } from "../skills/resolveSkillEffects";
import type { AttackDamageCalculation } from "./resolveAttackSequence";

export interface CalculateAttackEventDamageInput {
  readonly event: AttackEvent;
  readonly state: BattleState;
  readonly baseDamage: BaseTroopDamageResult;
  readonly skills: readonly Skill[];
  readonly damageChannel: DamageChannel;
}

export interface AttackEventDamageCalculation extends AttackDamageCalculation {
  readonly multipliers: AggregatedMultipliers;
  readonly resolvedEffects: ReturnType<typeof resolveSkillEffects>;
}

/**
 * 主攻击和extraAttack共用的单次攻击解析器。基础公式结果由调用方提供，
 * 每次事件都会重新解析当前skills、乘区和extraDamage组件。
 */
export function calculateAttackEventDamage(
  input: CalculateAttackEventDamageInput,
): AttackEventDamageCalculation {
  const resolvedEffects = resolveSkillEffects(
    input.skills,
    input.baseDamage.troopType,
  );
  const multipliers = aggregateMultipliers(resolvedEffects, {
    troopType: input.baseDamage.troopType,
    damageChannel: input.damageChannel,
  });
  const scaledBaseDamage = input.baseDamage.damage * input.event.damageScale;
  const normalDamage = scaledBaseDamage * multipliers.combinedMultiplier;
  const extraDamageComponents = input.event.triggerPolicy.canTriggerExtraDamage
    ? multipliers.deferredExtraDamageEffects
        .filter((effect) => effect.status === "supported")
        .map((effect) =>
          resolveExtraDamageEffect(effect, {
            baseDamage: scaledBaseDamage,
            normalDamage,
            multiplierByEffectType: multipliers.multiplierByEffectType,
          }),
        )
    : [];
  const damageBreakdown = createDamageBreakdown(
    normalDamage,
    extraDamageComponents.reduce(
      (sum, component) => sum + component.damage,
      0,
    ),
  );
  return {
    damageBreakdown,
    extraDamageComponents,
    extraAttackEffects: multipliers.deferredExtraAttackEffects,
    triggeredSkills: [
      ...new Set(
        [
          ...extraDamageComponents.map((component) => component.sourceEffect?.skillId),
          ...(input.event.triggerPolicy.canTriggerExtraAttack
            ? multipliers.deferredExtraAttackEffects.map((effect) => effect.skillId)
            : []),
        ].filter((id): id is string => id !== undefined),
      ),
    ],
    multipliers,
    resolvedEffects,
  };
}
