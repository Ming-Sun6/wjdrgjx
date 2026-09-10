import type {
  DamageChannel,
  MultiplicativeEffectType,
  ResolvedSkillEffect,
} from "../../domain/skill";
import type { TroopType } from "../../domain/troop";
import { TROOP_DAMAGE_EFFECT_BY_TROOP } from "./effectTypes";
import {
  multiplierResolverRegistry,
} from "./resolvers/resolverRegistry";

export interface AggregateMultiplierContext {
  readonly troopType: TroopType;
  /**
   * base 不应用 normalAttackDamage 或 skillDamage；必须等伤害来源明确后再选对应通道。
   */
  readonly damageChannel: DamageChannel;
}

export interface AggregatedMultipliers {
  readonly sumByEffectType: Readonly<Record<MultiplicativeEffectType, number>>;
  readonly multiplierByEffectType: Readonly<
    Record<MultiplicativeEffectType, number>
  >;
  readonly appliedEffectTypes: readonly MultiplicativeEffectType[];
  readonly combinedMultiplier: number;
  /** extraDamage 不并入主伤害combinedMultiplier，交给独立伤害组件层。 */
  readonly deferredExtraDamageEffects: readonly ResolvedSkillEffect[];
  /** extraAttack 与 extraDamage 分别保留，均不套用普通增伤公式。 */
  readonly deferredExtraAttackEffects: readonly ResolvedSkillEffect[];
}

const multiplicativeEffectTypes = Object.keys(
  multiplierResolverRegistry,
) as MultiplicativeEffectType[];

const commonEffectTypes: readonly MultiplicativeEffectType[] = [
  "attack",
  "penetration",
  "defenseReduction",
  "baseDamageIncrease",
  "vulnerable",
  "troopVsTroopDamage",
  "buffAttack",
  "buffPenetration",
  "buffDefenseReduction",
  "expertBearDamage",
];

/** 先在同一乘区内求和，再由各乘区 resolver 生成倍率并跨乘区相乘。 */
export function aggregateMultipliers(
  effects: readonly ResolvedSkillEffect[],
  context: AggregateMultiplierContext,
): AggregatedMultipliers {
  const sums = createZeroRecord();
  const deferredExtraDamageEffects: ResolvedSkillEffect[] = [];
  const deferredExtraAttackEffects: ResolvedSkillEffect[] = [];

  for (const effect of effects) {
    if (effect.type === "extraDamage") {
      deferredExtraDamageEffects.push(effect);
      continue;
    }
    if (effect.type === "extraAttack") {
      deferredExtraAttackEffects.push(effect);
      continue;
    }

    const effectType = canonicalMultiplierEffectType(effect.type);
    if (effect.zoneAggregation === "replace") {
      sums[effectType] = effect.value;
      continue;
    }
    const hasReplacement = effects.some(
      (candidate) =>
        candidate.type !== "extraDamage" &&
        candidate.type !== "extraAttack" &&
        canonicalMultiplierEffectType(candidate.type) === effectType &&
        candidate.zoneAggregation === "replace",
    );
    if (!hasReplacement) sums[effectType] += effect.value;
  }

  const multipliers = createOneRecord();

  for (const effectType of multiplicativeEffectTypes) {
    multipliers[effectType] = multiplierResolverRegistry[effectType].resolve(
      sums[effectType],
    );
  }
  // 旧字段只作为读取兼容别名；正式计算只使用新的 canonical 字段一次。
  multipliers.damageIncrease = multipliers.baseDamageIncrease;
  multipliers.normalAttackDamage = multipliers.normalAttackDamageIncrease;
  multipliers.skillDamage = multipliers.skillDamageIncrease;

  const appliedEffectTypes: MultiplicativeEffectType[] = [
    ...commonEffectTypes,
    TROOP_DAMAGE_EFFECT_BY_TROOP[context.troopType],
  ];

  if (context.damageChannel === "normalAttack") {
    appliedEffectTypes.push("normalAttackDamageIncrease");
  } else if (context.damageChannel === "skill") {
    appliedEffectTypes.push("skillDamageIncrease");
  }

  const combinedMultiplier = appliedEffectTypes.reduce(
    (product, effectType) => product * multipliers[effectType],
    1,
  );

  // 报告层仍可识别旧字段，但不能把别名再次乘入 combinedMultiplier。
  appliedEffectTypes.push("damageIncrease");
  if (context.damageChannel === "normalAttack") {
    appliedEffectTypes.push("normalAttackDamage");
  } else if (context.damageChannel === "skill") {
    appliedEffectTypes.push("skillDamage");
  }

  return {
    sumByEffectType: sums,
    multiplierByEffectType: multipliers,
    appliedEffectTypes,
    combinedMultiplier,
    deferredExtraDamageEffects,
    deferredExtraAttackEffects,
  };
}

function canonicalMultiplierEffectType(
  type: MultiplicativeEffectType,
): MultiplicativeEffectType {
  if (type === "damageIncrease") return "baseDamageIncrease";
  if (type === "normalAttackDamage") return "normalAttackDamageIncrease";
  if (type === "skillDamage") return "skillDamageIncrease";
  return type;
}

function createZeroRecord(): Record<MultiplicativeEffectType, number> {
  return Object.fromEntries(
    multiplicativeEffectTypes.map((effectType) => [effectType, 0]),
  ) as Record<MultiplicativeEffectType, number>;
}

function createOneRecord(): Record<MultiplicativeEffectType, number> {
  return Object.fromEntries(
    multiplicativeEffectTypes.map((effectType) => [effectType, 1]),
  ) as Record<MultiplicativeEffectType, number>;
}
