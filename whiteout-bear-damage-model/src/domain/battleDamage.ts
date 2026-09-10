import type {
  BaseTotalDamageInput,
  BaseTroopDamageResult,
} from "./baseDamage";
import type {
  BodyHeroId,
  HeadHeroId,
  HeroCalculationStatus,
  HeroId,
} from "./hero";
import type {
  DamageChannel,
  MultiplicativeEffectType,
  ResolvedSkillEffect,
} from "./skill";
import type {
  DamageBreakdown,
  ResolvedDamageComponent,
} from "./damageComponent";
import type { AttackDamageResult } from "./attack";
import type { TroopType } from "./troop";

export interface BattleDamageInput extends BaseTotalDamageInput {
  /** 手动传入 0～4 个车身英雄 ID。数组允许包含重复 ID。 */
  readonly bodyHeroIds: readonly BodyHeroId[];
  /** 每个兵种最多一个车头；未提供时与原有无车头计算完全一致。 */
  readonly headFormation?: HeadFormation;
  /** 当前阶段通常使用 base；该字段避免猜测普攻与技能伤害的归属。 */
  readonly damageChannel?: DamageChannel;
}

export interface HeadFormation {
  readonly shieldHeroId?: HeadHeroId;
  readonly lancerHeroId?: HeadHeroId;
  readonly marksmanHeroId?: HeadHeroId;
}

export interface SelectedBodyHero {
  readonly slotIndex: number;
  readonly heroId: BodyHeroId;
  readonly heroName: string;
}

export interface SelectedHeadHero {
  readonly slot: TroopType;
  readonly heroId: HeadHeroId;
  readonly heroName: string;
  readonly troopType: TroopType;
}

export interface AppliedSkillSummary {
  readonly source: "body" | "head" | "runtime";
  readonly heroId: HeroId | null;
  readonly heroName: string | null;
  readonly skillId: string;
  readonly skillName: string;
}

export interface SkippedSkillSummary {
  readonly source: "head";
  readonly heroId: HeadHeroId;
  readonly heroName: string;
  readonly skillRecordId: string;
  readonly skillId: string | null;
  readonly skillName: string;
  readonly status: Exclude<HeroCalculationStatus, "supported">;
  readonly reason: string;
}

export interface TroopMultiplierBreakdown {
  readonly byEffectType: Readonly<Record<MultiplicativeEffectType, number>>;
  readonly combined: number;
}

export interface BattleTroopDamageResult {
  readonly troopType: TroopType;
  readonly baseDamage: number;
  /** 主伤害与额外伤害的独立结算明细。 */
  readonly damageBreakdown: DamageBreakdown;
  readonly finalDamage: number;
  readonly multipliers: TroopMultiplierBreakdown;
  readonly sourceResults: readonly BaseTroopDamageResult[];
  readonly deferredExtraDamageEffects: readonly ResolvedSkillEffect[];
  readonly extraDamageComponents: readonly ResolvedDamageComponent[];
  readonly attacks: readonly AttackDamageResult[];
  readonly primaryAttackDamage: number;
  readonly extraAttackDamage: number;
  readonly deferredExtraAttackEffects?: readonly ResolvedSkillEffect[];
  /** 已实际应用的乘区效果；可选以兼容已有注入式单回合计算器。 */
  readonly appliedEffects?: readonly ResolvedSkillEffect[];
}

/** 当前战斗伤害引擎的单回合结果；整场十回合由 bear battle 层汇总。 */
export interface BattleDamageResult {
  readonly totalTroopCount: number;
  readonly selectedBodyHeroes: readonly SelectedBodyHero[];
  readonly selectedHeadHeroes?: readonly SelectedHeadHero[];
  readonly appliedSkills?: readonly AppliedSkillSummary[];
  readonly skippedSkills?: readonly SkippedSkillSummary[];
  readonly baseDamage: number;
  readonly damageBreakdown: DamageBreakdown;
  readonly attacks: readonly AttackDamageResult[];
  readonly primaryAttackDamage: number;
  readonly extraAttackDamage: number;
  readonly finalDamage: number;
  readonly troopDamages: Readonly<
    Partial<Record<TroopType, BattleTroopDamageResult>>
  >;
}
