import { describe, expect, it } from "vitest";
import { calculateBattleDamage } from "../../app/calculateBattleDamage";
import type { BattleDamageInput } from "../../domain/battleDamage";
import type {
  AccumulatedBattleDamage,
  WeightedBattleState,
} from "../../domain/probability";
import type {
  EffectActivationTiming,
  ProbabilityTriggerPhase,
  Skill,
} from "../../domain/skill";
import { createBearBattleContext } from "../../rulesets/bear/battle/calculateBearBattleTotalDamage";
import { createActiveEffect } from "../rounds/activeEffects";
import { createBattleState } from "../rounds/battleState";
import {
  applyDecayingEffectApplication,
  calculateDecayedApplicationValue,
} from "../rounds/decayEffects";
import { calculateExpectedBattleDamage } from "./calculateExpectedBattleDamage";
import { InvalidProbabilityError } from "./errors";
import { mergeWeightedBattleStates } from "./mergeWeightedBattleStates";
import {
  createPeriodicStackingScenario,
  isEveryNRoundsTriggerRound,
} from "./periodicStackingEffects";
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

function stackingSkill(options: {
  readonly id: string;
  readonly interval?: number;
  readonly firstTriggerRound?: number;
  readonly triggerPhase?: ProbabilityTriggerPhase;
  readonly probability?: number;
  readonly maxStacks: number;
  readonly valuePerStack: number;
  readonly activationTiming?: EffectActivationTiming;
  readonly maxApplications?: number;
}): Skill {
  return {
    id: `skill.synthetic.${options.id}`,
    name: `Synthetic ${options.id}`,
    status: "supported",
    trigger: {
      type: "everyNRounds",
      interval: options.interval ?? 1,
      ...(options.firstTriggerRound === undefined
        ? {}
        : { firstTriggerRound: options.firstTriggerRound }),
      ...(options.triggerPhase === undefined
        ? {}
        : { triggerPhase: options.triggerPhase }),
      ...(options.probability === undefined
        ? {}
        : { probability: options.probability }),
    },
    lifecycle: {
      refreshMode: "stack",
      maxStacks: options.maxStacks,
      atMaxStacks: "keep",
      activationTiming: options.activationTiming ?? "immediate",
      ...(options.maxApplications === undefined
        ? {}
        : { maxApplications: options.maxApplications }),
    },
    effects: [
      {
        type: "damageIncrease",
        value: options.valuePerStack,
        valuePerStack: options.valuePerStack,
        targetTroop: "all",
        status: "supported",
      },
    ],
  };
}

function weightedState(
  activeEffect: ReturnType<typeof createActiveEffect>,
  probability: number,
): WeightedBattleState {
  return {
    probability,
    state: createBattleState(createBearBattleContext(), [activeEffect]),
    accumulatedDamage: zeroDamage,
    transientEffects: [],
  };
}

