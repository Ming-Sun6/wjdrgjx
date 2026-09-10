import type {
  BattleDamageResult,
  TroopMultiplierBreakdown,
} from "../../domain/battleDamage";
import type { DamageBreakdown } from "../../domain/damageComponent";
import type { BattleState } from "../../domain/battleState";
import type {
  BearBattleDamageInput,
  BearBattleOptions,
} from "../../domain/bearBattle";
import {
  DEFAULT_PROBABILITY_TOLERANCE,
  type AccumulatedBattleDamage,
  type ExactProbabilityScenario,
  type ExpectedBattleDamageDependencies,
  type ExpectedBattleDamageOptions,
  type ExpectedBattleDamageResult,
  type DamageDistributionResult,
  type ExpectedActiveEffectState,
  type ExpectedRoundDamageResult,
  type ExpectedRoundEnemyDefense,
  type InstantProbabilityEventReport,
  type ProbabilityRoundContext,
  type WeightedBattleState,
} from "../../domain/probability";
import type { TroopType } from "../../domain/troop";
import type { MultiplicativeEffectType } from "../../domain/skill";
import {
  calculateBearBattleTotalDamage,
  createBearBattleContext,
} from "../../rulesets/bear/battle/calculateBearBattleTotalDamage";
import {
  advanceBattleState,
  createBattleState,
  validateBattleState,
} from "../rounds/battleState";
import { advanceProbabilityStates } from "./advanceProbabilityStates";
import { calculateDamageForProbabilityState } from "./damage";
import { isInstantProbabilityEffectTransition } from "./createInstantProbabilityEvent";
import { InvalidProbabilityError } from "./errors";
import { mergeWeightedBattleStates } from "./mergeWeightedBattleStates";
import {
  assertUnitProbabilityMass,
  validateProbabilityTolerance,
} from "./probabilityMath";
import { createDamageBreakdown } from "../damage/resolveDamageComponent";
import { isTriggerChainProbabilityTransition } from "../trigger-chain/resolveTriggerChain";
import { isActiveEffectEffectiveInRound } from "./createDurationProbabilityEvent";

const TROOP_TYPES: readonly TroopType[] = ["shield", "lancer", "marksman"];
const MAX_DAMAGE_HISTORIES_PER_FUTURE_STATE = 8;

const ZERO_DAMAGE: AccumulatedBattleDamage = {
  shieldDamage: 0,
  lancerDamage: 0,
  marksmanDamage: 0,
  totalDamage: 0,
  normalDamage: 0,
  extraDamage: 0,
  primaryAttackDamage: 0,
  extraAttackDamage: 0,
};

export const calculateExpectedBattleDamage =
  createExpectedBattleDamageCalculator({
    calculateDamageForState: calculateDamageForProbabilityState,
  });

/** 第二十步正式打熊入口；保留旧名称作为兼容别名。 */
export const calculateBearBattleExpectedDamage =
  calculateExpectedBattleDamage;

export function createExpectedBattleDamageCalculator(
  dependencies: ExpectedBattleDamageDependencies,
): (
  input: BearBattleDamageInput,
  options?: ExpectedBattleDamageOptions,
) => ExpectedBattleDamageResult {
  return (input, options = {}) => {
    const start = performance.now();
    const tolerance =
      options.probabilityTolerance ?? DEFAULT_PROBABILITY_TOLERANCE;
    validateProbabilityTolerance(tolerance);
    const bearOptions = toBearBattleOptions(options);

    if (options.scenario === undefined) {
      return createDeterministicExpectedResult(
        input,
        bearOptions,
        start,
        dependencies,
        options.includeDamageDistribution === true,
      );
    }

    return calculateExactScenario(
      input,
      bearOptions,
      options.scenario,
      tolerance,
      dependencies,
      start,
      options.includeDamageDistribution === true,
    );
  };
}

