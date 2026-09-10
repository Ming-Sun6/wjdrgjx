import type {
  BattleDamageInput,
  BattleDamageResult,
  AppliedSkillSummary,
  SelectedBodyHero,
  SelectedHeadHero,
  SkippedSkillSummary,
  TroopMultiplierBreakdown,
} from "./battleDamage";
import type { ResolvedSkillEffect } from "./skill";
import type { TroopType } from "./troop";
import type { ActiveEffect, BattleState, RoundPhase } from "./battleState";
import type { DamageBreakdown } from "./damageComponent";
import type { AttackDamageResult } from "./attack";

export interface BearBattleContext {
  readonly totalRounds: 10;
  readonly enemyTroopType: "shield";
  readonly enemyInfiniteHp: true;
  /** 巨熊固定的原始防御；尚未提供时为 null。 */
  readonly enemyBaseDefense: number | null;
}

export type EnemyEffectiveDefenseStatus =
  | "base-defense-not-provided"
  | "same-as-base-no-active-reduction"
  | "pending-effective-defense-formula";

export interface BearEnemyDefenseState {
  readonly enemyBaseDefense: number | null;
  /** 有减防时因底层Defense映射未知而为null，不参与正式伤害。 */
  readonly enemyEffectiveDefense: number | null;
  readonly enemyEffectiveDefenseByTroop: Readonly<
    Partial<Record<TroopType, number | null>>
  >;
  readonly status: EnemyEffectiveDefenseStatus;
  readonly affectedByDefenseReduction: boolean;
  readonly defenseReductionAppliedAsDamageMultiplier: true;
  readonly defenseReductionMultiplierByTroop: Readonly<
    Partial<Record<TroopType, number>>
  >;
}

export interface RoundActiveEffects {
  /** 保留原有解释字段，并补充当前回合实际生效的状态实例。 */
  readonly instances?: readonly ActiveEffect[];
  readonly selectedBodyHeroes: readonly SelectedBodyHero[];
  readonly selectedHeadHeroes?: readonly SelectedHeadHero[];
  readonly appliedSkills?: readonly AppliedSkillSummary[];
  readonly skippedSkills?: readonly SkippedSkillSummary[];
  readonly multipliersByTroop: Readonly<
    Partial<Record<TroopType, TroopMultiplierBreakdown>>
  >;
  readonly deferredExtraDamageEffectsByTroop: Readonly<
    Partial<Record<TroopType, readonly ResolvedSkillEffect[]>>
  >;
  readonly deferredExtraAttackEffectsByTroop?: Readonly<
    Partial<Record<TroopType, readonly ResolvedSkillEffect[]>>
  >;
}

export interface RoundDamageResult {
  readonly round: number;
  readonly shieldDamage: number;
  readonly lancerDamage: number;
  readonly marksmanDamage: number;
  readonly totalDamage: number;
  readonly damageBreakdown: DamageBreakdown;
  readonly troopDamageBreakdowns: Readonly<
    Partial<Record<TroopType, DamageBreakdown>>
  >;
  readonly attacks: readonly AttackDamageResult[];
  readonly primaryAttackDamage: number;
  readonly extraAttackDamage: number;
  readonly activeEffects: RoundActiveEffects;
  readonly enemyDefense: BearEnemyDefenseState;
  /** 当前单回合伤害引擎的完整解释结果。 */
  readonly singleRoundResult: BattleDamageResult;
  readonly stateBefore?: BattleState;
  readonly stateAfter?: BattleState;
  readonly phases?: readonly RoundPhase[];
}

export interface BattleTotalDamageResult {
  readonly context: BearBattleContext;
  readonly rounds: readonly RoundDamageResult[];
  readonly singleRoundDamage: number;
  /** 十个回合逐回合伤害之和。 */
  readonly totalDamage: number;
  readonly damageBreakdown: DamageBreakdown;
  readonly primaryAttackDamage: number;
  readonly extraAttackDamage: number;
  readonly finalState?: BattleState;
}

export interface BearBattleOptions {
  readonly enemyBaseDefense?: number;
}

export type BearBattleDamageInput = BattleDamageInput;
