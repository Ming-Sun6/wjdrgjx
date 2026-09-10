import type { TroopMultiplierBreakdown } from "../../domain/battleDamage";
import { calculateBattleDamage } from "../../app/calculateBattleDamage";
import type { BodySkillOption } from "../../domain/bodySkillOption";
import type {
  BodyOptimizationCandidateResult,
  BodyOptimizationInput,
  BodyOptimizationOptions,
  BodyOptimizationResult,
} from "../../domain/bodyOptimization";
import type { BodyHeroId, SupportedHeroDefinition } from "../../domain/hero";
import type { OptimizerScoringMode } from "../../domain/optimizerScoring";
import type { TenRoundExpectedDamageInput, TenRoundExpectedDamageResult } from "../../domain/tenRoundExpectedDamage";
import type { TroopType } from "../../domain/troop";
import { combinationsWithReplacementLimited } from "../combinationsWithReplacement";
import { getHeroById } from "../../game-data/heroes/bodyHeroQueries";
import {
  createOptimizerBattleEvaluator,
  type OptimizerBattleEvaluation,
  type OptimizerBattleEvaluatorDependencies,
} from "../evaluation/evaluateBattle";
import { InvalidBodyCountError, InvalidTopKError } from "./errors";
import { calculateBearBattleTotalDamageFromSingleRound } from "../../rulesets/bear/battle";
import { resolveBodySkillOptionCandidates } from "./resolveBodySkillOptionCandidates";
import { optimisticBodyUpperBound } from "./optimisticBodyBound";
import {
  compileBodyEffect,
  compileBodySkillOptions,
  scoreBodyFast,
  simulateCompiledBodyDetails,
  tryCreateStaticBodyBattleContext,
  type CompiledBodyDetailedScore,
  type CompiledBodyEffect,
} from "./compiledBodyEvaluator";
import { resolveBattleReportAdjustedInput } from "../../systems/reportHeroAdjustment";

const DEFAULT_BODY_COUNT = 4;
const DEFAULT_TOP_K = 10;
const DEFAULT_SCORING_MODE: OptimizerScoringMode = "tenRoundExpected";
const MAX_BODY_COUNT = 4;
export const OPTIMIZER_MAX_COPIES_PER_BODY_SKILL = 2;
const TROOP_TYPES: readonly TroopType[] = ["shield", "lancer", "marksman"];

export interface BodyHeroOptimizerDependencies
  extends OptimizerBattleEvaluatorDependencies {
  readonly now?: () => number;
}

/** 默认按完整10回合精确期望伤害穷举，组合生成规则保持不变。 */
export const optimizeBodyHeroes = createBodyHeroOptimizer();