describe("周期触发与叠层", () => {
  it("firstTriggerRound=2且interval=3时只命中2、5、8回合", () => {
    const trigger = {
      type: "everyNRounds" as const,
      interval: 3,
      firstTriggerRound: 2,
      triggerPhase: "roundStart" as const,
    };
    const rounds = Array.from({ length: 10 }, (_, index) => index + 1).filter(
      (round) => isEveryNRoundsTriggerRound(trigger, round),
    );

    expect(rounds).toEqual([2, 5, 8]);
  });

  it("确定性周期叠层在2、4、6、8、10触发并严格封顶4层", () => {
    const base = calculateBattleDamage(input).finalDamage;
    const skill = stackingSkill({
      id: "deterministic",
      interval: 2,
      firstTriggerRound: 2,
      triggerPhase: "beforeAttack",
      maxStacks: 4,
      valuePerStack: 0.1,
    });
    const result = calculateExpectedBattleDamage(input, {
      scenario: createPeriodicStackingScenario(skill),
    });
    const multipliers = result.expectedRoundDamage.map(
      (round) => round.expectedTotalDamage / base,
    );

    expect(multipliers).toEqual([
      1, 1.1, 1.1, 1.2, 1.2, 1.3, 1.3, 1.4, 1.4, 1.4,
    ]);
    expect(result.finalStates[0]?.state.activeEffects[0]).toMatchObject({
      stackCount: 4,
      maxStacks: 4,
      applicationCount: 4,
      valuePerStack: 0.1,
    });
  });

  it("每回合叠层按valuePerStack×stackCount进入原乘区且满层后不增长", () => {
    const base = calculateBattleDamage(input).finalDamage;
    const skill = stackingSkill({
      id: "linear",
      firstTriggerRound: 1,
      triggerPhase: "roundStart",
      maxStacks: 3,
      valuePerStack: 0.2,
    });
    const result = calculateExpectedBattleDamage(input, {
      scenario: createPeriodicStackingScenario(skill),
    });

    expect(result.expectedRoundDamage[0]?.expectedTotalDamage).toBeCloseTo(base * 1.2, 10);
    expect(result.expectedRoundDamage[1]?.expectedTotalDamage).toBeCloseTo(base * 1.4, 10);
    expect(result.expectedRoundDamage[2]?.expectedTotalDamage).toBeCloseTo(base * 1.6, 10);
    expect(result.expectedRoundDamage[9]?.expectedTotalDamage).toBeCloseTo(base * 1.6, 10);
    expect(result.finalStates[0]?.state.activeEffects[0]).toMatchObject({
      stackCount: 3,
      applicationCount: 3,
    });
  });

  it("probability+everyNRounds只在周期回合精确分叉并保留不同stack状态", () => {
    const base = calculateBattleDamage(input).finalDamage;
    const skill = stackingSkill({
      id: "probability-stack",
      firstTriggerRound: 1,
      triggerPhase: "beforeAttack",
      probability: 0.5,
      maxStacks: 2,
      valuePerStack: 0.2,
    });
    const result = calculateExpectedBattleDamage(input, {
      scenario: createPeriodicStackingScenario(skill),
    });

    expect(result.expectedRoundDamage[0]?.expectedTotalDamage).toBeCloseTo(base * 1.1, 10);
    expect(result.expectedRoundDamage[1]?.expectedTotalDamage).toBeCloseTo(base * 1.2, 10);
    expect(result.expectedRoundDamage[2]?.expectedTotalDamage).toBeCloseTo(base * 1.275, 10);
    expect(result.statistics.maxStatesInAnyRound).toBeGreaterThanOrEqual(3);
    expect(result.statistics.finalStateCount).toBe(3);
    expect(probabilityMass(result.finalStates)).toBeCloseTo(1, 12);
    expect(
      result.finalStates.map((state) => state.state.activeEffects[0]?.stackCount ?? 0),
    ).toEqual([0, 1, 2]);
  });

  it("nextRound配置在周期回合伤害后加层，从下一回合开始生效", () => {
    const base = calculateBattleDamage(input).finalDamage;
    const skill = stackingSkill({
      id: "next-round-stack",
      interval: 3,
      firstTriggerRound: 2,
      triggerPhase: "afterAttack",
      maxStacks: 3,
      valuePerStack: 0.1,
      activationTiming: "nextRound",
    });
    const result = calculateExpectedBattleDamage(input, {
      scenario: createPeriodicStackingScenario(skill),
    });

    expect(result.expectedRoundDamage[1]?.expectedTotalDamage).toBe(base);
    expect(result.expectedRoundDamage[2]?.expectedTotalDamage).toBeCloseTo(base * 1.1, 10);
    expect(result.expectedRoundDamage[4]?.expectedTotalDamage).toBeCloseTo(base * 1.1, 10);
    expect(result.expectedRoundDamage[5]?.expectedTotalDamage).toBeCloseTo(base * 1.2, 10);
    expect(result.expectedRoundDamage[8]?.expectedTotalDamage).toBeCloseTo(base * 1.3, 10);
  });

  it("maxApplications可在maxStacks之前停止新增应用", () => {
    const skill = stackingSkill({
      id: "application-cap",
      firstTriggerRound: 1,
      triggerPhase: "roundStart",
      maxStacks: 5,
      maxApplications: 2,
      valuePerStack: 0.1,
    });
    const result = calculateExpectedBattleDamage(input, {
      scenario: createPeriodicStackingScenario(skill),
    });

    expect(result.finalStates[0]?.state.activeEffects[0]).toMatchObject({
      stackCount: 2,
      applicationCount: 2,
      maxApplications: 2,
    });
  });

  it("状态合并区分stackCount；无应用上限/衰减时忽略仅供报告的applicationCount", () => {
    const base = createActiveEffect({
      id: "stack-key",
      identity: { sourceId: "source", sourceSkillId: "skill", effectId: "effect" },
      sourceSkillId: "skill",
      effect: { type: "damageIncrease", value: 0.2, valuePerStack: 0.2 },
      refreshMode: "stack",
      maxStacks: 4,
      atMaxStacks: "keep",
      valuePerStack: 0.2,
      stackCount: 2,
      applicationCount: 2,
    });
    const states = [
      weightedState(base, 0.3),
      weightedState({ ...base, stackCount: 3, applicationCount: 3 }, 0.3),
      weightedState({ ...base, applicationCount: 3 }, 0.4),
    ];

    expect(mergeWeightedBattleStates(states)).toHaveLength(2);
    expect(
      mergeWeightedBattleStates([weightedState(base, 0.4), weightedState(base, 0.6)]),
    ).toHaveLength(1);
  });

  it("缺少firstTriggerRound/phase或把duration与stack强行混算会报错", () => {
    const noFirst = stackingSkill({
      id: "no-first",
      triggerPhase: "roundStart",
      maxStacks: 3,
      valuePerStack: 0.1,
    });
    const noPhase = stackingSkill({
      id: "no-phase",
      firstTriggerRound: 1,
      maxStacks: 3,
      valuePerStack: 0.1,
    });
    const withDuration: Skill = {
      ...stackingSkill({
        id: "with-duration",
        firstTriggerRound: 1,
        triggerPhase: "roundStart",
        maxStacks: 3,
        valuePerStack: 0.1,
      }),
      lifecycle: {
        refreshMode: "stack",
        maxStacks: 3,
        atMaxStacks: "keep",
        activationTiming: "immediate",
        durationRounds: 2,
      },
    };

    for (const skill of [noFirst, noPhase, withDuration]) {
      expect(() => createPeriodicStackingScenario(skill)).toThrow(
        InvalidProbabilityError,
      );
    }
  });
});

describe("衰减与应用次数", () => {
  it("前四次衰减值严格为x、x×0.85、x×0.85²、x×0.85³", () => {
    expect(
      [1, 2, 3, 4].map((application) =>
        calculateDecayedApplicationValue(1, 0.85, application),
      ),
    ).toEqual([1, 0.85, 0.85 ** 2, 0.85 ** 3]);
  });

  it("maxApplications=3后不再应用且不改变stackCount或历史状态", () => {
    let active = createActiveEffect({
      id: "decay",
      sourceSkillId: "skill.decay",
      effect: { type: "damageIncrease", value: 1 },
      decayRate: 0.85,
      maxApplications: 3,
    });
    const values: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      const result = applyDecayingEffectApplication(active);
      if (result.appliedValue !== null) values.push(result.appliedValue);
      active = result.activeEffect;
      if (index === 3) expect(result.applied).toBe(false);
    }

    expect(values).toEqual([1, 0.85, 0.85 ** 2]);
    expect(active.applicationCount).toBe(3);
    expect(active.stackCount).toBe(1);
    expect(active.effect.value).toBe(1);
  });
});
