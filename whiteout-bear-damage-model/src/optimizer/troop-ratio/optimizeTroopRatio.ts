import { calculateBattleDamage } from "../../app/calculateBattleDamage";
import { calculateTenRoundExpectedDamage } from "../../app/calculateTenRoundExpectedDamage";
import type { BattleDamageInput, BattleDamageResult } from "../../domain/battleDamage";
import type { OptimizerScoringMode } from "../../domain/optimizerScoring";
import type { TenRoundExpectedDamageInput, TenRoundExpectedDamageResult } from "../../domain/tenRoundExpectedDamage";
import type {
  TroopCounts,
  TroopRatioOptimizationCandidateResult,
  TroopRatioOptimizationInput,
  TroopRatioOptimizationOptions,
  TroopRatioOptimizationResult,
  TroopRatios,
} from "../../domain/troopRatioOptimization";
import type { TroopType } from "../../domain/troop";
import {
  createOptimizerBattleEvaluator,
  type OptimizerBattleEvaluation,
} from "../evaluation/evaluateBattle";
import { allocateTroopsByRatio } from "./allocateTroopsByRatio";
import { InvalidTotalTroopCountError, InvalidTroopRatioTopKError } from "./errors";
import { generateTroopRatioGrid } from "./generateTroopRatioGrid";
import { calculateMarchCapacity } from "../../systems/preparation";
import { optimizeSeparableRatioGrid } from "./optimizeSeparableRatioGrid";

const DEFAULT_STEP_PERCENT = 0.01;
const DEFAULT_TOP_K = 10;
const DEFAULT_SCORING_MODE: OptimizerScoringMode = "tenRoundExpected";
const TROOP_TYPES: readonly TroopType[] = ["shield", "lancer", "marksman"];

export interface TroopRatioOptimizerDependencies {
  readonly calculateBattleDamage: (input: BattleDamageInput) => BattleDamageResult;
  readonly calculateTenRoundExpectedDamage?: (
    input: TenRoundExpectedDamageInput,
    options?: { readonly enemyBaseDefense?: number },
  ) => TenRoundExpectedDamageResult;
  readonly now?: () => number;
}

const officialDependencies: TroopRatioOptimizerDependencies = {
  calculateBattleDamage,
  calculateTenRoundExpectedDamage,
};

/** 正式入口：利用已审计的 ΣKi√ni 可分离结构进行0.01%网格exact搜索。 */
export const optimizeTroopRatio = createSeparableTroopRatioOptimizer(officialDependencies);