export function createBodyHeroOptimizer(
  dependencies: BodyHeroOptimizerDependencies = {},
): (
  input: BodyOptimizationInput,
  options?: BodyOptimizationOptions,
) => BodyOptimizationResult {
  const now = dependencies.now ?? (() => performance.now());

  return (input, options = {}) => {
    const startedAt = now();
    const bodyCount = options.bodyCount ?? DEFAULT_BODY_COUNT;
    const topK = options.topK ?? DEFAULT_TOP_K;
    const scoringMode = options.scoringMode ?? DEFAULT_SCORING_MODE;
    validateOptions(bodyCount, topK);

    const candidateGenerationStartedAt = now();
    const candidateOptions = resolveBodySkillOptionCandidates(
      options.candidateHeroIds,
    );
    const compiledOptions = compileBodySkillOptions(candidateOptions);
    const combinations = combinationsWithReplacementLimited(
      compiledOptions,
      bodyCount,
      OPTIMIZER_MAX_COPIES_PER_BODY_SKILL,
    );
    const candidateGenerationMs = now() - candidateGenerationStartedAt;
    const bodyEffectCompilationStartedAt = now();
    const compiledEffects = combinations.map(compileBodyEffect);
    const bodyEffectCompilationMs = now() - bodyEffectCompilationStartedAt;
    const evaluator = createOptimizerBattleEvaluator(dependencies);
    const { enemyBaseDefense, ...baseInput } = input;
    const evaluate = (bodyHeroIds: readonly BodyHeroId[]) =>
      evaluator.evaluate(
        { ...baseInput, bodyHeroIds },
        {
          scoringMode,
          legacyMetricId: "legacySingleRoundDamage",
          legacyScore: (singleRound) => singleRound.finalDamage,
          ...(enemyBaseDefense === undefined ? {} : { enemyBaseDefense }),
        },
      );
    const staticContextStartedAt = now();
    const noBodyEvaluation = evaluate([]);
    const staticContext = scoringMode === "tenRoundExpected" &&
      dependencies.calculateSingleRoundDamage === undefined &&
      dependencies.calculateTenRoundExpectedDamage === undefined &&
      noBodyEvaluation.expectedResult !== undefined
      ? tryCreateStaticBodyBattleContext(
          resolveBattleReportAdjustedInput({ ...baseInput, bodyHeroIds: [] }).input,
          noBodyEvaluation.expectedResult,
        )
      : null;
    const staticContextBuildMs = now() - staticContextStartedAt;
    if (staticContext !== null) {
      const fastScoringStartedAt = now();
      const fastRanked = compiledEffects
        .map((bodyEffect) => ({ bodyEffect, score: scoreBodyFast(staticContext, bodyEffect) }))
        .sort((left, right) => right.score - left.score || left.bodyEffect.numericSignature - right.bodyEffect.numericSignature)
        .slice(0, topK);
      const fastScoringMs = now() - fastScoringStartedAt;
      const detailedMaterializationStartedAt = now();
      const evaluated = fastRanked.map(({ bodyEffect }) => {
        const details = simulateCompiledBodyDetails(staticContext, bodyEffect);
        const evaluation = createCompiledEvaluation(
          { ...baseInput, bodyHeroIds: bodyEffect.representativeHeroIds },
          details.totalDamage,
          enemyBaseDefense,
        );
        return createCandidateResult(
          resolveSupportedHeroes(bodyEffect.representativeHeroIds),
          bodyEffect.representativeHeroIds,
          bodyEffect.options,
          evaluation,
          noBodyEvaluation.score,
          details,
          noBodyEvaluation.expectedResult,
        );
      }).sort(compareCandidates);
      const results = evaluated.map((candidate, index) => ({ ...candidate, rank: index + 1 }));
      const detailedMaterializationMs = now() - detailedMaterializationStartedAt;
      const elapsedMs = now() - startedAt;
      const cache = evaluator.cache.statistics();
      return {
        bodyCount,
        topK,
        scoringMode,
        scoreMetric: "expectedTenRoundTotalDamage",
        candidateHeroCount: candidateOptions.length,
        bodySkillOptionCount: candidateOptions.length,
        effectSignatureCount: new Set(compiledEffects.map((effect) => effect.numericSignature)).size,
        combinationCount: combinations.length,
        evaluatedCombinationCount: compiledEffects.length,
        fastScoreCount: compiledEffects.length,
        detailedSimulationCount: fastRanked.length,
        formalSimulationCount: cache.cacheMisses,
        compiledFastPath: true,
        profiling: {
          candidateGenerationMs,
          bodyEffectCompilationMs,
          staticContextBuildMs,
          fastScoringMs,
          detailedMaterializationMs,
        },
        noBodyDamage: noBodyEvaluation.singleRoundResult.finalDamage,
        noBodyScore: noBodyEvaluation.score,
        noBodyExpectedTenRoundDamage: noBodyEvaluation.expectedTenRoundDamage,
        stats: {
          candidateCount: combinations.length,
          evaluatedCount: compiledEffects.length,
          cacheHits: cache.cacheHits,
          cacheMisses: cache.cacheMisses,
          probabilityStateCount: evaluator.probabilityStateCount(),
          elapsedMs,
        },
        results,
      };
    }

    const fastScoringStartedAt = now();
    const evaluationBySignature = new Map<string, OptimizerBattleEvaluation>();
    const baselineTroopDamage = getExpectedTroopDamage(noBodyEvaluation);
    const aggregatedEffects = compiledEffects
      .map(compiledToLegacyBodyEffect)
      .map((bodyEffect) => ({
        bodyEffect,
        upperBound: optimisticBodyUpperBound(bodyEffect.skills, baselineTroopDamage),
      }))
      .sort((left, right) => right.upperBound - left.upperBound || left.bodyEffect.signature.localeCompare(right.bodyEffect.signature));
    const effectSignatureCount = new Set(
      aggregatedEffects.map(({ bodyEffect }) => bodyEffect.signature),
    ).size;
    const evaluated: Array<Omit<BodyOptimizationCandidateResult, "rank"> & { readonly rank: 0 }> = [];
    for (const { bodyEffect, upperBound } of aggregatedEffects) {
      if (
        evaluated.length >= topK &&
        upperBound < evaluated[evaluated.length - 1]!.score - Math.max(1, Math.abs(upperBound)) * 1e-12
      ) break;
      const bodySkillOptions = bodyEffect.options;
      const heroIds = bodyEffect.representativeHeroIds;
      const heroes = heroIds.map((heroId) => {
        const hero = getHeroById(heroId);
        if (hero === undefined || hero.status !== "supported") {
          throw new Error(`车身代表英雄不可用：${heroId}。`);
        }
        return hero;
      });
      const signature = bodyEffect.signature;
      let evaluation = evaluationBySignature.get(signature);
      if (evaluation === undefined) {
        evaluation = evaluate(heroIds);
        evaluationBySignature.set(signature, evaluation);
      }
      const candidate = createCandidateResult(
        heroes,
        heroIds,
        bodySkillOptions,
        evaluation,
        noBodyEvaluation.score,
      );
      insertCandidate(evaluated, candidate, topK);
    }

    const results = evaluated.slice(0, topK).map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
    }));
    const fastScoringMs = now() - fastScoringStartedAt;
    const elapsedMs = now() - startedAt;
    const cache = evaluator.cache.statistics();

    return {
      bodyCount,
      topK,
      scoringMode,
      scoreMetric:
        scoringMode === "tenRoundExpected"
          ? "expectedTenRoundTotalDamage"
          : "legacySingleRoundDamage",
      candidateHeroCount: candidateOptions.length,
      bodySkillOptionCount: candidateOptions.length,
      effectSignatureCount,
      combinationCount: combinations.length,
      evaluatedCombinationCount: evaluationBySignature.size,
      fastScoreCount: evaluationBySignature.size,
      detailedSimulationCount: evaluationBySignature.size,
      formalSimulationCount: cache.cacheMisses,
      compiledFastPath: false,
      profiling: {
        candidateGenerationMs,
        bodyEffectCompilationMs,
        staticContextBuildMs,
        fastScoringMs,
        detailedMaterializationMs: 0,
      },
      noBodyDamage: noBodyEvaluation.singleRoundResult.finalDamage,
      noBodyScore: noBodyEvaluation.score,
      noBodyExpectedTenRoundDamage:
        noBodyEvaluation.expectedTenRoundDamage,
      stats: {
        candidateCount: combinations.length,
        evaluatedCount: evaluationBySignature.size,
        cacheHits: cache.cacheHits,
        cacheMisses: cache.cacheMisses,
        probabilityStateCount: evaluator.probabilityStateCount(),
        elapsedMs,
      },
      results,
    };
  };
}

