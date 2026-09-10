import type { BattleDamageInput } from "./battleDamage";
import type { DamageBreakdown } from "./damageComponent";
import type { HeroCatalog, HeadHeroCatalog } from "./hero";
import type {
  ExpectedActiveEffectState,
  ExpectedBattleDamageOptions,
  ExpectedBattleDamageResult,
  ExpectedRoundDamageResult,
  InstantProbabilityEventReport,
} from "./probability";
import type { SkillCalculationStatus } from "./skill";
import type { TroopType } from "./troop";
import type { TroopSkillDefinition, TroopSkillId } from "./troopSkill";
import type { BattlePreparationConfig, PreparedBattleModifiers } from "./preparation";
import type {
  BattleReportHeroAdjustmentConfig,
  ResolvedBattleReportAttributeAdjustment,
} from "./reportHero";

export interface FireCrystalSettings {
  readonly skillIds: readonly TroopSkillId[];
}

export interface TenRoundExpectedDamageInput extends BattleDamageInput {
  readonly fireCrystal?: FireCrystalSettings;
  readonly preparation?: BattlePreparationConfig;
  /** 仅战报模式提供；先还原实际车头静态A/P，再进入基础伤害。 */
  readonly battleReportHeroAdjustment?: BattleReportHeroAdjustmentConfig;
}

export interface AppliedRealSkill {
  readonly source: "body" | "head" | "fireCrystal" | "troopTierSkill" | "system";
  readonly ownerId: string;
  readonly recordId: string;
  readonly skillId: string;
  readonly skillName: string;
}

export interface SkippedRealSkill {
  readonly source: "head" | "fireCrystal";
  readonly ownerId: string;
  readonly recordId: string;
  readonly effectId: string | null;
  readonly skillName: string;
  readonly status: Exclude<SkillCalculationStatus, "supported">;
  readonly reason: string;
}

export interface TenRoundExpectedDamageBreakdown extends DamageBreakdown {
  readonly baseDamage: number;
  readonly skillDamage: number;
  readonly primaryAttackDamage: number;
  readonly extraAttackDamage: number;
}

export interface ExpectedStackChange {
  readonly activeEffectId: string;
  readonly sourceSkillId: string;
  readonly previousExpectedStackCount: number;
  readonly expectedStackCount: number;
  readonly delta: number;
}

/**
 * 期望值视角的逐回合技能解释。概率分支不会伪装成某条实际随机战报，
 * 因此触发事件保留其概率，状态进入/退出也用activeProbability表达。
 */
export interface TenRoundSkillRoundExplanation {
  readonly round: number;
  readonly selectedSupportedSkills: readonly AppliedRealSkill[];
  readonly activeEffects: readonly ExpectedActiveEffectState[];
  readonly newlyActiveEffects: readonly ExpectedActiveEffectState[];
  readonly expiredEffects: readonly ExpectedActiveEffectState[];
  readonly stackChanges: readonly ExpectedStackChange[];
  readonly instantProbabilityEvents: readonly InstantProbabilityEventReport[];
  readonly expectedAttackCount: number;
  readonly expectedExtraAttackDamage: number;
  readonly expectedExtraDamage: number;
  readonly skippedPendingEffects: readonly SkippedRealSkill[];
}

export interface TenRoundExpectedDamageResult
  extends ExpectedBattleDamageResult {
  readonly expectedDamageByRound: readonly ExpectedRoundDamageResult[];
  readonly expectedDamageByTroop: Readonly<Record<TroopType, number>>;
  readonly damageBreakdown: TenRoundExpectedDamageBreakdown;
  readonly appliedSkills: readonly AppliedRealSkill[];
  readonly skippedPendingSkills: readonly SkippedRealSkill[];
  readonly unsupportedSkills: readonly SkippedRealSkill[];
  readonly roundSkillExplanations: readonly TenRoundSkillRoundExplanation[];
  readonly preparation?: PreparedBattleModifiers;
  readonly battleReportHeroAdjustments?: Readonly<
    Record<TroopType, ResolvedBattleReportAttributeAdjustment>
  >;
}

export interface TenRoundExpectedDamageDependencies {
  readonly heroCatalog: HeroCatalog;
  readonly headHeroCatalog: HeadHeroCatalog;
  readonly getTroopSkillById: (
    skillId: TroopSkillId,
  ) => TroopSkillDefinition | undefined;
}

export type TenRoundExpectedDamageOptions = ExpectedBattleDamageOptions;