function calculateExactScenario(
  input: BearBattleDamageInput,
  bearOptions: BearBattleOptions,
  scenario: ExactProbabilityScenario,
  tolerance: number,
  dependencies: ExpectedBattleDamageDependencies,
  start: number,
  includeDamageDistribution: boolean,
): ExpectedBattleDamageResult {
  if (!scenario.id) {
    throw new InvalidProbabilityError("ExactProbabilityScenario.id 不能为空。");
  }
  const context = createBearBattleContext(bearOptions);
  let states: readonly WeightedBattleState[] = [
    {
      probability: 1,
      state: createBattleState(context),
      accumulatedDamage: ZERO_DAMAGE,
      transientEffects: [],
    },
  ];
  const expectedRoundDamage: ExpectedRoundDamageResult[] = [];
  const instantProbabilityEvents: InstantProbabilityEventReport[] = [];
  let totalStatesBeforeMerge = 0;
  let totalStatesAfterMerge = 0;
  let maxStatesInAnyRound = 1;
  const distributionTracker = { compressed: false };
  const mergeOptions = includeDamageDistribution
    ? {
        preserveAccumulatedDamage: true,
        maxDamageHistoriesPerFutureState: MAX_DAMAGE_HISTORIES_PER_FUTURE_STATE,
        distributionTracker,
      }
    : {};

  for (let round = 1; round <= context.totalRounds; round += 1) {
    assertStatesAtRound(states, round);
    const stateCountAtStart = states.length;
    const roundContext: ProbabilityRoundContext = {
      battleContext: context,
      round,
    };
    const plan = scenario.createRoundPlan(roundContext);
    const beforeDamageEvents = plan.beforeDamageEvents ?? [];
    const afterDamageEvents = plan.afterDamageEvents ?? [];
    assertNoInstantEffectsAfterDamage(afterDamageEvents);
    const roundInstantEvents = reportInstantEvents(beforeDamageEvents, round);
    instantProbabilityEvents.push(...roundInstantEvents);

    const beforeDamage = advanceProbabilityStates(
      states,
      beforeDamageEvents,
      context,
      tolerance,
      mergeOptions,
    );
    const damageStep = calculateDamageForStates(
      input,
      beforeDamage.states,
      dependencies,
      tolerance,
      context,
    );
    const afterDamage = advanceProbabilityStates(
      damageStep.states,
      afterDamageEvents,
      context,
      tolerance,
      mergeOptions,
    );

    const transitioned = afterDamage.states.map((weighted) => {
      const transitionedState = scenario.transitionAfterRound?.(
        weighted.state,
        roundContext,
      ) ?? weighted.state;
      validateBattleState(transitionedState);
      assertUnchangedRoundIdentity(weighted.state, transitionedState);
      return {
        ...weighted,
        state: advanceBattleState(transitionedState),
      };
    });
    const statesBeforeMerge = Math.max(
      beforeDamage.statesBeforeMerge,
      afterDamage.statesBeforeMerge,
      transitioned.length,
    );
    states = mergeWeightedBattleStates(transitioned, mergeOptions);
    assertUnitProbabilityMass(states, tolerance, `round ${round} final states`);
    const statesAfterMerge = states.length;
    maxStatesInAnyRound = Math.max(
      maxStatesInAnyRound,
      stateCountAtStart,
      statesBeforeMerge,
      beforeDamage.statesAfterMerge,
      afterDamage.statesAfterMerge,
      statesAfterMerge,
    );
    totalStatesBeforeMerge += statesBeforeMerge;
    totalStatesAfterMerge += statesAfterMerge;
    expectedRoundDamage.push({
      round,
      ...damageStep.expected,
      probabilityMass: damageStep.probabilityMass,
      stateCountAtStart,
      statesBeforeMerge,
      statesAfterMerge,
      instantProbabilityEvents: roundInstantEvents,
    });
  }

  const expected = sumExpectedRounds(expectedRoundDamage);
  const expectedFromFinalStates = expectedAccumulatedDamage(states);
  assertDamageExpectationsEqual(expected, expectedFromFinalStates, tolerance);

  return {
    context,
    expectedBaseDamage: sumRoundMetric(expectedRoundDamage, "expectedBaseDamage"),
    expectedSkillDamage: sumRoundMetric(expectedRoundDamage, "expectedSkillDamage"),
    expectedTotalDamage: expected.totalDamage,
    expectedShieldDamage: expected.shieldDamage,
    expectedLancerDamage: expected.lancerDamage,
    expectedMarksmanDamage: expected.marksmanDamage,
    expectedNormalDamage: expected.normalDamage,
    expectedExtraDamage: expected.extraDamage,
    expectedPrimaryAttackDamage: expected.primaryAttackDamage,
    expectedExtraAttackDamage: expected.extraAttackDamage,
    expectedAttackCount: sumRoundMetric(expectedRoundDamage, "expectedAttackCount"),
    expectedTroopDamageBreakdowns:
      sumExpectedTroopDamageBreakdowns(expectedRoundDamage),
    expectedRoundDamage,
    instantProbabilityEvents,
    finalStates: states,
    ...(includeDamageDistribution
      ? { damageDistribution: createDamageDistribution(states, distributionTracker.compressed) }
      : {}),
    statistics: {
      statesBeforeMerge: totalStatesBeforeMerge,
      statesAfterMerge: totalStatesAfterMerge,
      maxStatesInAnyRound,
      finalStateCount: states.length,
      elapsedMs: performance.now() - start,
    },
  };
}