function createSeparableTroopRatioOptimizer(
  dependencies: TroopRatioOptimizerDependencies,
): (input: TroopRatioOptimizationInput, options?: TroopRatioOptimizationOptions) => TroopRatioOptimizationResult {
  const now = dependencies.now ?? (() => performance.now());
  return (input, options = {}) => {
    const startedAt = now();
    const stepPercent = options.stepPercent ?? DEFAULT_STEP_PERCENT;
    const topK = options.topK ?? DEFAULT_TOP_K;
    const scoringMode = options.scoringMode ?? DEFAULT_SCORING_MODE;
    validateInput(input, topK);

    // legacy是兼容回归入口；正式十回合期望评分使用可分离exact算法。
    if (scoringMode === "legacy") {
      return createTroopRatioOptimizer(dependencies)(input, options);
    }

    const evaluator = createOptimizerBattleEvaluator({
      calculateSingleRoundDamage: dependencies.calculateBattleDamage,
      ...(dependencies.calculateTenRoundExpectedDamage === undefined
        ? {}
        : { calculateTenRoundExpectedDamage: dependencies.calculateTenRoundExpectedDamage }),
    });
    const evaluate = (troopCounts: TroopCounts) => evaluator.evaluate(
      createBattleInput(input, troopCounts),
      {
        scoringMode,
        legacyMetricId: "legacySingleRoundDamage",
        legacyScore: (singleRound) => singleRound.finalDamage,
        ...(input.enemyBaseDefense === undefined ? {} : { enemyBaseDefense: input.enemyBaseDefense }),
      },
    );
    const allocationTotal = input.preparation === undefined
      ? input.totalTroopCount
      : calculateMarchCapacity(input.preparation).finalMarchCapacity;
    const coefficients = deriveSeparableCoefficients(allocationTotal, evaluate);
    const fast = optimizeSeparableRatioGrid({
      totalTroopCount: allocationTotal,
      coefficients,
      stepPercent,
      topK,
      ...(options.minimumRatios === undefined ? {} : { minimumRatios: options.minimumRatios }),
      ...(options.maximumRatios === undefined ? {} : { maximumRatios: options.maximumRatios }),
    });
    const baselineEvaluation = calculateBaselineEvaluation(input, allocationTotal, evaluate);
    const results = fast.results.map((candidate, index) => ({
      ...createCandidateResult(
        candidate.ratios,
        candidate.troopCounts,
        evaluate(candidate.troopCounts),
        baselineEvaluation,
      ),
      rank: index + 1,
    }));
    const elapsedMs = now() - startedAt;
    const cache = evaluator.cache.statistics();
    return {
      stepPercent,
      topK,
      scoringMode,
      scoreMetric: "expectedTenRoundTotalDamage",
      optimizationMethod: "separableExact",
      theoreticalRatioCount: fast.theoreticalRatioCount,
      evaluatedRatioCount: fast.fastScoreCount,
      fastScoreCount: fast.fastScoreCount,
      uniqueTroopCountScoreCount: fast.uniqueTroopCountScoreCount,
      detailedEvaluationCount: cache.cacheMisses,
      coefficients,
      elapsedMs,
      ...(baselineEvaluation === undefined ? {} : {
        baselineDamage: baselineEvaluation.score,
        baselineScore: baselineEvaluation.score,
        baselineExpectedTenRoundDamage: baselineEvaluation.expectedTenRoundDamage,
      }),
      stats: {
        candidateCount: fast.theoreticalRatioCount,
        evaluatedCount: fast.fastScoreCount,
        cacheHits: cache.cacheHits,
        cacheMisses: cache.cacheMisses,
        probabilityStateCount: evaluator.probabilityStateCount(),
        elapsedMs,
      },
      results,
    };
  };
}

export function createTroopRatioOptimizer(
  dependencies: TroopRatioOptimizerDependencies,
): (
  input: TroopRatioOptimizationInput,
  options?: TroopRatioOptimizationOptions,
) => TroopRatioOptimizationResult {
  const now = dependencies.now ?? (() => performance.now());

  return (input, options = {}) => {
    const startedAt = now();
    const stepPercent = options.stepPercent ?? DEFAULT_STEP_PERCENT;
    const topK = options.topK ?? DEFAULT_TOP_K;
    const scoringMode = options.scoringMode ?? DEFAULT_SCORING_MODE;
    validateInput(input, topK);

    const ratioGrid = generateTroopRatioGrid(stepPercent, {
      ...(options.minimumRatios === undefined ? {} : { minimumRatios: options.minimumRatios }),
      ...(options.maximumRatios === undefined ? {} : { maximumRatios: options.maximumRatios }),
    });
    const evaluator = createOptimizerBattleEvaluator({
      calculateSingleRoundDamage: dependencies.calculateBattleDamage,
      ...(dependencies.calculateTenRoundExpectedDamage === undefined
        ? {}
        : { calculateTenRoundExpectedDamage: dependencies.calculateTenRoundExpectedDamage }),
    });
    const evaluate = (troopCounts: TroopCounts) =>
      evaluator.evaluate(createBattleInput(input, troopCounts), {
        scoringMode,
        legacyMetricId: "legacySingleRoundDamage",
        legacyScore: (singleRound) => singleRound.finalDamage,
        ...(input.enemyBaseDefense === undefined
          ? {}
          : { enemyBaseDefense: input.enemyBaseDefense }),
      });
    const allocationTotal=input.preparation===undefined?input.totalTroopCount:calculateMarchCapacity(input.preparation).finalMarchCapacity;
    const baselineEvaluation = calculateBaselineEvaluation(input, allocationTotal, evaluate);
    const evaluated = ratioGrid.map((ratios) => {
      const troopCounts = allocateTroopsByRatio(allocationTotal, ratios);
      return createCandidateResult(
        ratios,
        troopCounts,
        evaluate(troopCounts),
        baselineEvaluation,
      );
    });

    evaluated.sort(compareCandidates);
    const results = evaluated.slice(0, topK).map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
    }));
    const elapsedMs = now() - startedAt;
    const cache = evaluator.cache.statistics();

    return {
      stepPercent,
      topK,
      scoringMode,
      scoreMetric:
        scoringMode === "tenRoundExpected"
          ? "expectedTenRoundTotalDamage"
          : "legacySingleRoundDamage",
      evaluatedRatioCount: evaluated.length,
      optimizationMethod: "naiveGrid",
      theoreticalRatioCount: ratioGrid.length,
      fastScoreCount: evaluated.length,
      uniqueTroopCountScoreCount: evaluated.length,
      detailedEvaluationCount: evaluator.cache.statistics().cacheMisses,
      coefficients: null,
      elapsedMs,
      ...(baselineEvaluation === undefined
        ? {}
        : {
            baselineDamage: baselineEvaluation.score,
            baselineScore: baselineEvaluation.score,
            baselineExpectedTenRoundDamage:
              baselineEvaluation.expectedTenRoundDamage,
          }),
      stats: {
        candidateCount: ratioGrid.length,
        evaluatedCount: evaluated.length,
        cacheHits: cache.cacheHits,
        cacheMisses: cache.cacheMisses,
        probabilityStateCount: evaluator.probabilityStateCount(),
        elapsedMs,
      },
      results,
    };
  };
}

