import type { BattleDamageInput } from "../../domain/battleDamage";
import type {
  FullBattleSetupCandidate,
  FullBattleSetupOptimizationInput,
  FullBattleSetupOptimizationOptions,
  FullBattleSetupOptimizationResult,
  FullBodyDimension,
  FullRatioDimension,
} from "../../domain/fullBattleSetupOptimization";
import type { BodyHeroDefinition, BodyHeroId, HeroId, SupportedHeroDefinition } from "../../domain/hero";
import type { OptimizerScoringMode } from "../../domain/optimizerScoring";
import type { TenRoundExpectedDamageInput } from "../../domain/tenRoundExpectedDamage";
import type { TroopCounts, TroopRatios } from "../../domain/troopRatioOptimization";
import type { TroopType } from "../../domain/troop";
import { getAllBodyHeroes, getHeroById } from "../../game-data/heroes/bodyHeroQueries";
import { getAllHeadHeroes, getHeadHeroById } from "../../game-data/heroes/headHeroQueries";
import { getFireCrystalSkills, getTroopSkillById } from "../../game-data/troop-skills/troopSkillQueries";
import { combinationsWithReplacement } from "../combinationsWithReplacement";
import {
  createOptimizerBattleEvaluator,
  type OptimizerBattleEvaluation,
  type OptimizerBattleEvaluatorDependencies,
} from "../evaluation/evaluateBattle";
import { allocateTroopsByRatio } from "../troop-ratio/allocateTroopsByRatio";
import { InvalidTotalTroopCountError } from "../troop-ratio/errors";
import { generateTroopRatioGrid } from "../troop-ratio/generateTroopRatioGrid";
import { calculateMarchCapacity } from "../../systems/preparation";
import { InvalidBodyCountError, UnavailableOptimizerHeroError, UnknownOptimizerHeroError } from "../body-heroes/errors";
import {
  FullSetupCandidateCountOverflowError,
  InvalidFullSetupTopKError,
  NoFullSetupCandidateError,
} from "./errors";
import {
  fireCrystalConfigurationKey,
  generateFireCrystalConfigurations,
  type FireCrystalDataSource,
} from "./generateFireCrystalConfigurations";
import {
  generateHeadFormationCandidates,
  headFormationKey,
  type HeadCandidateDataSource,
  type HeadFormationCandidate,
} from "./generateHeadFormationCandidates";

const DEFAULT_TOP_K = 20;
const DEFAULT_BODY_COUNT = 4;
const DEFAULT_RATIO_STEP = 1;
const DEFAULT_WARNING_THRESHOLD = 2_000_000;
const DEFAULT_SCORING_MODE: OptimizerScoringMode = "tenRoundExpected";
const TROOP_TYPES: readonly TroopType[] = ["shield", "lancer", "marksman"];

export interface FullSetupOptimizerDependencies
  extends OptimizerBattleEvaluatorDependencies,
    HeadCandidateDataSource,
    FireCrystalDataSource {
  readonly getBodyHeroById: (heroId: BodyHeroId) => BodyHeroDefinition | undefined;
  readonly getAllBodyHeroes: () => readonly BodyHeroDefinition[];
  readonly now?: () => number;
}

const DEFAULT_DEPENDENCIES: FullSetupOptimizerDependencies = {
  getBodyHeroById: (heroId) => {
    const hero = getHeroById(heroId as HeroId);
    return hero?.role === "body" ? hero : undefined;
  },
  getAllBodyHeroes,
  getAllHeadHeroes,
  getHeadHeroById,
  getAllTroopSkills: getFireCrystalSkills,
  getTroopSkillById,
};

/** 最高层exact优化入口：比例×车身×车头×火晶完整笛卡尔积。 */
export const optimizeFullBattleSetup =
  createFullBattleSetupOptimizer(DEFAULT_DEPENDENCIES);