function createDeterministicExpectedResult(
  input: BearBattleDamageInput,
  options: BearBattleOptions,
  start: number,
  dependencies: ExpectedBattleDamageDependencies,
  includeDamageDistribution: boolean,
): ExpectedBattleDamageResult {
  const deterministic =
    dependencies.calculateDeterministicBattleDamage?.(input, options) ??
    calculateBearBattleTotalDamage(input, options);
  const expectedRoundDamage = deterministic.rounds.map(
    (round): ExpectedRoundDamageResult => ({
      round: round.round,
      expectedShieldDamage: round.shieldDamage,
      expectedBaseDamage: round.singleRoundResult.baseDamage,
      expectedSkillDamage:
        round.damageBreakdown.normalDamage - round.singleRoundResult.baseDamage,
      expectedLancerDamage: round.lancerDamage,
      expectedMarksmanDamage: round.marksmanDamage,
      expectedTotalDamage: round.totalDamage,
      expectedNormalDamage: round.damageBreakdown.normalDamage,
      expectedExtraDamage: round.damageBreakdown.extraDamage,
      expectedPrimaryAttackDamage: round.primaryAttackDamage,
      expectedExtraAttackDamage: round.extraAttackDamage,
      expectedAttackCount: round.attacks.length,
      expectedActiveEffects: expectedActiveEffectsForDeterministicRound(round),
      expectedMultipliersByTroop: round.activeEffects.multipliersByTroop,
      enemyDefense: {
        enemyBaseDefense: round.enemyDefense.enemyBaseDefense,
        expectedEffectiveDefenseByTroop:
          round.enemyDefense.enemyEffectiveDefenseByTroop,
        expectedDefenseReductionMultiplierByTroop:
          round.enemyDefense.defenseReductionMultiplierByTroop,
        defenseReductionAppliedExactlyOnce: true,
      },
      expectedTroopDamageBreakdowns: round.troopDamageBreakdowns,
      probabilityMass: 1,
      stateCountAtStart: 1,
      statesBeforeMerge: 1,
      statesAfterMerge: 1,
      instantProbabilityEvents: [],
    }),
  );
  const expected = sumExpectedRounds(expectedRoundDamage);
  const finalState = deterministic.finalState;
  if (finalState === undefined) {
    throw new InvalidProbabilityError("确定性战斗结果缺少 finalState。");
  }
  const finalStates: readonly WeightedBattleState[] = [
    {
      probability: 1,
      state: finalState,
      accumulatedDamage: {
        ...expected,
        totalDamage: deterministic.totalDamage,
      },
      transientEffects: [],
    },
  ];

  return {
    context: deterministic.context,
    expectedBaseDamage: sumRoundMetric(expectedRoundDamage, "expectedBaseDamage"),
    expectedSkillDamage: sumRoundMetric(expectedRoundDamage, "expectedSkillDamage"),
    expectedTotalDamage: deterministic.totalDamage,
    expectedShieldDamage: expected.shieldDamage,
    expectedLancerDamage: expected.lancerDamage,
    expectedMarksmanDamage: expected.marksmanDamage,
    expectedNormalDamage: expected.normalDamage,
    expectedExtraDamage: expected.extraDamage,
    expectedPrimaryAttackDamage: expected.primaryAttackDamage,
    expectedExtraAttackDamage: expected.extraAttackDamage,
    expectedAttackCount: sumRoundMetric(expectedRoundDamage, "expectedAttackCount"),
    expectedTroopDamageBreakdowns:
      sumExpectedTroopDamageBreakdowns(expectedRoundDamage),
    expectedRoundDamage,
    finalStates,
    ...(includeDamageDistribution
      ? { damageDistribution: createDamageDistribution(finalStates, false) }
      : {}),
    instantProbabilityEvents: [],
    statistics: {
      statesBeforeMerge: deterministic.context.totalRounds,
      statesAfterMerge: deterministic.context.totalRounds,
      maxStatesInAnyRound: 1,
      finalStateCount: 1,
      elapsedMs: performance.now() - start,
    },
  };
}

