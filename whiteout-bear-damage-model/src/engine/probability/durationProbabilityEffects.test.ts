import { describe, expect, it } from "vitest";
import { calculateBattleDamage } from "../../app/calculateBattleDamage";
import type { BattleDamageInput } from "../../domain/battleDamage";
import type {
  AccumulatedBattleDamage,
  ExactProbabilityScenario,
  StatefulBernoulliTransition,
  WeightedBattleState,
} from "../../domain/probability";
import type {
  EffectActivationTiming,
  EffectRefreshMode,
  EffectType,
  Skill,
  SkillEffectTarget,
} from "../../domain/skill";
import { createBearBattleContext } from "../../rulesets/bear/battle/calculateBearBattleTotalDamage";
import { createActiveEffect } from "../rounds/activeEffects";
import { advanceBattleState, createBattleState } from "../rounds/battleState";
import { advanceProbabilityStates } from "./advanceProbabilityStates";
import { calculateExpectedBattleDamage } from "./calculateExpectedBattleDamage";
import {
  advanceDurationEffectsAfterRound,
  createDurationProbabilityEvent,
} from "./createDurationProbabilityEvent";
import { calculateDamageForProbabilityState } from "./damage";
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

function durationSkill(options: {
  readonly id: string;
  readonly probability?: number;
  readonly type?: EffectType;
  readonly value: number;
  readonly targetTroop?: SkillEffectTarget;
  readonly durationRounds: number;
  readonly activationTiming: EffectActivationTiming;
  readonly refreshMode: EffectRefreshMode;
}): Skill {
  return {
    id: `skill.synthetic.${options.id}`,
    name: `Synthetic ${options.id}`,
    status: "supported",
    trigger: {
      type: "probability",
      probability: options.probability ?? 1,
      triggerPhase: "beforeAttack",
      frequency: "explicitSchedule",
      durationRounds: options.durationRounds,
    },
    lifecycle: {
      durationRounds: options.durationRounds,
      activationTiming: options.activationTiming,
      refreshMode: options.refreshMode,
    },
    effects: [
      {
        type: options.type ?? "damageIncrease",
        value: options.value,
        targetTroop: options.targetTroop ?? "all",
        status: "supported",
      },
    ],
  };
}

function scenario(
  id: string,
  eventsByRound: Readonly<Record<number, readonly StatefulBernoulliTransition[]>>,
): ExactProbabilityScenario {
  return {
    id,
    createRoundPlan: ({ round }) => ({
      beforeDamageEvents: eventsByRound[round] ?? [],
    }),
    transitionAfterRound: advanceDurationEffectsAfterRound,
  };
}

function initialState(): WeightedBattleState {
  return {
    probability: 1,
    state: createBattleState(createBearBattleContext()),
    accumulatedDamage: zeroDamage,
    transientEffects: [],
  };
}