function deriveSeparableCoefficients(
  totalTroopCount: number,
  evaluate: (troopCounts: TroopCounts) => OptimizerBattleEvaluation,
): Readonly<Record<TroopType, number>> {
  if (totalTroopCount === 0) return { shield: 0, lancer: 0, marksman: 0 };
  if (totalTroopCount >= TROOP_TYPES.length) {
    const reference = allocateTroopsByRatio(totalTroopCount, {
      shield: 33.33,
      lancer: 33.33,
      marksman: 33.34,
    });
    const evaluation = evaluate(reference);
    const damages = expectedTroopDamages(evaluation);
    return {
      shield: damages.shield / Math.sqrt(reference.shield),
      lancer: damages.lancer / Math.sqrt(reference.lancer),
      marksman: damages.marksman / Math.sqrt(reference.marksman),
    };
  }
  const coefficients = {} as Record<TroopType, number>;
  for (const troopType of TROOP_TYPES) {
    const counts: TroopCounts = {
      shield: troopType === "shield" ? totalTroopCount : 0,
      lancer: troopType === "lancer" ? totalTroopCount : 0,
      marksman: troopType === "marksman" ? totalTroopCount : 0,
    };
    const evaluation = evaluate(counts);
    const troopDamage = expectedTroopDamages(evaluation)[troopType];
    coefficients[troopType] = troopDamage / Math.sqrt(totalTroopCount);
  }
  return coefficients;
}

function expectedTroopDamages(
  evaluation: OptimizerBattleEvaluation,
): Readonly<Record<TroopType, number>> {
  if (evaluation.expectedResult !== undefined) return evaluation.expectedResult.expectedDamageByTroop;
  return {
    shield: evaluation.deterministicTenRoundResult.rounds.reduce((sum, round) => sum + round.shieldDamage, 0),
    lancer: evaluation.deterministicTenRoundResult.rounds.reduce((sum, round) => sum + round.lancerDamage, 0),
    marksman: evaluation.deterministicTenRoundResult.rounds.reduce((sum, round) => sum + round.marksmanDamage, 0),
  };
}

function validateInput(input: TroopRatioOptimizationInput, topK: number): void {
  if (!Number.isSafeInteger(input.totalTroopCount) || input.totalTroopCount < 0) {
    throw new InvalidTotalTroopCountError(input.totalTroopCount);
  }
  if (!Number.isSafeInteger(topK) || topK <= 0) {
    throw new InvalidTroopRatioTopKError(topK);
  }
}

function calculateBaselineEvaluation(
  input: TroopRatioOptimizationInput,
  allocationTotal:number,
  evaluate: (troopCounts: TroopCounts) => OptimizerBattleEvaluation,
): OptimizerBattleEvaluation | undefined {
  return input.baselineRatios === undefined
    ? undefined
    : evaluate(allocateTroopsByRatio(allocationTotal, input.baselineRatios));
}

