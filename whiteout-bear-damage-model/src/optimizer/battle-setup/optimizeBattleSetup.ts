import { calculateBattleDamage } from "../../app/calculateBattleDamage";
import { calculateTenRoundExpectedDamage } from "../../app/calculateTenRoundExpectedDamage";
import type { BattleDamageInput, BattleDamageResult, TroopMultiplierBreakdown } from "../../domain/battleDamage";
import type {
  BattleSetupOptimizationCandidateResult,
  BattleSetupOptimizationInput,
  BattleSetupOptimizationOptions,
  BattleSetupOptimizationResult,
} from "../../domain/battleSetupOptimization";
import type { BodyHeroId, SupportedHeroDefinition } from "../../domain/hero";
import type { OptimizerScoringMode } from "../../domain/optimizerScoring";
import type { TenRoundExpectedDamageInput, TenRoundExpectedDamageResult } from "../../domain/tenRoundExpectedDamage";
import { resolveBattleReportAdjustedInput } from "../../systems/reportHeroAdjustment";
import type { TroopCounts, TroopRatios } from "../../domain/troopRatioOptimization";
import type { TroopType } from "../../domain/troop";
import {
  calculateBearBattleTotalDamageFromSingleRound,
  scoreCurrentBearBattleTotalDamage,
} from "../../rulesets/bear/battle/calculateBearBattleTotalDamage";
import { resolveSupportedBodyHeroCandidates } from "../body-heroes/resolveSupportedBodyHeroCandidates";
import { resolveBodySkillOptionCandidates } from "../body-heroes/resolveBodySkillOptionCandidates";
import { OPTIMIZER_MAX_COPIES_PER_BODY_SKILL } from "../body-heroes/optimizeBodyHeroes";
import { combinationsWithReplacement, combinationsWithReplacementLimited } from "../combinationsWithReplacement";
import {
  createOptimizerBattleEvaluator,
  type OptimizerBattleEvaluation,
} from "../evaluation/evaluateBattle";
import { allocateTroopsByRatio } from "../troop-ratio/allocateTroopsByRatio";
import { generateTroopRatioGrid } from "../troop-ratio/generateTroopRatioGrid";
import type { TroopRatioOptimizationCandidateResult } from "../../domain/troopRatioOptimization";
import { getHeroById } from "../../game-data/heroes/bodyHeroQueries";
import { aggregateBodyEffect } from "../../game-data/body-skills";
import {
  compileBodyEffect,
  compileBodySkillOptions,
  scoreBodyTroopsFast,
  simulateCompiledBodyDetails,
  tryCreateStaticBodyBattleContext,
  type CompiledBodyDetailedScore,
  type CompiledBodyEffect,
} from "../body-heroes/compiledBodyEvaluator";
import { optimisticBodyFactorForTroop } from "../body-heroes/optimisticBodyBound";
import {
  optimizeSeparableRatioGrid,
  solveExactRatioFromCoefficients,
} from "../troop-ratio/optimizeSeparableRatioGrid";
import { calculateMarchCapacity } from "../../systems/preparation";
import {
  BattleSetupCountOverflowError,
  BattleSetupEvaluationCountError,
  InvalidBattleSetupBodyCountError,
  InvalidBattleSetupTopKError,
} from "./errors";

const DEFAULT_RATIO_STEP_PERCENT = 0.01;
const DEFAULT_BODY_COUNT = 4;
const DEFAULT_TOP_K = 20;
const DEFAULT_SCORING_MODE: OptimizerScoringMode = "tenRoundExpected";
const MAX_BODY_COUNT = 4;
const TROOP_TYPES: readonly TroopType[] = ["shield", "lancer", "marksman"];

export interface BattleSetupScoreContext {
  readonly battleInput: BattleDamageInput;
  readonly singleRoundResult: BattleDamageResult;
}

export interface BattleSetupScorer {
  readonly id: string;
  readonly score: (context: BattleSetupScoreContext) => number;
}

export interface BattleSetupOptimizerDependencies {
  readonly calculateSingleRoundDamage: (input: BattleDamageInput) => BattleDamageResult;
  /** 省略时使用正式真实技能十回合入口。 */
  readonly calculateTenRoundExpectedDamage?: (
    input: TenRoundExpectedDamageInput,
    options?: { readonly enemyBaseDefense?: number },
  ) => TenRoundExpectedDamageResult;
  /** legacy模式的兼容评分器；tenRoundExpected模式不会使用它。 */
  readonly scorer: BattleSetupScorer;
  readonly now?: () => number;
}