export function createFullBattleSetupOptimizer(
  dependencies: FullSetupOptimizerDependencies,
): (
  input: FullBattleSetupOptimizationInput,
  options?: FullBattleSetupOptimizationOptions,
) => FullBattleSetupOptimizationResult {
  const now = dependencies.now ?? (() => performance.now());

  return (input, options = {}) => {
    const startedAt = now();
    const topK = options.topK ?? DEFAULT_TOP_K;
    const scoringMode = options.scoringMode ?? DEFAULT_SCORING_MODE;
    const warningThreshold =
      options.performanceWarningThreshold ?? DEFAULT_WARNING_THRESHOLD;
    validateInput(input, topK, warningThreshold);

    const ratios = generateRatioCandidates(options.ratio);
    const bodyCombinations = generateBodyCombinations(options.body, dependencies);
    const headGeneration = generateHeadFormationCandidates(options.head, dependencies);
    const fireConfigurations = generateFireCrystalConfigurations(
      options.fireCrystal,
      dependencies,
    );
    const cartesianCandidateCount = multiplyCandidateCounts([
      ratios.length,
      bodyCombinations.length,
      headGeneration.candidates.length,
      fireConfigurations.length,
    ]);
    const evaluator = createOptimizerBattleEvaluator(dependencies);
    const evaluate = (battleInput: TenRoundExpectedDamageInput) =>
      evaluator.evaluate(battleInput, {
        scoringMode,
        legacyMetricId: "legacySingleRoundDamage",
        legacyScore: (singleRound) => singleRound.finalDamage,
        ...(input.enemyBaseDefense === undefined
          ? {}
          : { enemyBaseDefense: input.enemyBaseDefense }),
      });
    const best: EvaluatedFullSetup[] = [];
    let evaluatedCandidateCount = 0;

    const allocationTotal=input.preparation===undefined?input.totalTroopCount:calculateMarchCapacity(input.preparation).finalMarchCapacity;
    for (const ratiosCandidate of ratios) {
      const troopCounts = allocateTroopsByRatio(
        allocationTotal,
        ratiosCandidate,
      );
      const troops = createTroops(input, troopCounts);
      const baseline = evaluate({
        troops,
        bodyHeroIds: [],
        headFormation: {},
        fireCrystal: { skillIds: [] },
        ...(input.damageChannel === undefined
          ? {}
          : { damageChannel: input.damageChannel }),
        ...(input.preparation === undefined ? {} : { preparation: input.preparation }),
        ...(input.battleReportHeroAdjustment === undefined
          ? {}
          : { battleReportHeroAdjustment: input.battleReportHeroAdjustment }),
      });

      for (const body of bodyCombinations) {
        for (const head of headGeneration.candidates) {
          for (const fireCrystalConfiguration of fireConfigurations) {
            const battleInput: TenRoundExpectedDamageInput = {
              troops,
              bodyHeroIds: body.heroIds,
              headFormation: head.formation,
              fireCrystal: fireCrystalConfiguration.settings,
              ...(input.damageChannel === undefined
                ? {}
                : { damageChannel: input.damageChannel }),
              ...(input.preparation === undefined ? {} : { preparation: input.preparation }),
              ...(input.battleReportHeroAdjustment === undefined
                ? {}
                : { battleReportHeroAdjustment: input.battleReportHeroAdjustment }),
            };
            const evaluation = evaluate(battleInput);
            evaluatedCandidateCount += 1;
            insertCandidate(
              best,
              {
                ratios: ratiosCandidate,
                troopCounts,
                body,
                head,
                fireCrystalConfiguration,
                evaluation,
                baselineScore: baseline.score,
              },
              topK,
            );
          }
        }
      }
    }

    if (evaluatedCandidateCount !== cartesianCandidateCount) {
      throw new Error(
        `完整优化评估数量不一致：${evaluatedCandidateCount} != ${cartesianCandidateCount}。`,
      );
    }
    const elapsedMs = now() - startedAt;
    const cache = evaluator.cache.statistics();
    const results = best.map((candidate, index) =>
      createCandidateResult(candidate, index + 1),
    );

    return {
      optimizationMode: "exact",
      scoringMode,
      scoreMetric:
        scoringMode === "tenRoundExpected"
          ? "expectedTenRoundTotalDamage"
          : "legacySingleRoundDamage",
      topK,
      ratioCandidateCount: ratios.length,
      bodyCombinationCount: bodyCombinations.length,
      headCombinationCount: headGeneration.candidates.length,
      fireCrystalConfigurationCount: fireConfigurations.length,
      cartesianCandidateCount,
      evaluatedCandidateCount,
      skippedIncompatibleHeadCombinationCount:
        headGeneration.skippedIncompatibleCount,
      performanceWarning:
        cartesianCandidateCount >= warningThreshold
          ? `Exact optimization will evaluate ${cartesianCandidateCount.toLocaleString("en-US")} candidates.`
          : null,
      stats: {
        candidateCount: cartesianCandidateCount,
        evaluatedCount: evaluatedCandidateCount,
        cacheHits: cache.cacheHits,
        cacheMisses: cache.cacheMisses,
        probabilityStateCount: evaluator.probabilityStateCount(),
        elapsedMs,
      },
      results,
    };
  };
}

