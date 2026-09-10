import type { BattleDamageResult, HeadFormation } from "./battleDamage";
import type { BodyHeroId } from "./hero";
import type {
  ExpectedOptimizationFields,
  OptimizationPerformanceStats,
  OptimizerScoringMode,
} from "./optimizerScoring";
import type { DamageChannel } from "./skill";
import type { FireCrystalSettings } from "./tenRoundExpectedDamage";
import type { TroopLevelId, TroopStats, TroopType } from "./troop";
import type { BattlePreparationConfig } from "./preparation";
import type { BattleReportHeroAdjustmentConfig } from "./reportHero";

/** 所有比例均使用百分数单位：5 表示 5%。 */
export interface TroopRatios {
  readonly shield: number;
  readonly lancer: number;
  readonly marksman: number;
}

export interface TroopCounts {
  readonly shield: number;
  readonly lancer: number;
  readonly marksman: number;
}

export interface TroopRatioSettings {
  readonly troopLevelId: TroopLevelId;
  readonly stats: TroopStats;
}

export type TroopRatioBounds = Readonly<Partial<Record<TroopType, number>>>;

export interface TroopRatioOptimizationInput {
  readonly totalTroopCount: number;
  readonly troopSettings: Readonly<Record<TroopType, TroopRatioSettings>>;
  /** 固定车身；当前战斗引擎会拒绝 pending/unsupported 英雄。 */
  readonly bodyHeroIds: readonly BodyHeroId[];
  readonly headFormation?: HeadFormation;
  readonly fireCrystal?: FireCrystalSettings;
  readonly enemyBaseDefense?: number;
  readonly damageChannel?: DamageChannel;
  readonly preparation?: BattlePreparationConfig;
  readonly battleReportHeroAdjustment?: BattleReportHeroAdjustmentConfig;
  /** 可选的当前比例，用于计算相对提升；不参与候选搜索。 */
  readonly baselineRatios?: TroopRatios;
}

export interface TroopRatioOptimizationOptions {
  /** 百分点步长，默认 0.01；支持 1、0.5、0.1 等可整除100的小数。 */
  readonly stepPercent?: number;
  readonly topK?: number;
  readonly minimumRatios?: TroopRatioBounds;
  readonly maximumRatios?: TroopRatioBounds;
  readonly scoringMode?: OptimizerScoringMode;
}

export interface TroopRatioOptimizationCandidateResult extends ExpectedOptimizationFields {
  readonly rank: number;
  readonly ratios: TroopRatios;
  readonly troopCounts: TroopCounts;
  readonly totalDamage: number;
  readonly singleRoundDamage: number;
  readonly score: number;
  readonly troopDamages: Readonly<Record<TroopType, number>>;
  readonly expectedTroopDamages: Readonly<Record<TroopType, number>> | null;
  readonly improvementOverBaseline?: number;
  readonly improvementAbsolute?: number;
  readonly improvementRatio?: number | null;
  /** 保留分支、乘区等完整解释信息，供测试和后续 UI 使用。 */
  readonly battleResult: BattleDamageResult;
}

export interface TroopRatioOptimizationResult {
  readonly stepPercent: number;
  readonly topK: number;
  readonly evaluatedRatioCount: number;
  readonly optimizationMethod: "separableExact" | "naiveGrid";
  /** 完整合法网格规模；separableExact不会逐一运行完整战斗模拟。 */
  readonly theoreticalRatioCount: number;
  readonly fastScoreCount: number;
  readonly uniqueTroopCountScoreCount: number;
  readonly detailedEvaluationCount: number;
  readonly coefficients: Readonly<Record<TroopType, number>> | null;
  readonly scoringMode: OptimizerScoringMode;
  readonly scoreMetric: "legacySingleRoundDamage" | "expectedTenRoundTotalDamage";
  readonly elapsedMs: number;
  readonly baselineDamage?: number;
  readonly baselineScore?: number;
  readonly baselineExpectedTenRoundDamage?: number | null;
  readonly stats: OptimizationPerformanceStats;
  readonly results: readonly TroopRatioOptimizationCandidateResult[];
}