export const currentBearBattleTotalDamageScorer: BattleSetupScorer = {
  id: "bearBattleTotalDamage",
  score({ singleRoundResult }): number {
    return scoreCurrentBearBattleTotalDamage(singleRoundResult);
  },
};

const officialBattleSetupDependencies: BattleSetupOptimizerDependencies = {
  calculateSingleRoundDamage: calculateBattleDamage,
  calculateTenRoundExpectedDamage,
  scorer: currentBearBattleTotalDamageScorer,
};

/**
 * 正式联合优化入口：每个 BodyEffect 直接求自己的0.01% exact最优比例，
 * 不构造“约5000万比例 × 车身组合”的笛卡尔积。
 */
export const optimizeBattleSetup = optimizeBattleSetupByBodyEffects;

function optimizeBattleSetupByBodyEffects(
  input: BattleSetupOptimizationInput,
  options: BattleSetupOptimizationOptions = {},
): BattleSetupOptimizationResult {
  const startedAt = performance.now();
  const ratioStepPercent = options.ratioStepPercent ?? DEFAULT_RATIO_STEP_PERCENT;
  const bodyCount = options.bodyCount ?? DEFAULT_BODY_COUNT;
  const topK = options.topK ?? DEFAULT_TOP_K;
  const scoringMode = options.scoringMode ?? DEFAULT_SCORING_MODE;
  validateOptions(bodyCount, topK);

  const candidateGenerationStartedAt = performance.now();
  const bodyOptions = resolveBodySkillOptionCandidates(options.candidateHeroIds);
  const compiledCombinations = combinationsWithReplacementLimited(
    compileBodySkillOptions(bodyOptions),
    bodyCount,
    OPTIMIZER_MAX_COPIES_PER_BODY_SKILL,
  );
  const candidateGenerationMs = performance.now() - candidateGenerationStartedAt;
  const bodyEffectCompilationStartedAt = performance.now();
  const compiledBodyCombinations = compiledCombinations.map(compileBodyEffect);
  const bodyCombinations = compiledBodyCombinations.map((effect) => effect.options);
  const bodyEffectCompilationMs = performance.now() - bodyEffectCompilationStartedAt;
  const best: BodyRatioCandidate[] = [];
  let ratioCandidateCount = 0;
  let fastScoreCount = 0;
  let ratioSolverCallCount = 0;
  let ratioSolverElapsedMs = 0;
  let bodyCoefficientMs = 0;
  const evaluator = createOptimizerBattleEvaluator({
    calculateSingleRoundDamage: officialBattleSetupDependencies.calculateSingleRoundDamage,
    calculateTenRoundExpectedDamage,
  });
  const allocationTotal = input.preparation === undefined
    ? input.totalTroopCount
    : calculateMarchCapacity(input.preparation).finalMarchCapacity;
  const referenceCounts = allocateTroopsByRatio(allocationTotal, {
    shield: 33.33,
    lancer: 33.33,
    marksman: 33.34,
  });
  const evaluateCounts = (troopCounts: TroopCounts, heroIds: readonly BodyHeroId[]) => {
    const troops = createTroops(input, troopCounts);
    return evaluator.evaluate(createBattleInput(input, troops, heroIds), {
      scoringMode,
      legacyMetricId: officialBattleSetupDependencies.scorer.id,
      legacyScore: (singleRound) => singleRound.finalDamage,
      ...(input.enemyBaseDefense === undefined ? {} : { enemyBaseDefense: input.enemyBaseDefense }),
    });
  };
  const staticContextStartedAt = performance.now();
  const noBodyReference = evaluateCounts(referenceCounts, []);
  const actualReferenceCounts = noBodyReference.expectedResult?.preparation?.troopCounts ?? referenceCounts;
  const noBodyCoefficients = coefficientsFromReference(actualReferenceCounts, noBodyReference);
  const staticContext = scoringMode === "tenRoundExpected" && noBodyReference.expectedResult !== undefined
    ? tryCreateStaticBodyBattleContext(
        resolveBattleReportAdjustedInput(
          createBattleInput(input, createTroops(input, referenceCounts), []),
        ).input,
        noBodyReference.expectedResult,
      )
    : null;
  const useCompiledFastPath = staticContext !== null;
  const staticContextBuildMs = performance.now() - staticContextStartedAt;

  if (staticContext !== null) {
    const bodyTopResults: Array<{
      readonly bodyEffect: CompiledBodyEffect;
      readonly coefficients: Readonly<Record<TroopType, number>>;
      readonly top: Pick<
        TroopRatioOptimizationCandidateResult,
        "rank" | "ratios" | "troopCounts" | "score"
      >;
    }> = [];
    for (const bodyEffect of compiledBodyCombinations) {
      const coefficientStartedAt = performance.now();
      const fastBodyScore = scoreBodyTroopsFast(staticContext, bodyEffect);
      const coefficients = coefficientsFromTroopScores(actualReferenceCounts, fastBodyScore.troopDamages);
      bodyCoefficientMs += performance.now() - coefficientStartedAt;
      const ratioStartedAt = performance.now();
      const ratioResult = solveExactRatioFromCoefficients({
        totalTroopCount: allocationTotal,
        coefficients,
        stepPercent: ratioStepPercent,
        topK: 1,
        ...(options.minimumRatios === undefined ? {} : { minimumRatios: options.minimumRatios }),
        ...(options.maximumRatios === undefined ? {} : { maximumRatios: options.maximumRatios }),
      });
      ratioSolverElapsedMs += performance.now() - ratioStartedAt;
      ratioSolverCallCount += 1;
      ratioCandidateCount = ratioResult.theoreticalRatioCount;
      fastScoreCount += ratioResult.fastScoreCount;
      const top = ratioResult.results[0];
      if (top !== undefined) bodyTopResults.push({
        bodyEffect,
        coefficients,
        top: { ...top, rank: 1 },
      });
    }
    bodyTopResults.sort((left, right) => (
      right.top.score - left.top.score ||
      left.bodyEffect.numericSignature - right.bodyEffect.numericSignature
    ));
    const cutoffIndex = Math.min(topK, bodyTopResults.length) - 1;
    const cutoffScore = cutoffIndex < 0
      ? Number.NEGATIVE_INFINITY
      : bodyTopResults[cutoffIndex]!.top.score;
    const contenderTolerance = Math.max(1, Math.abs(cutoffScore)) * 1e-12;
    const contenders = bodyTopResults.filter((entry) => entry.top.score >= cutoffScore - contenderTolerance);
    for (const entry of contenders) {
      const ratioStartedAt = performance.now();
      const ratioResult = topK === 1
        ? { results: [entry.top], fastScoreCount: 0 }
        : solveExactRatioFromCoefficients({
            totalTroopCount: allocationTotal,
            coefficients: entry.coefficients,
            stepPercent: ratioStepPercent,
            topK,
            ...(options.minimumRatios === undefined ? {} : { minimumRatios: options.minimumRatios }),
            ...(options.maximumRatios === undefined ? {} : { maximumRatios: options.maximumRatios }),
          });
      ratioSolverElapsedMs += performance.now() - ratioStartedAt;
      if (topK !== 1) ratioSolverCallCount += 1;
      fastScoreCount += ratioResult.fastScoreCount;
      for (const ratioCandidate of ratioResult.results) {
        insertBodyRatioCandidate(best, {
          combination: entry.bodyEffect.options,
          heroIds: entry.bodyEffect.representativeHeroIds,
          compiledEffect: entry.bodyEffect,
          ratioCandidate: {
            rank: 0,
            ratios: ratioCandidate.ratios,
            troopCounts: ratioCandidate.troopCounts,
            score: ratioCandidate.score,
          },
        }, topK);
      }
    }
  } else {
    const effects = bodyCombinations
      .map(aggregateBodyEffect)
      .map((bodyEffect) => ({
        bodyEffect,
        upperBound: continuousScoreUpperBound(
          allocationTotal,
          Object.fromEntries(TROOP_TYPES.map((troopType) => [
            troopType,
            noBodyCoefficients[troopType] * optimisticBodyFactorForTroop(bodyEffect.skills, troopType),
          ])) as Record<TroopType, number>,
        ),
      }))
      .sort((left, right) => right.upperBound - left.upperBound || left.bodyEffect.signature.localeCompare(right.bodyEffect.signature));
    const evaluationBySignature = new Map<string, ReturnType<typeof evaluateCounts>>();
    for (const { bodyEffect, upperBound } of effects) {
      if (
        best.length >= topK &&
        upperBound < best[best.length - 1]!.ratioCandidate.score - Math.max(1, Math.abs(upperBound)) * 1e-12
      ) break;
      const heroIds = bodyEffect.representativeHeroIds;
      const coefficientStartedAt = performance.now();
      let referenceEvaluation = evaluationBySignature.get(bodyEffect.signature);
      if (referenceEvaluation === undefined) {
        referenceEvaluation = evaluateCounts(referenceCounts, heroIds);
        evaluationBySignature.set(bodyEffect.signature, referenceEvaluation);
      }
      const coefficients = coefficientsFromReference(actualReferenceCounts, referenceEvaluation);
      bodyCoefficientMs += performance.now() - coefficientStartedAt;
      const ratioStartedAt = performance.now();
      const ratioResult = optimizeSeparableRatioGrid({
        totalTroopCount: allocationTotal,
        coefficients,
        stepPercent: ratioStepPercent,
        topK,
        ...(options.minimumRatios === undefined ? {} : { minimumRatios: options.minimumRatios }),
        ...(options.maximumRatios === undefined ? {} : { maximumRatios: options.maximumRatios }),
      });
      ratioSolverElapsedMs += performance.now() - ratioStartedAt;
      ratioSolverCallCount += 1;
      ratioCandidateCount = ratioResult.theoreticalRatioCount;
      fastScoreCount += ratioResult.fastScoreCount;
      for (const ratioCandidate of ratioResult.results) {
        insertBodyRatioCandidate(best, {
          combination: bodyEffect.options,
          heroIds,
          ratioCandidate: {
            rank: 0,
            ratios: ratioCandidate.ratios,
            troopCounts: ratioCandidate.troopCounts,
            score: ratioCandidate.score,
          },
        }, topK);
      }
    }
  }
  const detailedMaterializationStartedAt = performance.now();
  const detailed = best.map((candidate, index) => {
    const compiledDetails = staticContext !== null && candidate.compiledEffect !== undefined
      ? simulateCompiledBodyDetails(
          staticContext,
          candidate.compiledEffect,
          candidate.ratioCandidate.troopCounts,
        )
      : undefined;
    const candidateInput = createBattleInput(
      input,
      createTroops(input, candidate.ratioCandidate.troopCounts),
      candidate.heroIds,
    );
    const evaluation = compiledDetails === undefined
      ? evaluateCounts(candidate.ratioCandidate.troopCounts, candidate.heroIds)
      : createCompiledEvaluation(candidateInput, compiledDetails.totalDamage, input.enemyBaseDefense);
    const noBodyScore = useCompiledFastPath
      ? scoreCountsFromCoefficients(candidate.ratioCandidate.troopCounts, noBodyCoefficients)
      : evaluateCounts(candidate.ratioCandidate.troopCounts, []).score;
    const heroes = candidate.heroIds.map((heroId) => {
      const hero = getHeroById(heroId);
      if (hero === undefined || hero.status !== "supported") throw new Error(`车身代表英雄不可用：${heroId}。`);
      return hero;
    });
    return createResult({
      ratios: candidate.ratioCandidate.ratios,
      troopCounts: candidate.ratioCandidate.troopCounts,
      heroes,
      heroIds: candidate.heroIds,
      evaluation,
      noBodyScore,
    }, index + 1, compiledDetails, noBodyReference.expectedResult);
  });
  const detailedMaterializationMs = performance.now() - detailedMaterializationStartedAt;
  const elapsedMs = performance.now() - startedAt;
  const cache = evaluator.cache.statistics();
  const cartesianCandidateCount = ratioCandidateCount * bodyCombinations.length;
  const evaluatedSetupCount = Math.min(cartesianCandidateCount, fastScoreCount);
  return {
    ratioStepPercent,
    bodyCount,
    topK,
    scoringMode,
    scoreMetric: scoringMode === "tenRoundExpected" ? "expectedTenRoundTotalDamage" : officialBattleSetupDependencies.scorer.id,
    ratioCandidateCount,
    bodyCombinationCount: bodyCombinations.length,
    cartesianCandidateCount,
    evaluatedSetupCount,
    fastScoreCount,
    bodyEffectCount: compiledBodyCombinations.length,
    ratioSolverCallCount,
    ratioSolverElapsedMs,
    detailedSimulationCount: detailed.length,
    formalSimulationCount: cache.cacheMisses,
    compiledFastPath: useCompiledFastPath,
    profiling: {
      candidateGenerationMs,
      bodyEffectCompilationMs,
      staticContextBuildMs,
      bodyCoefficientMs,
      ratioSolverMs: ratioSolverElapsedMs,
      detailedMaterializationMs,
    },
    skippedCount: cartesianCandidateCount - evaluatedSetupCount,
    elapsedMs,
    stats: {
      candidateCount: cartesianCandidateCount,
      evaluatedCount: fastScoreCount,
      cacheHits: cache.cacheHits,
      cacheMisses: cache.cacheMisses,
      probabilityStateCount: evaluator.probabilityStateCount(),
      elapsedMs,
    },
    results: detailed,
  };
}

