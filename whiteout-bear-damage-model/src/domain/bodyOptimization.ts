import type { BattleDamageResult, TroopMultiplierBreakdown } from "./battleDamage";
import type { BodyHeroId, SupportedHeroDefinition } from "./hero";
import type {
  ExpectedOptimizationFields,
  OptimizationPerformanceStats,
  OptimizerScoringMode,
} from "./optimizerScoring";
import type { TenRoundExpectedDamageInput } from "./tenRoundExpectedDamage";
import type { TroopType } from "./troop";
import type { BodySkillOption, BodySkillOptionId } from "./bodySkillOption";

export type BodyOptimizationInput = Omit<
  TenRoundExpectedDamageInput,
  "bodyHeroIds"
> & {
  readonly enemyBaseDefense?: number;
};

export interface BodyOptimizationOptions {
  /** 精确选择的车身数量；默认 4，允许 0～4。 */
  readonly bodyCount?: number;
  /** 返回前 K 名；默认 10。 */
  readonly topK?: number;
  /** 可选的 supported 英雄候选子集。省略时使用全部 supported 英雄。 */
  readonly candidateHeroIds?: readonly BodyHeroId[];
  /** 默认tenRoundExpected；legacy保留原单回合排名用于回归。 */
  readonly scoringMode?: OptimizerScoringMode;
}

export interface BodyOptimizationCandidateResult extends ExpectedOptimizationFields {
  readonly rank: number;
  readonly heroes: readonly SupportedHeroDefinition[];
  readonly heroIds: readonly BodyHeroId[];
  readonly selectedBodyHeroes: readonly SupportedHeroDefinition[];
  readonly bodySkillOptions: readonly BodySkillOption[];
  readonly bodySkillOptionIds: readonly BodySkillOptionId[];
  /** 兼容旧API：仍表示单回合伤害；正式排名读取score。 */
  readonly totalDamage: number;
  readonly singleRoundDamage: number;
  readonly score: number;
  readonly troopDamages: Readonly<Record<TroopType, number>>;
  readonly expectedTroopDamages: Readonly<Record<TroopType, number>> | null;
  readonly multipliers: Readonly<
    Partial<Record<TroopType, TroopMultiplierBreakdown>>
  >;
  readonly improvementOverNoBody: number | null;
  readonly improvementAbsolute: number;
  readonly improvementRatio: number | null;
  /** 保留完整解释结果，供后续 UI 展开查看。 */
  readonly battleResult: BattleDamageResult;
}

export interface BodyOptimizationResult {
  readonly bodyCount: number;
  readonly topK: number;
  readonly candidateHeroCount: number;
  readonly bodySkillOptionCount: number;
  readonly effectSignatureCount: number;
  readonly combinationCount: number;
  readonly evaluatedCombinationCount: number;
  /** 纯数值编译路径实际评分的BodyEffect数；回退时等于正式评分数。 */
  readonly fastScoreCount: number;
  /** 不含无车身基准、最终为结果详情调用正式十回合引擎的次数。 */
  readonly detailedSimulationCount: number;
  /** 实际进入通用damage/概率评分器的cache miss次数（含无车身基准）。 */
  readonly formalSimulationCount: number;
  readonly compiledFastPath: boolean;
  readonly profiling: {
    readonly candidateGenerationMs: number;
    readonly bodyEffectCompilationMs: number;
    readonly staticContextBuildMs: number;
    readonly fastScoringMs: number;
    readonly detailedMaterializationMs: number;
  };
  readonly scoringMode: OptimizerScoringMode;
  readonly scoreMetric: "legacySingleRoundDamage" | "expectedTenRoundTotalDamage";
  readonly noBodyDamage: number;
  readonly noBodyScore: number;
  readonly noBodyExpectedTenRoundDamage: number | null;
  readonly stats: OptimizationPerformanceStats;
  readonly results: readonly BodyOptimizationCandidateResult[];
}
