import type {
  DamageBreakdown,
  DamageComponentInput,
  ResolvedDamageComponent,
} from "../../domain/damageComponent";
import {
  DAMAGE_CATEGORIES,
  EXTRA_DAMAGE_BASES,
  type MultiplicativeEffectType,
  type ResolvedSkillEffect,
  type SkillEffect,
} from "../../domain/skill";
import { multiplierResolverRegistry } from "../skills/resolvers/resolverRegistry";
import { InvalidDamageComponentError } from "./errors";

const multiplierZones = new Set<string>(
  Object.keys(multiplierResolverRegistry),
);

export interface ExtraDamageResolutionContext {
  readonly baseDamage: number;
  readonly normalDamage: number;
  readonly multiplierByEffectType: Readonly<
    Record<MultiplicativeEffectType, number>
  >;
}

/**
 * 解析一段伤害。只组合显式列出的乘区，不读取英雄、不计算基础伤害公式。
 */
export function resolveDamageComponent(
  input: DamageComponentInput,
  multiplierByEffectType: Readonly<Record<MultiplicativeEffectType, number>>,
): ResolvedDamageComponent {
  validateDamageComponentInput(input);
  const multiplierByZone: Partial<Record<MultiplicativeEffectType, number>> = {};
  let combinedMultiplier = 1;
  for (const zone of input.applicableMultiplierZones) {
    const multiplier = multiplierByEffectType[zone];
    if (!Number.isFinite(multiplier)) {
      throw new InvalidDamageComponentError(
        `伤害组件 ${input.id} 的乘区 ${zone} 缺少有限倍率。`,
      );
    }
    multiplierByZone[zone] = multiplier;
    combinedMultiplier *= multiplier;
  }
  const damage = input.basisDamage * input.coefficient * combinedMultiplier;
  if (!Number.isFinite(damage)) {
    throw new InvalidDamageComponentError(
      `伤害组件 ${input.id} 的结算结果必须是有限数。`,
    );
  }
  return { ...input, multiplierByZone, combinedMultiplier, damage };
}

/** 把一个已解析的 extraDamage 技能效果转换为独立伤害组件。 */
export function resolveExtraDamageEffect(
  effect: ResolvedSkillEffect,
  context: ExtraDamageResolutionContext,
): ResolvedDamageComponent {
  if (effect.status !== "supported") {
    throw new InvalidDamageComponentError(
      `技能 ${effect.skillId} 的extraDamage必须显式标记supported后才能结算。`,
    );
  }
  assertCompleteExtraDamageEffect(effect, `技能 ${effect.skillId}`);
  const basisDamage = selectBasisDamage(effect.basis!, context);
  return {
    ...resolveDamageComponent(
      {
        id: `extra:${effect.skillId}:${effect.effectIndex}`,
        kind: "extra",
        damageCategory: effect.damageCategory!,
        basis: effect.basis!,
        basisDamage,
        coefficient: effect.value,
        applicableMultiplierZones: effect.applicableMultiplierZones!,
      },
      context.multiplierByEffectType,
    ),
    sourceEffect: effect,
  };
}

export function createDamageBreakdown(
  normalDamage: number,
  extraDamage: number,
): DamageBreakdown {
  if (!Number.isFinite(normalDamage) || !Number.isFinite(extraDamage)) {
    throw new InvalidDamageComponentError(
      "DamageBreakdown 的 normalDamage 和 extraDamage 必须是有限数。",
    );
  }
  return {
    normalDamage,
    extraDamage,
    totalDamage: normalDamage + extraDamage,
  };
}

export function extraDamageEffectValidationErrors(
  effect: {
    readonly type: SkillEffect["type"] | null;
    readonly value: number | null;
    readonly basis?: SkillEffect["basis"] | null;
    readonly damageCategory?: SkillEffect["damageCategory"] | null;
    readonly applicableMultiplierZones?:
      | SkillEffect["applicableMultiplierZones"]
      | null;
  },
): readonly string[] {
  if (effect.type !== "extraDamage") return [];
  const errors: string[] = [];
  if (
    typeof effect.value !== "number" ||
    !Number.isFinite(effect.value) ||
    effect.value < 0
  ) {
    errors.push("extraDamage.value必须是非负有限数");
  }
  if (
    effect.basis === undefined ||
    effect.basis === null ||
    !EXTRA_DAMAGE_BASES.includes(effect.basis)
  ) {
    errors.push("extraDamage.basis必须显式声明");
  }
  if (
    effect.damageCategory === undefined ||
    effect.damageCategory === null ||
    !DAMAGE_CATEGORIES.includes(effect.damageCategory)
  ) {
    errors.push("extraDamage.damageCategory必须是normalAttack、skill或extra");
  }
  if (!Array.isArray(effect.applicableMultiplierZones)) {
    errors.push("extraDamage.applicableMultiplierZones必须显式声明");
  } else {
    const seen = new Set<string>();
    for (const zone of effect.applicableMultiplierZones) {
      if (!multiplierZones.has(zone)) {
        errors.push(`extraDamage包含未知乘区${zone as string}`);
      } else if (seen.has(zone)) {
        errors.push(`extraDamage重复声明乘区${zone}`);
      }
      seen.add(zone);
    }
  }
  return errors;
}

export function assertCompleteExtraDamageEffect(
  effect: Pick<
    SkillEffect,
    | "type"
    | "value"
    | "basis"
    | "damageCategory"
    | "applicableMultiplierZones"
  >,
  label = "extraDamage效果",
): void {
  const errors = extraDamageEffectValidationErrors(effect);
  if (errors.length > 0) {
    throw new InvalidDamageComponentError(`${label}：${errors.join("；")}。`);
  }
}

function selectBasisDamage(
  basis: NonNullable<SkillEffect["basis"]>,
  context: ExtraDamageResolutionContext,
): number {
  switch (basis) {
    case "postMultiplierDamage":
      return context.normalDamage;
    case "baseDamage":
    case "normalAttackDamage":
    case "preMultiplierDamage":
      return context.baseDamage;
  }
}

function validateDamageComponentInput(input: DamageComponentInput): void {
  if (!input.id) {
    throw new InvalidDamageComponentError("伤害组件ID不能为空。");
  }
  if (!Number.isFinite(input.basisDamage) || input.basisDamage < 0) {
    throw new InvalidDamageComponentError(
      `伤害组件 ${input.id} 的basisDamage必须是非负有限数。`,
    );
  }
  if (!Number.isFinite(input.coefficient) || input.coefficient < 0) {
    throw new InvalidDamageComponentError(
      `伤害组件 ${input.id} 的coefficient必须是非负有限数。`,
    );
  }
  const seen = new Set<MultiplicativeEffectType>();
  for (const zone of input.applicableMultiplierZones) {
    if (!multiplierZones.has(zone)) {
      throw new InvalidDamageComponentError(
        `伤害组件 ${input.id} 使用了未知乘区 ${zone as string}。`,
      );
    }
    if (seen.has(zone)) {
      throw new InvalidDamageComponentError(
        `伤害组件 ${input.id} 重复声明乘区 ${zone}。`,
      );
    }
    seen.add(zone);
  }
}