interface BodyRatioCandidate {
  readonly combination: readonly import("../../domain/bodySkillOption").BodySkillOption[];
  readonly heroIds: readonly BodyHeroId[];
  readonly compiledEffect?: CompiledBodyEffect;
  readonly ratioCandidate: Pick<TroopRatioOptimizationCandidateResult, "rank" | "ratios" | "troopCounts" | "score">;
}

function coefficientsFromReference(
  counts: TroopCounts,
  evaluation: OptimizerBattleEvaluation,
): Readonly<Record<TroopType, number>> {
  const expected = evaluation.expectedResult?.expectedDamageByTroop ?? {
    shield: evaluation.deterministicTenRoundResult.rounds.reduce((sum, round) => sum + round.shieldDamage, 0),
    lancer: evaluation.deterministicTenRoundResult.rounds.reduce((sum, round) => sum + round.lancerDamage, 0),
    marksman: evaluation.deterministicTenRoundResult.rounds.reduce((sum, round) => sum + round.marksmanDamage, 0),
  };
  return {
    shield: counts.shield === 0 ? 0 : expected.shield / Math.sqrt(counts.shield),
    lancer: counts.lancer === 0 ? 0 : expected.lancer / Math.sqrt(counts.lancer),
    marksman: counts.marksman === 0 ? 0 : expected.marksman / Math.sqrt(counts.marksman),
  };
}

