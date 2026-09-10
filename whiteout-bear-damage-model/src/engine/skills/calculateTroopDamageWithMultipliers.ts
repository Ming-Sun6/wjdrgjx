import type {
  BaseTroopDamageInput,
  BaseTroopDamageResult,
} from "../../domain/baseDamage";
import type { DamageChannel, Skill } from "../../domain/skill";
import { calculateBaseTroopDamage } from "../../rulesets/bear/base-damage/calculateBaseTroopDamage";
import {
  aggregateMultipliers,
  type AggregatedMultipliers,
} from "./aggregateMultipliers";
import { resolveSkillEffects } from "./resolveSkillEffects";
import type {
  DamageBreakdown,
  ResolvedDamageComponent,
} from "../../domain/damageComponent";
import {
  createDamageBreakdown,
  resolveDamageComponent,
  resolveExtraDamageEffect,
} from "../damage/resolveDamageComponent";
import type { ResolvedSkillEffect } from "../../domain/skill";

export interface TroopDamageWithMultipliersInput {
  readonly baseDamageInput: BaseTroopDamageInput;
  readonly skills: readonly Skill[];
  readonly damageChannel: DamageChannel;
}

export interface TroopDamageWithMultipliersResult {
  readonly baseDamage: BaseTroopDamageResult;
  readonly multipliers: AggregatedMultipliers;
  readonly damageBreakdown: DamageBreakdown;
  readonly extraDamageComponents: readonly ResolvedDamageComponent[];
  readonly damage: number;
  readonly resolvedEffects: ReturnType<typeof resolveSkillEffects>;
}

/**
 * 更高层的组合入口。calculateBaseTroopDamage 保持独立，不接收或解析技能。
 */
export function calculateTroopDamageWithMultipliers(
  input: TroopDamageWithMultipliersInput,
): TroopDamageWithMultipliersResult {
  const baseDamage = calculateBaseTroopDamage(input.baseDamageInput);
  return applySkillsToBaseTroopDamage(
    baseDamage,
    input.skills,
    input.damageChannel,
  );
}

/**
 * 将技能乘区应用到已经算出的单兵种基础伤害。
 * 正式熊战斗简化入口复用这里，既不复制基础公式，也不创建 AttackEvent。
 */
export function applySkillsToBaseTroopDamage(
  baseDamage: BaseTroopDamageResult,
  skills: readonly Skill[],
  damageChannel: DamageChannel,
): TroopDamageWithMultipliersResult {
  const resolvedEffects = resolveSkillEffects(
    skills,
    baseDamage.troopType,
  );
  const multipliers = aggregateMultipliers(resolvedEffects, {
    troopType: baseDamage.troopType,
    damageChannel,
  });

  const normalDamage = baseDamage.damage * multipliers.combinedMultiplier;
  const extraDamageComponents = multipliers.deferredExtraDamageEffects
    .filter((effect) => effect.status === "supported")
    .map(
    (effect) =>
      resolveExtraDamageEffect(effect, {
        baseDamage: baseDamage.damage,
        normalDamage,
        multiplierByEffectType: multipliers.multiplierByEffectType,
      }),
    );
  const damageBreakdown = createDamageBreakdown(
    normalDamage,
    extraDamageComponents.reduce(
      (sum, component) => sum + component.damage,
      0,
    ),
  );

  return {
    baseDamage,
    multipliers,
    damageBreakdown,
    extraDamageComponents,
    damage: damageBreakdown.totalDamage,
    resolvedEffects,
  };
}

/**
 * 正式打熊伤害分支：
 *
 * B × common × (normalAttackMultiplier + extraDamageRate × skillDamageMultiplier)
 *
 * 旧效果名只在这里做通用语义迁移，不依据英雄 ID 或名称。基础公式仍由
 * calculateBaseTroopDamage/calculateBaseTotalDamage 唯一负责。
 */
export function applyBearSkillsToBaseTroopDamage(
  baseDamage: BaseTroopDamageResult,
  skills: readonly Skill[],
): TroopDamageWithMultipliersResult {
  const resolvedEffects = resolveSkillEffects(skills, baseDamage.troopType)
    .map(normalizeFormalBearEffect);
  const multipliers = aggregateMultipliers(resolvedEffects, {
    troopType: baseDamage.troopType,
    damageChannel: "base",
  });
  const commonDamage = baseDamage.damage * multipliers.combinedMultiplier;
  const normalAttackMultiplier =
    multipliers.multiplierByEffectType.normalAttackDamageIncrease;
  const skillDamageMultiplier =
    multipliers.multiplierByEffectType.skillDamageIncrease;
  const normalDamage = commonDamage * normalAttackMultiplier;
  const extraDamageComponents = multipliers.deferredExtraDamageEffects
    .filter((effect) => effect.status === "supported")
    .map((effect) => ({
      ...resolveDamageComponent(
        {
          id: `bear-extra:${effect.skillId}:${effect.effectIndex}`,
          kind: "extra" as const,
          damageCategory: "skill" as const,
          basis: "postMultiplierDamage" as const,
          basisDamage: commonDamage,
          coefficient: effect.value,
          applicableMultiplierZones: ["skillDamageIncrease"] as const,
        },
        multipliers.multiplierByEffectType,
      ),
      sourceEffect: effect,
    }));
  const damageBreakdown = createDamageBreakdown(
    normalDamage,
    extraDamageComponents.reduce((sum, component) => sum + component.damage, 0),
  );

  return {
    baseDamage,
    multipliers,
    damageBreakdown,
    extraDamageComponents,
    damage: damageBreakdown.totalDamage,
    resolvedEffects,
  };
}

function normalizeFormalBearEffect(
  effect: ResolvedSkillEffect,
): ResolvedSkillEffect {
  switch (effect.type) {
    case "damageIncrease":
      return { ...effect, type: "baseDamageIncrease" };
    case "normalAttackDamage":
      return { ...effect, type: "normalAttackDamageIncrease" };
    case "skillDamage":
      return { ...effect, type: "skillDamageIncrease" };
    case "shieldDamage":
    case "lancerDamage":
    case "marksmanDamage":
      return { ...effect, type: "baseDamageIncrease" };
    default:
      return effect;
  }
}
