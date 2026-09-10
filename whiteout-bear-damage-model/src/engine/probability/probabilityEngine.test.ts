import { describe, expect, it } from "vitest";
import { calculateBattleDamage } from "../../app/calculateBattleDamage";
import type { BattleDamageInput } from "../../domain/battleDamage";
import type { BattleState } from "../../domain/battleState";
import type {
  AccumulatedBattleDamage,
  BernoulliStateTransition,
  ExactProbabilityScenario,
  WeightedBattleState,
} from "../../domain/probability";
import {
  calculateBearBattleTotalDamage,
  createBearBattleContext,
} from "../../rulesets/bear/battle/calculateBearBattleTotalDamage";
import {
  createActiveEffect,
  decrementEffectDurations,
} from "../rounds/activeEffects";
import { createBattleState } from "../rounds/battleState";
import { advanceProbabilityStates } from "./advanceProbabilityStates";
import { battleStateKey } from "./battleStateKey";
import { calculateExpectedBattleDamage } from "./calculateExpectedBattleDamage";
import { InvalidProbabilityError } from "./errors";
import { mergeWeightedBattleStates } from "./mergeWeightedBattleStates";
import { probabilityMass } from "./probabilityMath";

const input: BattleDamageInput = {
  troops: [
    {
      troopType: "shield",
      troopLevelId: "T10",
      troopCount: 10_000,
      stats: { attackPercent: 400, penetrationPercent: 100 },
    },
    {
      troopType: "lancer",
      troopLevelId: "T10",
      troopCount: 20_000,
      stats: { attackPercent: 400, penetrationPercent: 100 },
    },
    {
      troopType: "marksman",
      troopLevelId: "T10",
      troopCount: 30_000,
      stats: { attackPercent: 400, penetrationPercent: 100 },
    },
  ],
  bodyHeroIds: [],
};

const zeroDamage: AccumulatedBattleDamage = {
  shieldDamage: 0,
  lancerDamage: 0,
  marksmanDamage: 0,
  totalDamage: 0,
  normalDamage: 0,
  extraDamage: 0,
  primaryAttackDamage: 0,
  extraAttackDamage: 0,
};

function initialWeightedState(): WeightedBattleState {
  return {
    probability: 1,
    state: createBattleState(createBearBattleContext()),
    accumulatedDamage: zeroDamage,
  };
}

function addSyntheticEffect(
  state: BattleState,
  id: string,
  value: number,
  durationRounds = 2,
): BattleState {
  return {
    ...state,
    activeEffects: [
      ...state.activeEffects,
      createActiveEffect({
        id,
        sourceSkillId: `synthetic.skill.${id}`,
        effect: {
          type: "damageIncrease",
          value,
          targetTroop: "all",
        },
        durationRounds,
      }),
    ],
  };
}

function syntheticEvent(
  id: string,
  probability: number,
  value = 0.25,
  durationRounds = 2,
): BernoulliStateTransition {
  return {
    id,
    trigger: {
      type: "probability",
      probability,
      triggerPhase: "roundStart",
    },
    applyTriggered: (state) =>
      addSyntheticEffect(state, id, value, durationRounds),
  };
}

function oneTimeScenario(
  event: BernoulliStateTransition,
): ExactProbabilityScenario {
  return {
    id: `scenario.${event.id}`,
    createRoundPlan: ({ round }) => ({
      beforeDamageEvents: round === 1 ? [event] : [],
    }),
    transitionAfterRound: (state) => ({
      ...state,
      activeEffects: decrementEffectDurations(state.activeEffects),
    }),
  };
}