function coefficientsFromTroopScores(
  counts: TroopCounts,
  troopDamages: Readonly<Record<TroopType, number>>,
): Readonly<Record<TroopType, number>> {
  return Object.fromEntries(TROOP_TYPES.map((troopType) => [
    troopType,
    counts[troopType] === 0 ? 0 : troopDamages[troopType] / Math.sqrt(counts[troopType]),
  ])) as Record<TroopType, number>;
}

function scoreCountsFromCoefficients(
  counts: TroopCounts,
  coefficients: Readonly<Record<TroopType, number>>,
): number {
  return TROOP_TYPES.reduce(
    (total, troopType) => total + coefficients[troopType] * Math.sqrt(counts[troopType]),
    0,
  );
}

function continuousScoreUpperBound(
  totalTroopCount: number,
  coefficients: Readonly<Record<TroopType, number>>,
): number {
  return Math.sqrt(
    totalTroopCount * TROOP_TYPES.reduce((sum, troopType) => sum + coefficients[troopType] ** 2, 0),
  );
}

function insertBodyRatioCandidate(
  candidates: BodyRatioCandidate[],
  candidate: BodyRatioCandidate,
  topK: number,
): void {
  let low = 0;
  let high = candidates.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (compareBodyRatioCandidates(candidate, candidates[middle]!) < 0) high = middle;
    else low = middle + 1;
  }
  candidates.splice(low, 0, candidate);
  if (candidates.length > topK) candidates.pop();
}

