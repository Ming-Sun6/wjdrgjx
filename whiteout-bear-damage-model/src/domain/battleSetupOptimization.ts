import type {
  BattleDamageResult,
  HeadFormation,
  TroopMultiplierBreakdown,
} from "./battleDamage";
import type { BattleTotalDamageResult } from "./bearBattle";
import type { BodyHeroId, SupportedHeroDefinition } from "./hero";
import type {
  ExpectedOptimizationFields,
  OptimizationPerformanceStats,
  OptimizerScoringMode,
} from "./optimizerScoring";
import type { DamageChannel } from "./skill";
import type { FireCrystalSettings } from "./tenRoundExpectedDamage";
import type { BattlePreparationConfig } from "./preparation";
import type { BattleReportHeroAdjustmentConfig } from "./reportHero";
import type { TroopType } from "./troop";
import type {
  TroopCounts,
  TroopRatioBounds,
  TroopRatios,
  TroopRatioSettings,
} from "./troopRatioOptimization";

export interface BattleSetupOptimizationInput {
  readonly totalTroopCount: number;
  readonly troopSettings: Readonly<Record<TroopType, TroopRatioSettings>>;
  readonly damageChannel?: DamageChannel;
  readonly enemyBaseDefense?: number;
  readonly headFormation?: HeadFormation;
  readonly fireCrystal?: FireCrystalSettings;
  /** 专家、城镇、宠物、专武及兵种技能等级均作为固定输入，不属于本优化维度。 */
  readonly preparation?: BattlePreparationConfig;
  readonly battleReportHeroAdjustment?: BattleReportHeroAdjustmentConfig;
}

export interface BattleSetupOptimizationOptions {
  readonly ratioStepPercent?: number;
  readonly bodyCount?: number;
  readonly topK?: number;
  readonly minimumRatios?: TroopRatioBounds;
  readonly maximumRatios?: TroopRatioBounds;
  /** 可选 supported 候选子集，主要用于测试和局部搜索；默认使用全部。 */
  readonly candidateHeroIds?: readonly BodyHeroId[];
  readonly scoringMode?: OptimizerScoringMode;
}

export interface BattleSetupOptimizationCandidateResult extends ExpectedOptimizationFields {
  readonly rank: number;
  readonly ratios: TroopRatios;
  readonly troopCounts: TroopCounts;
  readonly heroes: readonly SupportedHeroDefinition[];
  readonly heroIds: readonly BodyHeroId[];
  /** 当前确定性模型的十回合总伤害，也是默认排序分数。 */
  readonly totalDamage: number;
  readonly singleRoundDamage: number;
  /** 十回合累计的各兵种伤害。 */
  readonly troopDamages: Readonly<Record<TroopType, number>>;
  readonly singleRoundTroopDamages: Readonly<Record<TroopType, number>>;
  readonly multipliers: Readonly<
    Partial<Record<TroopType, TroopMultiplierBreakdown>>
  >;
  readonly score: number;
  readonly improvementOverNoBody?: number;
  readonly improvementAbsolute: number;
  readonly improvementRatio: number | null;
  readonly singleRoundResult: BattleDamageResult;
  readonly battleTotalResult: BattleTotalDamageResult;
}

export interface BattleSetupOptimizationResult {
  readonly ratioStepPercent: number;
  readonly bodyCount: number;
  readonly topK: number;
  readonly scoreMetric: string;
  readonly scoringMode: OptimizerScoringMode;
  readonly ratioCandidateCount: number;
  readonly bodyCombinationCount: number;
  readonly cartesianCandidateCount: number;
  readonly evaluatedSetupCount: number;
  /** 包含两阶段exact求解中用于证明/排名的纯数值评分次数。 */
  readonly fastScoreCount: number;
  readonly bodyEffectCount: number;
  readonly ratioSolverCallCount: number;
  readonly ratioSolverElapsedMs: number;
  readonly detailedSimulationCount: number;
  /** 实际进入通用damage/概率评分器的cache miss次数（含无车身基准）。 */
  readonly formalSimulationCount: number;
  readonly compiledFastPath: boolean;
  readonly profiling: {
    readonly candidateGenerationMs: number;
    readonly bodyEffectCompilationMs: number;
    readonly staticContextBuildMs: number;
    readonly bodyCoefficientMs: number;
    readonly ratioSolverMs: number;
    readonly detailedMaterializationMs: number;
  };
  readonly skippedCount: number;
  readonly elapsedMs: number;
  readonly stats: OptimizationPerformanceStats;
  readonly results: readonly BattleSetupOptimizationCandidateResult[];
}
