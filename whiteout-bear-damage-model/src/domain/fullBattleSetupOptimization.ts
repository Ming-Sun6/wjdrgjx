import type { BattleDamageResult, HeadFormation } from "./battleDamage";
import type { BodyHeroId, HeadHeroDefinition, HeadHeroId, SupportedHeroDefinition } from "./hero";
import type {
  ExpectedOptimizationFields,
  OptimizationPerformanceStats,
  OptimizerScoringMode,
} from "./optimizerScoring";
import type { DamageChannel } from "./skill";
import type { FireCrystalSettings } from "./tenRoundExpectedDamage";
import type { TroopType } from "./troop";
import type {
  TroopCounts,
  TroopRatioBounds,
  TroopRatios,
  TroopRatioSettings,
} from "./troopRatioOptimization";
import type { BattlePreparationConfig } from "./preparation";
import type { BattleReportHeroAdjustmentConfig } from "./reportHero";

export type OptimizationDimension<TFixed, TOptimize> =
  | ({ readonly mode: "fixed" } & TFixed)
  | ({ readonly mode: "optimize" } & TOptimize);

export type FullRatioDimension = OptimizationDimension<
  { readonly ratios: TroopRatios },
  {
    readonly stepPercent?: number;
    readonly minimumRatios?: TroopRatioBounds;
    readonly maximumRatios?: TroopRatioBounds;
    /** 测试、局部比较或UI限制使用；仍会完整评估所列候选。 */
    readonly allowedRatios?: readonly TroopRatios[];
  }
>;

export type FullBodyDimension = OptimizationDimension<
  { readonly heroIds: readonly BodyHeroId[] },
  {
    readonly bodyCount?: number;
    readonly candidateHeroIds?: readonly BodyHeroId[];
  }
>;

export type HeadSlotDimension =
  | { readonly mode: "fixed"; readonly fixedHeroId?: HeadHeroId }
  | {
      readonly mode: "optimize";
      readonly candidateHeroIds?: readonly HeadHeroId[];
      /** 未指定时默认允许空槽，以覆盖所有数学可行方案。 */
      readonly includeEmpty?: boolean;
    };

export interface HeadOptimizationDimension {
  readonly shield?: HeadSlotDimension;
  readonly lancer?: HeadSlotDimension;
  readonly marksman?: HeadSlotDimension;
}

export interface FireCrystalConfiguration {
  readonly id: string;
  readonly settings: FireCrystalSettings;
}

export type FireCrystalOptimizationDimension =
  | {
      readonly mode: "fixed";
      readonly configuration?: FireCrystalConfiguration;
    }
  | {
      readonly mode: "optimize";
      /** 明确允许的完整配置；不会猜测技能槽位或自行组合技能。 */
      readonly allowedConfigurations?: readonly FireCrystalConfiguration[];
      readonly includeEmpty?: boolean;
      readonly minLevel?: number;
      readonly maxLevel?: number;
      readonly allowedLevels?: readonly (string | number)[];
    };

export interface FullBattleSetupOptimizationInput {
  readonly totalTroopCount: number;
  readonly troopSettings: Readonly<Record<TroopType, TroopRatioSettings>>;
  readonly damageChannel?: DamageChannel;
  readonly enemyBaseDefense?: number;
  readonly preparation?: BattlePreparationConfig;
  readonly battleReportHeroAdjustment?: BattleReportHeroAdjustmentConfig;
}

export interface FullBattleSetupOptimizationOptions {
  readonly ratio?: FullRatioDimension;
  readonly body?: FullBodyDimension;
  readonly head?: HeadOptimizationDimension;
  readonly fireCrystal?: FireCrystalOptimizationDimension;
  readonly topK?: number;
  readonly scoringMode?: OptimizerScoringMode;
  /** 只支持exact；字段为以后显式approximate模式预留。 */
  readonly optimizationMode?: "exact";
  readonly performanceWarningThreshold?: number;
}

export interface FullBattleSetupCandidate extends ExpectedOptimizationFields {
  readonly rank: number;
  readonly ratios: TroopRatios;
  readonly troopCounts: TroopCounts;
  readonly bodyHeroes: readonly SupportedHeroDefinition[];
  readonly bodyHeroIds: readonly BodyHeroId[];
  readonly headFormation: HeadFormation;
  readonly headHeroes: readonly HeadHeroDefinition[];
  readonly fireCrystalConfiguration: FireCrystalConfiguration;
  readonly score: number;
  readonly totalDamage: number;
  readonly singleRoundDamage: number;
  readonly troopDamages: Readonly<Record<TroopType, number>>;
  readonly improvementAbsolute: number;
  readonly improvementRatio: number | null;
  readonly battleResult: BattleDamageResult;
}

export interface FullBattleSetupOptimizationResult {
  readonly optimizationMode: "exact";
  readonly scoringMode: OptimizerScoringMode;
  readonly scoreMetric: "legacySingleRoundDamage" | "expectedTenRoundTotalDamage";
  readonly topK: number;
  readonly ratioCandidateCount: number;
  readonly bodyCombinationCount: number;
  readonly headCombinationCount: number;
  readonly fireCrystalConfigurationCount: number;
  readonly cartesianCandidateCount: number;
  readonly evaluatedCandidateCount: number;
  readonly skippedIncompatibleHeadCombinationCount: number;
  readonly performanceWarning: string | null;
  readonly stats: OptimizationPerformanceStats;
  readonly results: readonly FullBattleSetupCandidate[];
}