function compareBodyRatioCandidates(left: BodyRatioCandidate, right: BodyRatioCandidate): number {
  const scoreOrder = right.ratioCandidate.score - left.ratioCandidate.score;
  if (scoreOrder !== 0) return scoreOrder;
  const marksmanOrder = right.ratioCandidate.ratios.marksman - left.ratioCandidate.ratios.marksman;
  if (marksmanOrder !== 0) return marksmanOrder;
  const lancerOrder = right.ratioCandidate.ratios.lancer - left.ratioCandidate.ratios.lancer;
  if (lancerOrder !== 0) return lancerOrder;
  const shieldOrder = right.ratioCandidate.ratios.shield - left.ratioCandidate.ratios.shield;
  if (shieldOrder !== 0) return shieldOrder;
  return left.combination.map((option) => option.id).join("|").localeCompare(
    right.combination.map((option) => option.id).join("|"),
  );
}

export function createBattleSetupOptimizer(
  dependencies: BattleSetupOptimizerDependencies,
): (
  input: BattleSetupOptimizationInput,
  options?: BattleSetupOptimizationOptions,
) => BattleSetupOptimizationResult {
  const now = dependencies.now ?? (() => performance.now());

  return (input, options = {}) => {
    const startedAt = now();
    const ratioStepPercent = options.ratioStepPercent ?? DEFAULT_RATIO_STEP_PERCENT;
    const bodyCount = options.bodyCount ?? DEFAULT_BODY_COUNT;
    const topK = options.topK ?? DEFAULT_TOP_K;
    const scoringMode = options.scoringMode ?? DEFAULT_SCORING_MODE;
    validateOptions(bodyCount, topK);

    const ratios = generateTroopRatioGrid(ratioStepPercent, {
      ...(options.minimumRatios === undefined ? {} : { minimumRatios: options.minimumRatios }),
      ...(options.maximumRatios === undefined ? {} : { maximumRatios: options.maximumRatios }),
    });
    const candidateHeroes = resolveSupportedBodyHeroCandidates(options.candidateHeroIds);
    const heroCombinations = combinationsWithReplacement(candidateHeroes, bodyCount).map(
      (heroes) => ({
        heroes,
        heroIds: heroes.map((hero) => hero.id as BodyHeroId),
      }),
    );
    const cartesianCandidateCount = ratios.length * heroCombinations.length;
    if (!Number.isSafeInteger(cartesianCandidateCount)) {
      throw new BattleSetupCountOverflowError();
    }

    const evaluator = createOptimizerBattleEvaluator({
      calculateSingleRoundDamage: dependencies.calculateSingleRoundDamage,
      ...(dependencies.calculateTenRoundExpectedDamage === undefined
        ? {}
        : { calculateTenRoundExpectedDamage: dependencies.calculateTenRoundExpectedDamage }),
    });
    const evaluate = (battleInput: TenRoundExpectedDamageInput) =>
      evaluator.evaluate(battleInput, {
        scoringMode,
        legacyMetricId: dependencies.scorer.id,
        legacyScore: (singleRound) =>
          dependencies.scorer.score({ battleInput, singleRoundResult: singleRound }),
        ...(input.enemyBaseDefense === undefined
          ? {}
          : { enemyBaseDefense: input.enemyBaseDefense }),
      });
    const bestCandidates: EvaluatedSetup[] = [];
    let evaluatedSetupCount = 0;

    const allocationTotal = input.preparation === undefined
      ? input.totalTroopCount
      : calculateMarchCapacity(input.preparation).finalMarchCapacity;
    for (const ratio of ratios) {
      const troopCounts = allocateTroopsByRatio(allocationTotal, ratio);
      const troops = createTroops(input, troopCounts);
      const noBodyEvaluation = evaluate(createBattleInput(input, troops, []));

      for (const combination of heroCombinations) {
        const battleInput = createBattleInput(input, troops, combination.heroIds);
        const evaluation = evaluate(battleInput);
        evaluatedSetupCount += 1;
        insertCandidate(
          bestCandidates,
          {
            ratios: ratio,
            troopCounts,
            heroes: combination.heroes,
            heroIds: combination.heroIds,
            evaluation,
            noBodyScore: noBodyEvaluation.score,
          },
          topK,
        );
      }
    }

    if (evaluatedSetupCount !== cartesianCandidateCount) {
      throw new BattleSetupEvaluationCountError(
        cartesianCandidateCount,
        evaluatedSetupCount,
      );
    }
    const results = bestCandidates.map((candidate, index) =>
      createResult(candidate, index + 1),
    );
    const elapsedMs = now() - startedAt;
    const cache = evaluator.cache.statistics();

    return {
      ratioStepPercent,
      bodyCount,
      topK,
      scoringMode,
      scoreMetric:
        scoringMode === "tenRoundExpected"
          ? "expectedTenRoundTotalDamage"
          : dependencies.scorer.id,
      ratioCandidateCount: ratios.length,
      bodyCombinationCount: heroCombinations.length,
      cartesianCandidateCount,
      evaluatedSetupCount,
      fastScoreCount: evaluatedSetupCount,
      bodyEffectCount: heroCombinations.length,
      ratioSolverCallCount: 0,
      ratioSolverElapsedMs: 0,
      detailedSimulationCount: results.length,
      formalSimulationCount: cache.cacheMisses,
      compiledFastPath: false,
      profiling: {
        candidateGenerationMs: 0,
        bodyEffectCompilationMs: 0,
        staticContextBuildMs: 0,
        bodyCoefficientMs: 0,
        ratioSolverMs: 0,
        detailedMaterializationMs: 0,
      },
      skippedCount: 0,
      elapsedMs,
      stats: {
        candidateCount: cartesianCandidateCount,
        evaluatedCount: evaluatedSetupCount,
        cacheHits: cache.cacheHits,
        cacheMisses: cache.cacheMisses,
        probabilityStateCount: evaluator.probabilityStateCount(),
        elapsedMs,
      },
      results,
    };
  };
}