function createBattleInput(
  input: TroopRatioOptimizationInput,
  troopCounts: TroopCounts,
): TenRoundExpectedDamageInput {
  return {
    troops: TROOP_TYPES.map((troopType) => ({
      troopType,
      troopCount: troopCounts[troopType],
      troopLevelId: input.troopSettings[troopType].troopLevelId,
      stats: input.troopSettings[troopType].stats,
    })),
    bodyHeroIds: input.bodyHeroIds,
    ...(input.headFormation === undefined ? {} : { headFormation: input.headFormation }),
    ...(input.fireCrystal === undefined ? {} : { fireCrystal: input.fireCrystal }),
    ...(input.damageChannel === undefined ? {} : { damageChannel: input.damageChannel }),
    ...(input.preparation === undefined ? {} : { preparation: input.preparation }),
    ...(input.battleReportHeroAdjustment === undefined
      ? {}
      : { battleReportHeroAdjustment: input.battleReportHeroAdjustment }),
  };
}

function createCandidateResult(
  ratios: TroopRatios,
  troopCounts: TroopCounts,
  evaluation: OptimizerBattleEvaluation,
  baseline: OptimizerBattleEvaluation | undefined,
): Omit<TroopRatioOptimizationCandidateResult, "rank"> & { readonly rank: 0 } {
  const troopDamages: Record<TroopType, number> = {
    shield: 0,
    lancer: 0,
    marksman: 0,
  };
  for (const troopType of TROOP_TYPES) {
    troopDamages[troopType] =
      evaluation.expectedResult?.expectedDamageByTroop[troopType] ??
      evaluation.deterministicTenRoundResult.rounds.reduce(
        (sum, round) => sum + (
          troopType === "shield"
            ? round.shieldDamage
            : troopType === "lancer"
              ? round.lancerDamage
              : round.marksmanDamage
        ),
        0,
      );
  }
  const expectedTroopDamages =
    evaluation.expectedResult === undefined
      ? null
      : {
          shield: evaluation.expectedResult.expectedDamageByTroop.shield,
          lancer: evaluation.expectedResult.expectedDamageByTroop.lancer,
          marksman: evaluation.expectedResult.expectedDamageByTroop.marksman,
        };
  const improvementAbsolute =
    baseline === undefined ? undefined : evaluation.score - baseline.score;
  const improvementRatio =
    baseline === undefined
      ? undefined
      : baseline.score === 0
        ? null
        : evaluation.score / baseline.score - 1;

  return {
    rank: 0,
    ratios,
    troopCounts,
    totalDamage: evaluation.score,
    singleRoundDamage: evaluation.singleRoundResult.finalDamage,
    score: evaluation.score,
    troopDamages,
    expectedTroopDamages,
    expectedTenRoundDamage: evaluation.expectedTenRoundDamage,
    expectedDamageByRound:
      evaluation.expectedResult?.expectedDamageByRound ?? [],
    ...(improvementAbsolute === undefined ? {} : { improvementAbsolute }),
    ...(improvementRatio === undefined
      ? {}
      : {
          improvementRatio,
          ...(improvementRatio === null
            ? {}
            : { improvementOverBaseline: improvementRatio }),
        }),
    battleResult: evaluation.singleRoundResult,
    skippedPendingSkills:
      evaluation.expectedResult?.skippedPendingSkills ?? [],
    unsupportedSkills: evaluation.expectedResult?.unsupportedSkills ?? [],
  };
}

function compareCandidates(
  left: TroopRatioOptimizationCandidateResult,
  right: TroopRatioOptimizationCandidateResult,
): number {
  const scoreOrder = right.score - left.score;
  if (scoreOrder !== 0) return scoreOrder;
  const marksmanOrder = right.ratios.marksman - left.ratios.marksman;
  if (marksmanOrder !== 0) return marksmanOrder;
  const lancerOrder = right.ratios.lancer - left.ratios.lancer;
  if (lancerOrder !== 0) return lancerOrder;
  return right.ratios.shield - left.ratios.shield;
}
