import type { ExpectedRoundDamageResult } from "./probability";
import type { SkippedRealSkill } from "./tenRoundExpectedDamage";

export const OPTIMIZER_SCORING_MODES = ["legacy", "tenRoundExpected"] as const;

export type OptimizerScoringMode = (typeof OPTIMIZER_SCORING_MODES)[number];

export interface OptimizationPerformanceStats {
  /** 进入排名流程的候选数，不包含基准。 */
  readonly candidateCount: number;
  readonly evaluatedCount: number;
  /** 命中与未命中包含基准评估，因为它们同样调用统一评分器。 */
  readonly cacheHits: number;
  readonly cacheMisses: number;
  /** 所有实际执行的精确期望评估中，合并后状态数的累计值。 */
  readonly probabilityStateCount: number;
  readonly elapsedMs: number;
}

export interface ExpectedOptimizationFields {
  /** legacy模式不运行精确期望引擎，因此为null。 */
  readonly expectedTenRoundDamage: number | null;
  readonly expectedDamageByRound: readonly ExpectedRoundDamageResult[];
  readonly skippedPendingSkills: readonly SkippedRealSkill[];
  readonly unsupportedSkills: readonly SkippedRealSkill[];
}