interface EvaluatedSetup {
  readonly ratios: TroopRatios;
  readonly troopCounts: TroopCounts;
  readonly heroes: readonly SupportedHeroDefinition[];
  readonly heroIds: readonly BodyHeroId[];
  readonly evaluation: OptimizerBattleEvaluation;
  readonly noBodyScore: number;
}

function createTroops(
  input: BattleSetupOptimizationInput,
  troopCounts: TroopCounts,
): BattleDamageInput["troops"] {
  return TROOP_TYPES.map((troopType) => ({
    troopType,
    troopCount: troopCounts[troopType],
    troopLevelId: input.troopSettings[troopType].troopLevelId,
    stats: input.troopSettings[troopType].stats,
  }));
}

function createBattleInput(
  input: BattleSetupOptimizationInput,
  troops: BattleDamageInput["troops"],
  bodyHeroIds: readonly BodyHeroId[],
): TenRoundExpectedDamageInput {
  return {
    troops,
    bodyHeroIds,
    ...(input.headFormation === undefined ? {} : { headFormation: input.headFormation }),
    ...(input.fireCrystal === undefined ? {} : { fireCrystal: input.fireCrystal }),
    ...(input.preparation === undefined ? {} : { preparation: input.preparation }),
    ...(input.battleReportHeroAdjustment === undefined
      ? {}
      : { battleReportHeroAdjustment: input.battleReportHeroAdjustment }),
    ...(input.damageChannel === undefined ? {} : { damageChannel: input.damageChannel }),
  };
}

