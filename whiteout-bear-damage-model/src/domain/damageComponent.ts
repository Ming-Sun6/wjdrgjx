import type {
  DamageCategory,
  ExtraDamageBasis,
  MultiplicativeEffectType,
  ResolvedSkillEffect,
} from "./skill";

export type DamageComponentKind = "normal" | "extra";

/** 一段伤害在应用指定乘区前的完整输入。 */
export interface DamageComponentInput {
  readonly id: string;
  readonly kind: DamageComponentKind;
  readonly damageCategory: DamageCategory;
  readonly basis: ExtraDamageBasis;
  readonly basisDamage: number;
  readonly coefficient: number;
  readonly applicableMultiplierZones: readonly MultiplicativeEffectType[];
}

export interface ResolvedDamageComponent extends DamageComponentInput {
  readonly multiplierByZone: Readonly<
    Partial<Record<MultiplicativeEffectType, number>>
  >;
  readonly combinedMultiplier: number;
  readonly damage: number;
  /** extraDamage 组件保留原技能来源；主伤害组件没有该字段。 */
  readonly sourceEffect?: ResolvedSkillEffect;
}

export interface DamageBreakdown {
  readonly normalDamage: number;
  readonly extraDamage: number;
  readonly totalDamage: number;
}