function resolveSupportedHeroes(
  heroIds: readonly BodyHeroId[],
): readonly SupportedHeroDefinition[] {
  return heroIds.map((heroId) => {
    const hero = getHeroById(heroId);
    if (hero === undefined || hero.status !== "supported") {
      throw new Error(`车身代表英雄不可用：${heroId}。`);
    }
    return hero;
  });
}

function compiledToLegacyBodyEffect(bodyEffect: CompiledBodyEffect) {
  return {
    options: bodyEffect.options,
    optionCounts: Object.fromEntries(bodyEffect.options.map((option) => [
      option.id,
      bodyEffect.options.filter((candidate) => candidate.id === option.id).length,
    ])),
    skills: bodyEffect.options.flatMap((option) => option.skill === null ? [] : [option.skill]),
    representativeHeroIds: bodyEffect.representativeHeroIds,
    signature: String(bodyEffect.numericSignature),
  };
}

function insertCandidate(
  candidates: Array<Omit<BodyOptimizationCandidateResult, "rank"> & { readonly rank: 0 }>,
  candidate: Omit<BodyOptimizationCandidateResult, "rank"> & { readonly rank: 0 },
  topK: number,
): void {
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

function getExpectedTroopDamage(
  evaluation: OptimizerBattleEvaluation,
): Readonly<Record<TroopType, number>> {
  if (evaluation.expectedResult !== undefined) return evaluation.expectedResult.expectedDamageByTroop;
  return {
    shield: evaluation.deterministicTenRoundResult.rounds.reduce((sum, round) => sum + round.shieldDamage, 0),
    lancer: evaluation.deterministicTenRoundResult.rounds.reduce((sum, round) => sum + round.lancerDamage, 0),
    marksman: evaluation.deterministicTenRoundResult.rounds.reduce((sum, round) => sum + round.marksmanDamage, 0),
  };
}

function validateOptions(bodyCount: number, topK: number): void {
  if (
    !Number.isSafeInteger(bodyCount) ||
    bodyCount < 0 ||
    bodyCount > MAX_BODY_COUNT
  ) {
    throw new InvalidBodyCountError(bodyCount);
  }
  if (!Number.isSafeInteger(topK) || topK <= 0) {
    throw new InvalidTopKError(topK);
  }
}

function createCandidateResult(
  heroes: readonly SupportedHeroDefinition[],
  heroIds: readonly BodyHeroId[],
  bodySkillOptions: readonly BodySkillOption[],
  evaluation: OptimizerBattleEvaluation,
  baselineScore: number,
  compiledDetails?: CompiledBodyDetailedScore,
  fixedExpectedResult?: TenRoundExpectedDamageResult,
): Omit<BodyOptimizationCandidateResult, "rank"> & { readonly rank: 0 } {
  const troopDamages: Record<TroopType, number> = {
    shield: 0,
    lancer: 0,
    marksman: 0,
  };
  const expectedTroopDamages: Record<TroopType, number> | null = compiledDetails !== undefined
    ? { ...compiledDetails.troopDamages }
    : evaluation.expectedResult === undefined
      ? null
      : {
          shield: evaluation.expectedResult.expectedDamageByTroop.shield,
          lancer: evaluation.expectedResult.expectedDamageByTroop.lancer,
          marksman: evaluation.expectedResult.expectedDamageByTroop.marksman,
        };
  const multipliers: Partial<Record<TroopType, TroopMultiplierBreakdown>> = {};
  for (const troopType of TROOP_TYPES) {
    const troopResult = evaluation.singleRoundResult.troopDamages[troopType];
    if (troopResult !== undefined) {
      troopDamages[troopType] = troopResult.finalDamage;
      multipliers[troopType] = troopResult.multipliers;
    }
  }
  const score = compiledDetails?.totalDamage ?? evaluation.score;
  const improvementAbsolute = score - baselineScore;
  const improvementRatio =
    baselineScore === 0 ? null : score / baselineScore - 1;
  const reportSource = evaluation.expectedResult ?? fixedExpectedResult;

  return {
    rank: 0,
    heroes,
    selectedBodyHeroes: heroes,
    heroIds,
    bodySkillOptions,
    bodySkillOptionIds: bodySkillOptions.map((option) => option.id),
    totalDamage: evaluation.singleRoundResult.finalDamage,
    singleRoundDamage: evaluation.singleRoundResult.finalDamage,
    score,
    expectedTenRoundDamage: compiledDetails?.totalDamage ?? evaluation.expectedTenRoundDamage,
    expectedDamageByRound:
      compiledDetails?.expectedDamageByRound ?? evaluation.expectedResult?.expectedDamageByRound ?? [],
    expectedTroopDamages,
    troopDamages,
    multipliers,
    improvementOverNoBody: improvementRatio,
    improvementAbsolute,
    improvementRatio,
    battleResult: evaluation.singleRoundResult,
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

function compareCandidates(
  left: BodyOptimizationCandidateResult,
  right: BodyOptimizationCandidateResult,
): number {
  const scoreOrder = right.score - left.score;
  if (scoreOrder !== 0) return scoreOrder;
  return left.bodySkillOptionIds.join("|").localeCompare(right.bodySkillOptionIds.join("|"));
}