function createDamageDistribution(
  states: readonly WeightedBattleState[],
  compressed: boolean,
): DamageDistributionResult {
  const probabilityByDamage = new Map<number, number>();
  for (const weighted of states) {
    const damage = weighted.accumulatedDamage.totalDamage;
    probabilityByDamage.set(
      damage,
      (probabilityByDamage.get(damage) ?? 0) + weighted.probability,
    );
  }
  const points = [...probabilityByDamage.entries()]
    .sort(([left], [right]) => left - right)
    .map(([damage, probability]) => ({ damage, probability }));
  if (points.length === 0) {
    throw new InvalidProbabilityError("最终伤害分布不能为空。");
  }
  return {
    points,
    lower95: weightedQuantile(points, 0.025),
    upper95: weightedQuantile(points, 0.975),
    method: compressed
      ? "deterministicCompressedStateDistribution"
      : "exactStateDistribution",
  };
}

function weightedQuantile(
  points: readonly { readonly damage: number; readonly probability: number }[],
  quantile: number,
): number {
  let cumulative = 0;
  for (const point of points) {
    cumulative += point.probability;
    if (cumulative + DEFAULT_PROBABILITY_TOLERANCE >= quantile) {
      return point.damage;
    }
  }
  return points[points.length - 1]!.damage;
}

interface StateDamageStep {
  readonly states: readonly WeightedBattleState[];
  readonly expected: {
    readonly expectedBaseDamage: number;
    readonly expectedSkillDamage: number;
    readonly expectedShieldDamage: number;
    readonly expectedLancerDamage: number;
    readonly expectedMarksmanDamage: number;
    readonly expectedTotalDamage: number;
    readonly expectedNormalDamage: number;
    readonly expectedExtraDamage: number;
    readonly expectedPrimaryAttackDamage: number;
    readonly expectedExtraAttackDamage: number;
    readonly expectedAttackCount: number;
    readonly expectedActiveEffects: readonly ExpectedActiveEffectState[];
    readonly expectedMultipliersByTroop: Readonly<
      Partial<Record<TroopType, TroopMultiplierBreakdown>>
    >;
    readonly enemyDefense: ExpectedRoundEnemyDefense;
    readonly expectedTroopDamageBreakdowns: Readonly<
      Partial<Record<TroopType, DamageBreakdown>>
    >;
  };
  readonly probabilityMass: number;
}