interface BodyCombination {
  readonly heroes: readonly SupportedHeroDefinition[];
  readonly heroIds: readonly BodyHeroId[];
  readonly key: string;
}

interface EvaluatedFullSetup {
  readonly ratios: TroopRatios;
  readonly troopCounts: TroopCounts;
  readonly body: BodyCombination;
  readonly head: HeadFormationCandidate;
  readonly fireCrystalConfiguration: import("../../domain/fullBattleSetupOptimization").FireCrystalConfiguration;
  readonly evaluation: OptimizerBattleEvaluation;
  readonly baselineScore: number;
}

function generateRatioCandidates(
  dimension: FullRatioDimension | undefined,
): readonly TroopRatios[] {
  if (dimension?.mode === "fixed") return [dimension.ratios];
  if (dimension?.allowedRatios !== undefined) {
    if (dimension.allowedRatios.length === 0) throw new NoFullSetupCandidateError("ratio");
    return dimension.allowedRatios;
  }
  return generateTroopRatioGrid(dimension?.stepPercent ?? DEFAULT_RATIO_STEP, {
    ...(dimension?.minimumRatios === undefined
      ? {}
      : { minimumRatios: dimension.minimumRatios }),
    ...(dimension?.maximumRatios === undefined
      ? {}
      : { maximumRatios: dimension.maximumRatios }),
  });
}

function generateBodyCombinations(
  dimension: FullBodyDimension | undefined,
  dependencies: FullSetupOptimizerDependencies,
): readonly BodyCombination[] {
  if (dimension?.mode === "fixed") {
    if (dimension.heroIds.length > 4) throw new InvalidBodyCountError(dimension.heroIds.length);
    const heroes = dimension.heroIds.map((heroId) => resolveSupportedBodyHero(heroId, dependencies));
    return [{ heroes, heroIds: dimension.heroIds, key: [...dimension.heroIds].sort().join("|") }];
  }

  const bodyCount = dimension?.bodyCount ?? DEFAULT_BODY_COUNT;
  if (!Number.isSafeInteger(bodyCount) || bodyCount < 0 || bodyCount > 4) {
    throw new InvalidBodyCountError(bodyCount);
  }
  const candidateIds =
    dimension?.candidateHeroIds ??
    dependencies
      .getAllBodyHeroes()
      .filter((hero): hero is SupportedHeroDefinition => hero.status === "supported")
      .map((hero) => hero.id);
  if (new Set(candidateIds).size !== candidateIds.length) {
    throw new Error("body候选池不能包含重复ID；重复选择由组合生成器负责。");
  }
  const candidates = candidateIds.map((heroId) =>
    resolveSupportedBodyHero(heroId, dependencies),
  );
  const combinations = combinationsWithReplacement(candidates, bodyCount).map(
    (heroes) => {
      const heroIds = heroes.map((hero) => hero.id);
      return { heroes, heroIds, key: heroIds.join("|") };
    },
  );
  if (combinations.length === 0) throw new NoFullSetupCandidateError("body");
  return combinations;
}

function resolveSupportedBodyHero(
  heroId: BodyHeroId,
  dependencies: FullSetupOptimizerDependencies,
): SupportedHeroDefinition {
  const hero = dependencies.getBodyHeroById(heroId);
  if (hero === undefined) throw new UnknownOptimizerHeroError(heroId);
  if (hero.status !== "supported") {
    throw new UnavailableOptimizerHeroError(heroId, hero.status);
  }
  return hero;
}