describe("持续型概率技能", () => {
  it("immediate的确定性duration=2从创建回合起恰好生效两回合", () => {
    const base = calculateBattleDamage(input).finalDamage;
    const event = createDurationProbabilityEvent(
      durationSkill({
        id: "immediate-two",
        value: 0.5,
        durationRounds: 2,
        activationTiming: "immediate",
        refreshMode: "refresh",
      }),
    );
    const result = calculateExpectedBattleDamage(input, {
      scenario: scenario("scenario.immediate-two", { 1: [event] }),
    });

    expect(result.expectedRoundDamage[0]?.expectedTotalDamage).toBeCloseTo(base * 1.5, 12);
    expect(result.expectedRoundDamage[1]?.expectedTotalDamage).toBeCloseTo(base * 1.5, 12);
    expect(result.expectedRoundDamage[2]?.expectedTotalDamage).toBe(base);
    expect(result.finalStates[0]?.state.activeEffects).toEqual([]);
  });

  it("nextRound的duration=2不影响创建回合，只影响后续两个回合", () => {
    const base = calculateBattleDamage(input).finalDamage;
    const event = createDurationProbabilityEvent(
      durationSkill({
        id: "next-two",
        value: 0.5,
        durationRounds: 2,
        activationTiming: "nextRound",
        refreshMode: "refresh",
      }),
    );
    const result = calculateExpectedBattleDamage(input, {
      scenario: scenario("scenario.next-two", { 1: [event] }),
    });

    expect(result.expectedRoundDamage[0]?.expectedTotalDamage).toBe(base);
    expect(result.expectedRoundDamage[1]?.expectedTotalDamage).toBeCloseTo(base * 1.5, 12);
    expect(result.expectedRoundDamage[2]?.expectedTotalDamage).toBeCloseTo(base * 1.5, 12);
    expect(result.expectedRoundDamage[3]?.expectedTotalDamage).toBe(base);
  });

  it.each([1, 2, 3])(
    "immediate duration=%i严格从触发回合起生效指定回合数",
    (durationRounds) => {
      const base = calculateBattleDamage(input).finalDamage;
      const event = createDurationProbabilityEvent(
        durationSkill({
          id: `audit-immediate-${durationRounds}`,
          value: 0.25,
          durationRounds,
          activationTiming: "immediate",
          refreshMode: "refresh",
        }),
      );
      const result = calculateExpectedBattleDamage(input, {
        scenario: scenario(`scenario.audit-immediate-${durationRounds}`, { 1: [event] }),
      });

      for (let index = 0; index < 10; index += 1) {
        expect(result.expectedRoundDamage[index]?.expectedTotalDamage).toBeCloseTo(
          index < durationRounds ? base * 1.25 : base,
          10,
        );
      }
    },
  );

  it.each([1, 2, 3])(
    "nextRound duration=%i严格从下一回合起生效指定回合数",
    (durationRounds) => {
      const base = calculateBattleDamage(input).finalDamage;
      const event = createDurationProbabilityEvent(
        durationSkill({
          id: `audit-next-${durationRounds}`,
          value: 0.25,
          durationRounds,
          activationTiming: "nextRound",
          refreshMode: "refresh",
        }),
      );
      const result = calculateExpectedBattleDamage(input, {
        scenario: scenario(`scenario.audit-next-${durationRounds}`, { 1: [event] }),
      });

      for (let index = 0; index < 10; index += 1) {
        const active = index >= 1 && index <= durationRounds;
        expect(result.expectedRoundDamage[index]?.expectedTotalDamage).toBeCloseTo(
          active ? base * 1.25 : base,
          10,
        );
      }
    },
  );

  it("50%概率duration=2通过ActiveEffect精确传播并保持概率和为1", () => {
    const base = calculateBattleDamage(input).finalDamage;
    const event = createDurationProbabilityEvent(
      durationSkill({
        id: "half-two",
        probability: 0.5,
        value: 0.4,
        durationRounds: 2,
        activationTiming: "immediate",
        refreshMode: "refresh",
      }),
    );
    const result = calculateExpectedBattleDamage(input, {
      scenario: scenario("scenario.half-two", { 1: [event] }),
    });

    expect(result.expectedRoundDamage[0]?.expectedTotalDamage).toBeCloseTo(base * 1.2, 10);
    expect(result.expectedRoundDamage[1]?.expectedTotalDamage).toBeCloseTo(base * 1.2, 10);
    expect(result.expectedRoundDamage[2]?.expectedTotalDamage).toBe(base);
    expect(Math.abs(result.expectedTotalDamage - base * 10.4)).toBeLessThan(base * 1e-12);
    expect(result.statistics.maxStatesInAnyRound).toBe(2);
    expect(result.statistics.finalStateCount).toBe(1);
    expect(probabilityMass(result.finalStates)).toBeCloseTo(1, 12);
  });

  it("refresh只刷新同一identity的时长，不增加层数或效果数值", () => {
    const skill = durationSkill({
      id: "refresh",
      value: 0.5,
      durationRounds: 2,
      activationTiming: "immediate",
      refreshMode: "refresh",
    });
    const firstEvent = createDurationProbabilityEvent(skill, {
      sourceId: "source.refresh",
      eventId: "event.refresh.round1",
    });
    const secondEvent = createDurationProbabilityEvent(skill, {
      sourceId: "source.refresh",
      eventId: "event.refresh.round2",
    });
    const first = advanceProbabilityStates(
      [initialState()],
      [firstEvent],
      createBearBattleContext(),
      1e-12,
    ).states[0]!;
    const round2State = advanceBattleState(
      advanceDurationEffectsAfterRound(first.state),
    );
    const refreshed = advanceProbabilityStates(
      [{ ...first, state: round2State }],
      [secondEvent],
      createBearBattleContext(),
      1e-12,
    ).states[0]!.state.activeEffects;

    expect(refreshed).toHaveLength(1);
    expect(refreshed[0]).toMatchObject({
      remainingRounds: 2,
      stackCount: 1,
      applicationCount: 2,
      effect: { value: 0.5 },
      appliedRound: 1,
      lastAppliedRound: 2,
    });
  });

  it("replace以新数值和新duration完整覆盖同一identity的旧效果", () => {
    const oldSkill = durationSkill({
      id: "replace",
      value: 0.2,
      durationRounds: 3,
      activationTiming: "immediate",
      refreshMode: "replace",
    });
    const newSkill = durationSkill({
      id: "replace",
      value: 0.3,
      durationRounds: 2,
      activationTiming: "immediate",
      refreshMode: "replace",
    });
    const result = calculateExpectedBattleDamage(input, {
      scenario: scenario("scenario.replace", {
        1: [createDurationProbabilityEvent(oldSkill, { eventId: "replace.old" })],
        2: [createDurationProbabilityEvent(newSkill, { eventId: "replace.new" })],
      }),
    });
    const base = calculateBattleDamage(input).finalDamage;

    expect(result.expectedRoundDamage[0]?.expectedTotalDamage).toBeCloseTo(base * 1.2, 10);
    expect(result.expectedRoundDamage[1]?.expectedTotalDamage).toBeCloseTo(base * 1.3, 10);
    expect(result.expectedRoundDamage[2]?.expectedTotalDamage).toBeCloseTo(base * 1.3, 10);
    expect(result.expectedRoundDamage[3]?.expectedTotalDamage).toBe(base);
  });

  it("不同来源的同乘区效果共存，刷新A不会改变B", () => {
    const skillA = durationSkill({
      id: "source-a",
      value: 0.2,
      durationRounds: 3,
      activationTiming: "immediate",
      refreshMode: "refresh",
    });
    const skillB = durationSkill({
      id: "source-b",
      value: 0.3,
      durationRounds: 3,
      activationTiming: "immediate",
      refreshMode: "refresh",
    });
    const context = createBearBattleContext();
    const first = advanceProbabilityStates(
      [initialState()],
      [
        createDurationProbabilityEvent(skillA, { sourceId: "hero-slot-a", eventId: "a.r1" }),
        createDurationProbabilityEvent(skillB, { sourceId: "hero-slot-b", eventId: "b.r1" }),
      ],
      context,
      1e-12,
    ).states[0]!;
    const round2State = advanceBattleState(advanceDurationEffectsAfterRound(first.state));
    const refreshed = advanceProbabilityStates(
      [{ ...first, state: round2State }],
      [createDurationProbabilityEvent(skillA, { sourceId: "hero-slot-a", eventId: "a.r2" })],
      context,
      1e-12,
    ).states[0]!.state;
    const effectsBySource = Object.fromEntries(
      refreshed.activeEffects.map((active) => [active.identity.sourceId, active]),
    );
    const damage = calculateDamageForProbabilityState(input, refreshed.activeEffects, [], 2);
    const base = calculateBattleDamage(input).finalDamage;

    expect(effectsBySource["hero-slot-a"]?.remainingRounds).toBe(3);
    expect(effectsBySource["hero-slot-a"]?.applicationCount).toBe(2);
    expect(effectsBySource["hero-slot-b"]?.remainingRounds).toBe(2);
    expect(effectsBySource["hero-slot-b"]?.applicationCount).toBe(1);
    expect(damage.finalDamage).toBeCloseTo(base * 1.5, 12);
  });

  it("持续型marksman效果在有效回合只改变射手伤害", () => {
    const base = calculateBattleDamage(input);
    const event = createDurationProbabilityEvent(
      durationSkill({
        id: "marksman",
        value: 0.3,
        type: "marksmanDamage",
        targetTroop: "marksman",
        durationRounds: 2,
        activationTiming: "immediate",
        refreshMode: "refresh",
      }),
    );
    const result = calculateExpectedBattleDamage(input, {
      scenario: scenario("scenario.duration-marksman", { 1: [event] }),
    });
    const round = result.expectedRoundDamage[0];

    expect(round?.expectedShieldDamage).toBe(base.troopDamages.shield?.finalDamage);
    expect(round?.expectedLancerDamage).toBe(base.troopDamages.lancer?.finalDamage);
    expect(round?.expectedMarksmanDamage).toBeCloseTo(
      (base.troopDamages.marksman?.finalDamage ?? 0) * 1.3,
      12,
    );
  });

  it("相同identity和值及remainingRounds可以合并，不同时长绝不合并", () => {
    const active = createActiveEffect({
      id: "duration-key",
      identity: {
        sourceId: "source",
        sourceSkillId: "skill",
        effectId: "effect",
      },
      sourceSkillId: "skill",
      effect: { type: "damageIncrease", value: 0.2 },
      durationRounds: 2,
      remainingRounds: 2,
      activationTiming: "immediate",
      appliedRound: 1,
      lastAppliedRound: 1,
      activeFromRound: 1,
      refreshMode: "refresh",
    });
    const state = createBattleState(createBearBattleContext(), [active]);
    const same: WeightedBattleState[] = [
      { probability: 0.25, state, accumulatedDamage: { ...zeroDamage, totalDamage: 10 }, transientEffects: [] },
      { probability: 0.75, state, accumulatedDamage: { ...zeroDamage, totalDamage: 30 }, transientEffects: [] },
    ];
    const expectedBefore = same.reduce(
      (sum, weighted) => sum + weighted.probability * weighted.accumulatedDamage.totalDamage,
      0,
    );
    const merged = mergeWeightedBattleStates(same);
    const differentDuration = mergeWeightedBattleStates([
      same[0]!,
      {
        ...same[1]!,
        state: {
          ...state,
          activeEffects: [{ ...active, remainingRounds: 1 }],
        },
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.accumulatedDamage.totalDamage).toBe(25);
    expect(
      merged.reduce(
        (sum, weighted) => sum + weighted.probability * weighted.accumulatedDamage.totalDamage,
        0,
      ),
    ).toBe(expectedBefore);
    expect(differentDuration).toHaveLength(2);
  });

  it("明确拒绝stack、extraDamage和缺少activationTiming的持续技能", () => {
    const stack = durationSkill({
      id: "stack",
      value: 0.2,
      durationRounds: 2,
      activationTiming: "immediate",
      refreshMode: "stack",
    });
    const extra = durationSkill({
      id: "extra",
      type: "extraDamage",
      value: 0.5,
      durationRounds: 2,
      activationTiming: "immediate",
      refreshMode: "refresh",
    });
    const missingTiming: Skill = {
      ...durationSkill({
        id: "missing-timing",
        value: 0.2,
        durationRounds: 2,
        activationTiming: "immediate",
        refreshMode: "refresh",
      }),
      lifecycle: { durationRounds: 2, refreshMode: "refresh" },
    };

    for (const skill of [stack, extra, missingTiming]) {
      expect(() => createDurationProbabilityEvent(skill)).toThrow(
        InvalidProbabilityError,
      );
    }
  });
});