function calculateDamageForStates(
  input: BearBattleDamageInput,
  states: readonly WeightedBattleState[],
  dependencies: ExpectedBattleDamageDependencies,
  tolerance: number,
  context: ReturnType<typeof createBearBattleContext>,
): StateDamageStep {
  const probabilityMass = assertUnitProbabilityMass(
    states,
    tolerance,
    "states before damage",
  );
  let expectedShieldDamage = 0;
  let expectedLancerDamage = 0;
  let expectedMarksmanDamage = 0;
  let expectedTotalDamage = 0;
  let expectedNormalDamage = 0;
  let expectedExtraDamage = 0;
  let expectedPrimaryAttackDamage = 0;
  let expectedExtraAttackDamage = 0;
  let expectedBaseDamage = 0;
  let expectedAttackCount = 0;
  const expectedTroopDamageBreakdowns = createMutableTroopBreakdowns();
  const expectedMultipliersByTroop: Partial<
    Record<TroopType, TroopMultiplierBreakdown>
  > = {};
  const expectedEffectiveDefenseByTroop: Partial<
    Record<TroopType, number | null>
  > = {};
  const expectedDefenseReductionMultiplierByTroop: Partial<
    Record<TroopType, number>
  > = {};
  const expectedActiveEffects = summarizeExpectedActiveEffects(
    states,
    states[0]?.state.currentRound ?? 1,
  );
  const damagedStates = states.map((weighted): WeightedBattleState => {
    const result = dependencies.calculateDamageForState(
      input,
      weighted.state.activeEffects,
      weighted.transientEffects ?? [],
      weighted.state.currentRound,
    );
    const damage = battleResultDamage(result);
    expectedShieldDamage += weighted.probability * damage.shieldDamage;
    expectedLancerDamage += weighted.probability * damage.lancerDamage;
    expectedMarksmanDamage += weighted.probability * damage.marksmanDamage;
    expectedTotalDamage += weighted.probability * damage.totalDamage;
    expectedNormalDamage += weighted.probability * damage.normalDamage;
    expectedExtraDamage += weighted.probability * damage.extraDamage;
    expectedPrimaryAttackDamage +=
      weighted.probability * damage.primaryAttackDamage;
    expectedExtraAttackDamage +=
      weighted.probability * damage.extraAttackDamage;
    expectedBaseDamage += weighted.probability * result.baseDamage;
    expectedAttackCount += weighted.probability * result.attacks.length;
    for (const troopType of TROOP_TYPES) {
      const troopResult = result.troopDamages[troopType];
      if (troopResult === undefined) continue;
      const breakdown = troopResult.damageBreakdown;
      const current = expectedTroopDamageBreakdowns[troopType];
      current.normalDamage += weighted.probability * breakdown.normalDamage;
      current.extraDamage += weighted.probability * breakdown.extraDamage;
      current.totalDamage += weighted.probability * breakdown.totalDamage;
      addWeightedMultipliers(
        expectedMultipliersByTroop,
        troopType,
        troopResult.multipliers,
        weighted.probability,
      );
      const defenseMultiplier =
        troopResult.multipliers.byEffectType.defenseReduction;
      expectedDefenseReductionMultiplierByTroop[troopType] =
        (expectedDefenseReductionMultiplierByTroop[troopType] ?? 0) +
        weighted.probability * defenseMultiplier;
      if (context.enemyBaseDefense !== null) {
        if (defenseMultiplier === 1) {
          if (expectedEffectiveDefenseByTroop[troopType] !== null) {
            expectedEffectiveDefenseByTroop[troopType] =
              (expectedEffectiveDefenseByTroop[troopType] ?? 0) +
              weighted.probability * context.enemyBaseDefense;
          }
        } else {
          // 任一概率分支存在减防时，绝对有效防御因底层映射未知而不报告近似值。
          expectedEffectiveDefenseByTroop[troopType] = null;
        }
      }
    }
    return {
      ...weighted,
      accumulatedDamage: addDamage(weighted.accumulatedDamage, damage),
      // 即时效果只参与本次伤害结算，绝不写入或跨回合污染 BattleState。
      transientEffects: [],
    };
  });

  return {
    states: damagedStates,
    expected: {
      expectedBaseDamage,
      expectedSkillDamage: expectedNormalDamage - expectedBaseDamage,
      expectedShieldDamage,
      expectedLancerDamage,
      expectedMarksmanDamage,
      expectedTotalDamage,
      expectedNormalDamage,
      expectedExtraDamage,
      expectedPrimaryAttackDamage,
      expectedExtraAttackDamage,
      expectedAttackCount,
      expectedActiveEffects,
      expectedMultipliersByTroop,
      enemyDefense: {
        enemyBaseDefense: context.enemyBaseDefense,
        expectedEffectiveDefenseByTroop,
        expectedDefenseReductionMultiplierByTroop,
        defenseReductionAppliedExactlyOnce: true,
      },
      expectedTroopDamageBreakdowns,
    },
    probabilityMass,
  };
}

