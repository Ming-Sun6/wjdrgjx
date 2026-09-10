import { calculateBattleDamage } from "../../app/calculateBattleDamage";
import { calculateTenRoundExpectedDamage } from "../../app/calculateTenRoundExpectedDamage";
import type { BattleDamageInput, BattleDamageResult } from "../../domain/battleDamage";
import type { BattleTotalDamageResult } from "../../domain/bearBattle";
import type { OptimizerScoringMode } from "../../domain/optimizerScoring";
import type {
  TenRoundExpectedDamageInput,
  TenRoundExpectedDamageResult,
} from "../../domain/tenRoundExpectedDamage";
import { calculateBearBattleTotalDamageFromSingleRound } from "../../rulesets/bear/battle";
import {
  BattleEvaluationCache,
  createBattleEvaluationKey,
} from "./BattleEvaluationCache";
import { getHeroById } from "../../game-data/heroes/bodyHeroQueries";
import type { BodyHeroId, HeroId } from "../../domain/hero";
import { resolveBattleReportAdjustedInput } from "../../systems/reportHeroAdjustment";

export interface OptimizerBattleEvaluation {
  readonly score: number;
  readonly singleRoundResult: BattleDamageResult;
  readonly deterministicTenRoundResult: BattleTotalDamageResult;
  readonly expectedResult?: TenRoundExpectedDamageResult;
  readonly expectedTenRoundDamage: number | null;
}

export interface OptimizerBattleEvaluatorDependencies {
  readonly calculateSingleRoundDamage?: (input: BattleDamageInput) => BattleDamageResult;
  readonly calculateTenRoundExpectedDamage?: (
    input: TenRoundExpectedDamageInput,
    options?: { readonly enemyBaseDefense?: number },
  ) => TenRoundExpectedDamageResult;
}

export interface EvaluateBattleOptions {
  readonly scoringMode: OptimizerScoringMode;
  readonly legacyMetricId: string;
  readonly legacyScore: (
    singleRoundResult: BattleDamageResult,
    deterministicTenRoundResult: BattleTotalDamageResult,
  ) => number;
  readonly enemyBaseDefense?: number;
}

export interface OptimizerBattleEvaluator {
  readonly evaluate: (
    input: TenRoundExpectedDamageInput,
    options: EvaluateBattleOptions,
  ) => OptimizerBattleEvaluation;
  readonly cache: BattleEvaluationCache<OptimizerBattleEvaluation>;
  readonly probabilityStateCount: () => number;
}

export function createOptimizerBattleEvaluator(
  dependencies: OptimizerBattleEvaluatorDependencies = {},
  cache = new BattleEvaluationCache<OptimizerBattleEvaluation>(),
): OptimizerBattleEvaluator {
  const calculateSingle =
    dependencies.calculateSingleRoundDamage ?? calculateBattleDamage;
  const calculateExpected =
    dependencies.calculateTenRoundExpectedDamage ?? calculateTenRoundExpectedDamage;
  const canUseCatalogEquivalence =
    (dependencies.calculateSingleRoundDamage === undefined || dependencies.calculateSingleRoundDamage === calculateBattleDamage) &&
    (dependencies.calculateTenRoundExpectedDamage === undefined || dependencies.calculateTenRoundExpectedDamage === calculateTenRoundExpectedDamage);
  let probabilityStateCount = 0;

  return {
    cache,
    probabilityStateCount: () => probabilityStateCount,
    evaluate(input, options) {
      const key = createBattleEvaluationKey(
        input,
        options.scoringMode,
        options.legacyMetricId,
        options.enemyBaseDefense,
        canUseCatalogEquivalence
          ? input.bodyHeroIds.map(bodyHeroCombatKey)
          : undefined,
      );
      const cached = cache.getOrCompute(key, () => {
        const resolvedInput = resolveBattleReportAdjustedInput(input).input;
        const { fireCrystal: _fireCrystal, ...singleRoundInput } = resolvedInput;
        const singleRoundResult = calculateSingle(singleRoundInput);
        const deterministicTenRoundResult =
          calculateBearBattleTotalDamageFromSingleRound(
            singleRoundResult,
            options.enemyBaseDefense === undefined
              ? {}
              : { enemyBaseDefense: options.enemyBaseDefense },
          );

        if (options.scoringMode === "legacy") {
          return {
            score: options.legacyScore(
              singleRoundResult,
              deterministicTenRoundResult,
            ),
            singleRoundResult,
            deterministicTenRoundResult,
            expectedTenRoundDamage: null,
          };
        }

        const expectedResult = calculateExpected(
          resolvedInput,
          options.enemyBaseDefense === undefined
            ? {}
            : { enemyBaseDefense: options.enemyBaseDefense },
        );
        return {
          score: expectedResult.expectedTotalDamage,
          singleRoundResult,
          deterministicTenRoundResult,
          expectedResult,
          expectedTenRoundDamage: expectedResult.expectedTotalDamage,
        };
      });
      if (!cached.hit && cached.value.expectedResult !== undefined) {
        probabilityStateCount +=
          cached.value.expectedResult.statistics.statesAfterMerge;
      }
      return cached.value;
    },
  };
}

/** 技能结构完全相同的不同英雄仍作为不同候选展示，但只需重复利用同一次精确伤害评估。 */
function bodyHeroCombatKey(heroId: BodyHeroId): string {
  const hero = getHeroById(heroId as HeroId);
  if (hero === undefined || hero.role !== "body" || hero.status !== "supported") return heroId;
  return JSON.stringify({
    trigger: hero.bodySkill.trigger,
    lifecycle: hero.bodySkill.lifecycle ?? null,
    effects: hero.bodySkill.effects.map(({ rawDescription: _raw, status: _status, ...effect }) => effect),
  });
}