describe("精确概率状态传播", () => {
  it("50% 概率单回合伤害乘 2 的期望倍率为 1.5", () => {
    const base = calculateBattleDamage(input).finalDamage;
    const result = calculateExpectedBattleDamage(input, {
      scenario: oneTimeScenario(syntheticEvent("double-once", 0.5, 1, 1)),
    });

    expect(result.expectedRoundDamage[0]?.expectedTotalDamage).toBeCloseTo(
      base * 1.5,
      12,
    );
    expect(result.expectedRoundDamage[1]?.expectedTotalDamage).toBe(base);
    expect(Math.abs(result.expectedTotalDamage - base * 10.5)).toBeLessThan(
      base * 1e-12,
    );
  });

  it("25% Bernoulli 事件精确分成触发和不触发两支且概率和为 1", () => {
    const result = advanceProbabilityStates(
      [initialWeightedState()],
      [syntheticEvent("quarter", 0.25)],
      createBearBattleContext(),
      1e-12,
    );

    expect(result.states).toHaveLength(2);
    expect(result.states.map((state) => state.probability).sort()).toEqual([
      0.25, 0.75,
    ]);
    expect(probabilityMass(result.states)).toBe(1);
  });

  it("两个独立事件 p=0.5、q=0.4 产生四个联合概率且概率和为 1", () => {
    const result = advanceProbabilityStates(
      [initialWeightedState()],
      [syntheticEvent("p", 0.5), syntheticEvent("q", 0.4)],
      createBearBattleContext(),
      1e-12,
    );

    expect(result.statesBeforeMerge).toBe(4);
    expect(result.statesAfterMerge).toBe(4);
    expect(result.states.map((state) => state.probability).sort()).toEqual([
      0.2, 0.2, 0.3, 0.3,
    ]);
    expect(probabilityMass(result.states)).toBeCloseTo(1, 12);
  });

  it("持续两回合的随机 ActiveEffect 会被两个回合继承，随后到期", () => {
    const base = calculateBattleDamage(input).finalDamage;
    const result = calculateExpectedBattleDamage(input, {
      scenario: oneTimeScenario(syntheticEvent("two-rounds", 0.5, 1, 2)),
    });

    expect(result.expectedRoundDamage[0]?.expectedTotalDamage).toBeCloseTo(
      base * 1.5,
      12,
    );
    expect(result.expectedRoundDamage[1]?.expectedTotalDamage).toBeCloseTo(
      base * 1.5,
      12,
    );
    expect(result.expectedRoundDamage[2]?.expectedTotalDamage).toBe(base);
    expect(result.expectedTotalDamage).toBeCloseTo(base * 11, 12);
    expect(result.finalStates).toHaveLength(1);
    expect(result.finalStates[0]?.state.activeEffects).toEqual([]);
  });

  it("相同未来 BattleState 会合并，历史伤害条件期望与总期望保持不变", () => {
    const state = initialWeightedState().state;
    const before: WeightedBattleState[] = [
      {
        probability: 0.25,
        state,
        accumulatedDamage: { ...zeroDamage, totalDamage: 10 },
      },
      {
        probability: 0.75,
        state,
        accumulatedDamage: { ...zeroDamage, totalDamage: 30 },
      },
    ];
    const expectedBefore = before.reduce(
      (sum, item) =>
        sum + item.probability * item.accumulatedDamage.totalDamage,
      0,
    );
    const merged = mergeWeightedBattleStates(before);
    const expectedAfter = merged.reduce(
      (sum, item) =>
        sum + item.probability * item.accumulatedDamage.totalDamage,
      0,
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.probability).toBe(1);
    expect(merged[0]?.accumulatedDamage.totalDamage).toBe(25);
    expect(expectedAfter).toBe(expectedBefore);
  });

  it("canonical key 不受对象属性声明顺序影响，但保留 ActiveEffect 数组顺序", () => {
    const first = addSyntheticEffect(
      addSyntheticEffect(initialWeightedState().state, "a", 0.1),
      "b",
      0.2,
    );
    const reorderedObject: BattleState = {
      activeEffects: first.activeEffects,
      status: first.status,
      totalRounds: first.totalRounds,
      currentRound: first.currentRound,
    };
    const reversedEffects: BattleState = {
      ...first,
      activeEffects: [...first.activeEffects].reverse(),
    };

    expect(battleStateKey(reorderedObject)).toBe(battleStateKey(first));
    expect(battleStateKey(reversedEffects)).not.toBe(battleStateKey(first));
  });

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])(
    "非法概率 %s 明确报错",
    (probability) => {
      expect(() =>
        advanceProbabilityStates(
          [initialWeightedState()],
          [syntheticEvent("invalid", probability)],
          createBearBattleContext(),
          1e-12,
        ),
      ).toThrow(InvalidProbabilityError);
    },
  );

  it("无随机场景时与原确定性 10 回合结果严格一致", () => {
    const deterministicInput: BattleDamageInput = {
      ...input,
      bodyHeroIds: ["hero.body.jiexi", "hero.body.shuyun"],
    };
    const deterministic = calculateBearBattleTotalDamage(deterministicInput);
    const expected = calculateExpectedBattleDamage(deterministicInput);

    expect(expected.expectedTotalDamage).toBe(deterministic.totalDamage);
    expect(expected.expectedRoundDamage.map((round) => round.expectedTotalDamage)).toEqual(
      deterministic.rounds.map((round) => round.totalDamage),
    );
    expect(expected.statistics.finalStateCount).toBe(1);
    expect(expected.statistics.maxStatesInAnyRound).toBe(1);
  });

  it("逐回合期望之和严格构成整场期望，所有回合概率和保持为 1", () => {
    const result = calculateExpectedBattleDamage(input, {
      scenario: oneTimeScenario(syntheticEvent("sum-check", 0.4, 0.5, 2)),
    });
    const roundSum = result.expectedRoundDamage.reduce(
      (sum, round) => sum + round.expectedTotalDamage,
      0,
    );

    expect(result.expectedTotalDamage).toBe(roundSum);
    expect(
      result.expectedRoundDamage.every(
        (round) => Math.abs(round.probabilityMass - 1) <= 1e-12,
      ),
    ).toBe(true);
  });

  it("精确状态分布给出2.5%至97.5%分位且不使用正态近似", () => {
    const base = calculateBattleDamage(input).finalDamage;
    const result = calculateExpectedBattleDamage(input, {
      scenario: oneTimeScenario(syntheticEvent("interval", 0.5, 1, 1)),
      includeDamageDistribution: true,
    });
    expect(result.damageDistribution?.lower95).toBeCloseTo(base * 10, 8);
    expect(result.damageDistribution?.upper95).toBeCloseTo(base * 11, 8);
    expect(result.damageDistribution?.method).toBe("exactStateDistribution");
    expect(result.damageDistribution?.points).toHaveLength(2);
  });

  it("无随机技能时95%区间退化为期望伤害单点", () => {
    const result = calculateExpectedBattleDamage(input, {
      includeDamageDistribution: true,
    });
    expect(result.damageDistribution).toMatchObject({
      lower95: result.expectedTotalDamage,
      upper95: result.expectedTotalDamage,
      method: "exactStateDistribution",
    });
  });

  it("两个测试专用独立事件的最大状态数为 4，并在效果到期后精确合并", () => {
    const scenario: ExactProbabilityScenario = {
      id: "scenario.two-independent",
      createRoundPlan: ({ round }) => ({
        beforeDamageEvents:
          round === 1
            ? [
                syntheticEvent("first", 0.5, 0.1, 1),
                syntheticEvent("second", 0.4, 0.2, 1),
              ]
            : [],
      }),
      transitionAfterRound: (state) => ({
        ...state,
        activeEffects: decrementEffectDurations(state.activeEffects),
      }),
    };
    const result = calculateExpectedBattleDamage(input, { scenario });

    expect(result.statistics.maxStatesInAnyRound).toBe(4);
    expect(result.statistics.finalStateCount).toBe(1);
    expect(result.expectedRoundDamage[0]?.statesBeforeMerge).toBe(4);
    expect(result.expectedRoundDamage[0]?.statesAfterMerge).toBe(1);
  });
});