function reportInstantEvents(
  events: readonly import("../../domain/probability").BernoulliStateTransition[],
  round: number,
): readonly InstantProbabilityEventReport[] {
  return events
    .filter(isInstantProbabilityEffectTransition)
    .map((event) => {
      const first = event.transientEffects[0];
      if (first === undefined) {
        throw new InvalidProbabilityError(
          `即时概率事件 ${event.id} 不包含效果。`,
        );
      }
      return {
        round,
        eventId: event.id,
        skillId: first.sourceSkillId,
        skillName: first.sourceSkillName,
        triggerProbability: event.trigger.probability,
        triggerPhase: event.trigger.triggerPhase,
        triggerFrequency: event.trigger.frequency,
        effects: event.transientEffects.map((transient) => ({
          type: transient.effect.type,
          value: transient.effect.value,
          targetTroop: transient.effect.targetTroop,
        })),
      };
    });
}

function assertNoInstantEffectsAfterDamage(
  events: readonly import("../../domain/probability").BernoulliStateTransition[],
): void {
  const instant = events.find(isInstantProbabilityEffectTransition);
  if (instant !== undefined) {
    throw new InvalidProbabilityError(
      `即时概率事件 ${instant.id} 不能安排在 afterDamageEvents；其是否影响后续攻击的时序尚未确认。`,
    );
  }
  const triggerChain = events.find(isTriggerChainProbabilityTransition);
  if (triggerChain !== undefined) {
    throw new InvalidProbabilityError(
      `技能联动事件 ${triggerChain.id} 不能安排在 afterDamageEvents；请显式安排到可参与当前伤害的事件边界。`,
    );
  }
}

function battleResultDamage(result: BattleDamageResult): AccumulatedBattleDamage {
  return {
    shieldDamage: result.troopDamages.shield?.finalDamage ?? 0,
    lancerDamage: result.troopDamages.lancer?.finalDamage ?? 0,
    marksmanDamage: result.troopDamages.marksman?.finalDamage ?? 0,
    totalDamage: result.finalDamage,
    normalDamage: result.damageBreakdown.normalDamage,
    extraDamage: result.damageBreakdown.extraDamage,
    primaryAttackDamage: result.primaryAttackDamage,
    extraAttackDamage: result.extraAttackDamage,
  };
}

function addDamage(
  left: AccumulatedBattleDamage,
  right: AccumulatedBattleDamage,
): AccumulatedBattleDamage {
  return {
    shieldDamage: left.shieldDamage + right.shieldDamage,
    lancerDamage: left.lancerDamage + right.lancerDamage,
    marksmanDamage: left.marksmanDamage + right.marksmanDamage,
    totalDamage: left.totalDamage + right.totalDamage,
    normalDamage: left.normalDamage + right.normalDamage,
    extraDamage: left.extraDamage + right.extraDamage,
    primaryAttackDamage:
      left.primaryAttackDamage + right.primaryAttackDamage,
    extraAttackDamage: left.extraAttackDamage + right.extraAttackDamage,
  };
}

function sumExpectedRounds(
  rounds: readonly ExpectedRoundDamageResult[],
): AccumulatedBattleDamage {
  return rounds.reduce<AccumulatedBattleDamage>(
    (sum, round) => ({
      shieldDamage: sum.shieldDamage + round.expectedShieldDamage,
      lancerDamage: sum.lancerDamage + round.expectedLancerDamage,
      marksmanDamage: sum.marksmanDamage + round.expectedMarksmanDamage,
      totalDamage: sum.totalDamage + round.expectedTotalDamage,
      normalDamage: sum.normalDamage + round.expectedNormalDamage,
      extraDamage: sum.extraDamage + round.expectedExtraDamage,
      primaryAttackDamage:
        sum.primaryAttackDamage + round.expectedPrimaryAttackDamage,
      extraAttackDamage:
        sum.extraAttackDamage + round.expectedExtraAttackDamage,
    }),
    ZERO_DAMAGE,
  );
}