function insertCandidate(
  candidates: EvaluatedSetup[],
  candidate: EvaluatedSetup,
  topK: number,
): void {
  if (
    candidates.length === topK &&
    compareCandidates(candidate, candidates[candidates.length - 1]!) >= 0
  ) {
    return;
  }
  let low = 0;
  let high = candidates.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (compareCandidates(candidate, candidates[middle]!) < 0) high = middle;
    else low = middle + 1;
  }
  candidates.splice(low, 0, candidate);
  if (candidates.length > topK) candidates.pop();
}

function compareCandidates(left: EvaluatedSetup, right: EvaluatedSetup): number {
  const scoreOrder = right.evaluation.score - left.evaluation.score;
  if (scoreOrder !== 0) return scoreOrder;
  const marksmanOrder = right.ratios.marksman - left.ratios.marksman;
  if (marksmanOrder !== 0) return marksmanOrder;
  const lancerOrder = right.ratios.lancer - left.ratios.lancer;
  if (lancerOrder !== 0) return lancerOrder;
  const shieldOrder = right.ratios.shield - left.ratios.shield;
  if (shieldOrder !== 0) return shieldOrder;
  return left.heroIds.join("|").localeCompare(right.heroIds.join("|"));
}

function createResult(
  candidate: EvaluatedSetup,
  rank: number,
  compiledDetails?: CompiledBodyDetailedScore,
  fixedExpectedResult?: TenRoundExpectedDamageResult,
): BattleSetupOptimizationCandidateResult {
  const { evaluation } = candidate;
  const singleRoundTroopDamages: Record<TroopType, number> = {
    shield: 0,
    lancer: 0,
    marksman: 0,
  };
  const troopDamages: Record<TroopType, number> = {
    shield: 0,
    lancer: 0,
    marksman: 0,
  };
  const multipliers: Partial<Record<TroopType, TroopMultiplierBreakdown>> = {};
  for (const troopType of TROOP_TYPES) {
    singleRoundTroopDamages[troopType] =
      evaluation.singleRoundResult.troopDamages[troopType]?.finalDamage ?? 0;
    troopDamages[troopType] = compiledDetails?.troopDamages[troopType] ??
      evaluation.expectedResult?.expectedDamageByTroop[troopType] ??
      evaluation.deterministicTenRoundResult.rounds.reduce(
        (sum, round) =>
          sum +
          (troopType === "shield"
            ? round.shieldDamage
            : troopType === "lancer"
              ? round.lancerDamage
              : round.marksmanDamage),
        0,
      );
    const multiplier =
      evaluation.singleRoundResult.troopDamages[troopType]?.multipliers;
    if (multiplier !== undefined) multipliers[troopType] = multiplier;
  }
  const score = compiledDetails?.totalDamage ?? evaluation.score;
  const improvementAbsolute = score - candidate.noBodyScore;
  const improvementRatio =
    candidate.noBodyScore === 0
      ? null
      : score / candidate.noBodyScore - 1;
  const reportSource = evaluation.expectedResult ?? fixedExpectedResult;

  return {
    rank,
    ratios: candidate.ratios,
    troopCounts: candidate.troopCounts,
    heroes: candidate.heroes,
    heroIds: candidate.heroIds,
    totalDamage: score,
    expectedTenRoundDamage: compiledDetails?.totalDamage ?? evaluation.expectedTenRoundDamage,
    expectedDamageByRound:
      compiledDetails?.expectedDamageByRound ?? evaluation.expectedResult?.expectedDamageByRound ?? [],
    singleRoundDamage: evaluation.singleRoundResult.finalDamage,
    troopDamages,
    singleRoundTroopDamages,
    multipliers,
    score,
    improvementAbsolute,
    improvementRatio,
    ...(improvementRatio === null
      ? {}
      : { improvementOverNoBody: improvementRatio }),
    singleRoundResult: evaluation.singleRoundResult,
    battleTotalResult: evaluation.deterministicTenRoundResult,
    skippedPendingSkills:
      reportSource?.skippedPendingSkills ?? [],
    unsupportedSkills: reportSource?.unsupportedSkills ?? [],
  };
}

function createCompiledEvaluation(
  input: TenRoundExpectedDamageInput,
  expectedTenRoundDamage: number,
  enemyBaseDefense: number | undefined,
): OptimizerBattleEvaluation {
  const resolvedInput = resolveBattleReportAdjustedInput(input).input;
  const { fireCrystal: _fireCrystal, preparation: _preparation, ...singleRoundInput } = resolvedInput;
  const singleRoundResult = calculateBattleDamage(singleRoundInput);
  const deterministicTenRoundResult = calculateBearBattleTotalDamageFromSingleRound(
    singleRoundResult,
    enemyBaseDefense === undefined ? {} : { enemyBaseDefense },
  );
  return {
    score: expectedTenRoundDamage,
    singleRoundResult,
    deterministicTenRoundResult,
    expectedTenRoundDamage,
  };
}

function validateOptions(bodyCount: number, topK: number): void {
  if (
    !Number.isSafeInteger(bodyCount) ||
    bodyCount < 0 ||
    bodyCount > MAX_BODY_COUNT
  ) {
    throw new InvalidBattleSetupBodyCountError(bodyCount);
  }
  if (!Number.isSafeInteger(topK) || topK <= 0) {
    throw new InvalidBattleSetupTopKError(topK);
  }
}