function createTroops(
  input: FullBattleSetupOptimizationInput,
  troopCounts: TroopCounts,
): BattleDamageInput["troops"] {
  return TROOP_TYPES.map((troopType) => ({
    troopType,
    troopCount: troopCounts[troopType],
    troopLevelId: input.troopSettings[troopType].troopLevelId,
    stats: input.troopSettings[troopType].stats,
  }));
}

function multiplyCandidateCounts(counts: readonly number[]): number {
  let product = 1;
  for (const count of counts) {
    product *= count;
    if (!Number.isSafeInteger(product)) {
      throw new FullSetupCandidateCountOverflowError();
    }
  }
  return product;
}

function insertCandidate(
  candidates: EvaluatedFullSetup[],
  candidate: EvaluatedFullSetup,
  topK: number,
): void {
  if (
    candidates.length === topK &&
    compareCandidates(candidate, candidates[candidates.length - 1]!) >= 0
  ) return;
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

function compareCandidates(left: EvaluatedFullSetup, right: EvaluatedFullSetup): number {
  return (
    right.evaluation.score - left.evaluation.score ||
    right.ratios.marksman - left.ratios.marksman ||
    right.ratios.lancer - left.ratios.lancer ||
    right.ratios.shield - left.ratios.shield ||
    left.body.key.localeCompare(right.body.key) ||
    left.head.key.localeCompare(right.head.key) ||
    fireCrystalConfigurationKey(left.fireCrystalConfiguration).localeCompare(
      fireCrystalConfigurationKey(right.fireCrystalConfiguration),
    )
  );
}

function createCandidateResult(
  candidate: EvaluatedFullSetup,
  rank: number,
): FullBattleSetupCandidate {
  const improvementAbsolute =
    candidate.evaluation.score - candidate.baselineScore;
  const improvementRatio =
    candidate.baselineScore === 0
      ? null
      : candidate.evaluation.score / candidate.baselineScore - 1;
  const troopDamages: Record<TroopType, number> = {
    shield:
      candidate.evaluation.expectedResult?.expectedDamageByTroop.shield ??
      candidate.evaluation.deterministicTenRoundResult.rounds.reduce((sum, round) => sum + round.shieldDamage, 0),
    lancer:
      candidate.evaluation.expectedResult?.expectedDamageByTroop.lancer ??
      candidate.evaluation.deterministicTenRoundResult.rounds.reduce((sum, round) => sum + round.lancerDamage, 0),
    marksman:
      candidate.evaluation.expectedResult?.expectedDamageByTroop.marksman ??
      candidate.evaluation.deterministicTenRoundResult.rounds.reduce((sum, round) => sum + round.marksmanDamage, 0),
  };

  return {
    rank,
    ratios: candidate.ratios,
    troopCounts: candidate.troopCounts,
    bodyHeroes: candidate.body.heroes,
    bodyHeroIds: candidate.body.heroIds,
    headFormation: candidate.head.formation,
    headHeroes: candidate.head.heroes,
    fireCrystalConfiguration: candidate.fireCrystalConfiguration,
    score: candidate.evaluation.score,
    totalDamage: candidate.evaluation.score,
    singleRoundDamage: candidate.evaluation.singleRoundResult.finalDamage,
    expectedTenRoundDamage: candidate.evaluation.expectedTenRoundDamage,
    expectedDamageByRound:
      candidate.evaluation.expectedResult?.expectedDamageByRound ?? [],
    troopDamages,
    improvementAbsolute,
    improvementRatio,
    battleResult: candidate.evaluation.singleRoundResult,
    skippedPendingSkills:
      candidate.evaluation.expectedResult?.skippedPendingSkills ?? [],
    unsupportedSkills:
      candidate.evaluation.expectedResult?.unsupportedSkills ?? [],
  };
}

function validateInput(
  input: FullBattleSetupOptimizationInput,
  topK: number,
  warningThreshold: number,
): void {
  if (!Number.isSafeInteger(input.totalTroopCount) || input.totalTroopCount < 0) {
    throw new InvalidTotalTroopCountError(input.totalTroopCount);
  }
  if (!Number.isSafeInteger(topK) || topK <= 0) {
    throw new InvalidFullSetupTopKError(topK);
  }
  if (!Number.isSafeInteger(warningThreshold) || warningThreshold <= 0) {
    throw new Error(`performanceWarningThreshold必须是正安全整数，收到：${warningThreshold}。`);
  }
}