function expectedAccumulatedDamage(
  states: readonly WeightedBattleState[],
): AccumulatedBattleDamage {
  return states.reduce<AccumulatedBattleDamage>(
    (sum, weighted) => ({
      shieldDamage:
        sum.shieldDamage +
        weighted.probability * weighted.accumulatedDamage.shieldDamage,
      lancerDamage:
        sum.lancerDamage +
        weighted.probability * weighted.accumulatedDamage.lancerDamage,
      marksmanDamage:
        sum.marksmanDamage +
        weighted.probability * weighted.accumulatedDamage.marksmanDamage,
      totalDamage:
        sum.totalDamage +
        weighted.probability * weighted.accumulatedDamage.totalDamage,
      normalDamage:
        sum.normalDamage +
        weighted.probability * weighted.accumulatedDamage.normalDamage,
      extraDamage:
        sum.extraDamage +
        weighted.probability * weighted.accumulatedDamage.extraDamage,
      primaryAttackDamage:
        sum.primaryAttackDamage +
        weighted.probability * weighted.accumulatedDamage.primaryAttackDamage,
      extraAttackDamage:
        sum.extraAttackDamage +
        weighted.probability * weighted.accumulatedDamage.extraAttackDamage,
    }),
    ZERO_DAMAGE,
  );
}

function assertDamageExpectationsEqual(
  roundSum: AccumulatedBattleDamage,
  stateSum: AccumulatedBattleDamage,
  tolerance: number,
): void {
  for (const key of Object.keys(roundSum) as (keyof AccumulatedBattleDamage)[]) {
    const scale = Math.max(1, Math.abs(roundSum[key]), Math.abs(stateSum[key]));
    if (Math.abs(roundSum[key] - stateSum[key]) > tolerance * scale) {
      throw new InvalidProbabilityError(
        `逐回合期望与最终状态期望不一致：${key} ${roundSum[key]} != ${stateSum[key]}。`,
      );
    }
  }
}

function createMutableTroopBreakdowns(): Record<
  TroopType,
  { normalDamage: number; extraDamage: number; totalDamage: number }
> {
  return {
    shield: { normalDamage: 0, extraDamage: 0, totalDamage: 0 },
    lancer: { normalDamage: 0, extraDamage: 0, totalDamage: 0 },
    marksman: { normalDamage: 0, extraDamage: 0, totalDamage: 0 },
  };
}

function addWeightedMultipliers(
  totals: Partial<Record<TroopType, TroopMultiplierBreakdown>>,
  troopType: TroopType,
  multipliers: TroopMultiplierBreakdown,
  probability: number,
): void {
  const previous = totals[troopType];
  const byEffectType = Object.fromEntries(
    (
      Object.keys(
        multipliers.byEffectType,
      ) as MultiplicativeEffectType[]
    ).map((effectType) => [
      effectType,
      (previous?.byEffectType[effectType] ?? 0) +
        probability * multipliers.byEffectType[effectType],
    ]),
  ) as Record<MultiplicativeEffectType, number>;
  totals[troopType] = {
    byEffectType,
    combined: (previous?.combined ?? 0) + probability * multipliers.combined,
  };
}

function summarizeExpectedActiveEffects(
  states: readonly WeightedBattleState[],
  round: number,
): readonly ExpectedActiveEffectState[] {
  interface MutableExpectedActiveEffect {
    id: string;
    sourceSkillId: string;
    effectType: ExpectedActiveEffectState["effectType"];
    targetTroop: ExpectedActiveEffectState["targetTroop"];
    activeProbability: number;
    expectedStackCount: number;
    expectedApplicationCount: number;
    expectedRemainingRounds: number;
    hasUnboundedDuration: boolean;
  }

  const byIdentity = new Map<string, MutableExpectedActiveEffect>();
  for (const weighted of states) {
    for (const active of weighted.state.activeEffects) {
      if (!isActiveEffectEffectiveInRound(active, round)) continue;
      const key = JSON.stringify(active.identity);
      const current = byIdentity.get(key) ?? {
        id: active.id,
        sourceSkillId: active.sourceSkillId,
        effectType: active.effect.type,
        targetTroop: active.appliesToTroop ?? active.effect.targetTroop,
        activeProbability: 0,
        expectedStackCount: 0,
        expectedApplicationCount: 0,
        expectedRemainingRounds: 0,
        hasUnboundedDuration: false,
      };
      current.activeProbability += weighted.probability;
      current.expectedStackCount += weighted.probability * active.stackCount;
      current.expectedApplicationCount +=
        weighted.probability * active.applicationCount;
      if (active.remainingRounds === undefined) {
        current.hasUnboundedDuration = true;
      } else {
        current.expectedRemainingRounds +=
          weighted.probability * active.remainingRounds;
      }
      byIdentity.set(key, current);
    }
  }

  return [...byIdentity.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, active]) => ({
      id: active.id,
      sourceSkillId: active.sourceSkillId,
      effectType: active.effectType,
      targetTroop: active.targetTroop,
      activeProbability: active.activeProbability,
      expectedStackCount: active.expectedStackCount,
      expectedApplicationCount: active.expectedApplicationCount,
      expectedRemainingRounds: active.hasUnboundedDuration
        ? null
        : active.expectedRemainingRounds,
    }));
}

function expectedActiveEffectsForDeterministicRound(round: {
  readonly round: number;
  readonly stateBefore?: BattleState;
}): readonly ExpectedActiveEffectState[] {
  if (round.stateBefore === undefined) return [];
  return summarizeExpectedActiveEffects(
    [
      {
        probability: 1,
        state: round.stateBefore,
        accumulatedDamage: ZERO_DAMAGE,
      },
    ],
    round.round,
  );
}

function sumRoundMetric(
  rounds: readonly ExpectedRoundDamageResult[],
  key: "expectedBaseDamage" | "expectedSkillDamage" | "expectedAttackCount",
): number {
  return rounds.reduce((sum, round) => sum + round[key], 0);
}

function sumExpectedTroopDamageBreakdowns(
  rounds: readonly ExpectedRoundDamageResult[],
): Readonly<Record<TroopType, DamageBreakdown>> {
  const totals = createMutableTroopBreakdowns();
  for (const round of rounds) {
    for (const troopType of TROOP_TYPES) {
      const breakdown = round.expectedTroopDamageBreakdowns[troopType];
      if (breakdown === undefined) continue;
      totals[troopType].normalDamage += breakdown.normalDamage;
      totals[troopType].extraDamage += breakdown.extraDamage;
      totals[troopType].totalDamage += breakdown.totalDamage;
    }
  }
  return Object.fromEntries(
    TROOP_TYPES.map((troopType) => {
      const total = totals[troopType];
      return [
        troopType,
        createDamageBreakdown(total.normalDamage, total.extraDamage),
      ] as const;
    }),
  ) as unknown as Readonly<Record<TroopType, DamageBreakdown>>;
}

function assertStatesAtRound(
  states: readonly WeightedBattleState[],
  round: number,
): void {
  for (const weighted of states) {
    validateBattleState(weighted.state);
    if (
      weighted.state.status !== "ready" ||
      weighted.state.currentRound !== round
    ) {
      throw new InvalidProbabilityError(
        `概率状态应处于待结算第 ${round} 回合。`,
      );
    }
  }
}

function assertUnchangedRoundIdentity(
  before: BattleState,
  after: BattleState,
): void {
  if (
    before.currentRound !== after.currentRound ||
    before.totalRounds !== after.totalRounds ||
    before.status !== after.status
  ) {
    throw new InvalidProbabilityError(
      "transitionAfterRound 只能更新动态效果，不能自行推进回合或改变战斗状态。",
    );
  }
}

function toBearBattleOptions(
  options: ExpectedBattleDamageOptions,
): BearBattleOptions {
  return options.enemyBaseDefense === undefined
    ? {}
    : { enemyBaseDefense: options.enemyBaseDefense };
}
