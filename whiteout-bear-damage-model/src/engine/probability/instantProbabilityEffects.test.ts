import { describe, expect, it } from "vitest";
import { calculateBattleDamage } from "../../app/calculateBattleDamage";
import type { BattleDamageInput } from "../../domain/battleDamage";
import type {
  AccumulatedBattleDamage,
  ExactProbabilityScenario,
  WeightedBattleState,
} from "../../domain/probability";
import type {
  EffectType,
  ProbabilityTriggerFrequency,
  ProbabilityTriggerPhase,
  Skill,
  SkillEffectTarget,
} from "../../domain/skill";
import {
  calculateBearBattleTotalDamage,
  createBearBattleContext,
} from "../../rulesets/bear/battle/calculateBearBattleTotalDamage";
import { createBattleState } from "../rounds/battleState";
import { advanceProbabilityStates } from "./advanceProbabilityStates";
import { calculateExpectedBattleDamage } from "./calculateExpectedBattleDamage";
import { createInstantProbabilityEvent } from "./createInstantProbabilityEvent";
import { InvalidProbabilityError } from "./errors";
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

function instantSkill(
  id: string,
  probability: number,
  type: EffectType,
  value: number,
  targetTroop: SkillEffectTarget = "all",
  triggerPhase: ProbabilityTriggerPhase = "beforeAttack",
  frequency: ProbabilityTriggerFrequency = "explicitSchedule",
): Skill {
  return {
    id: `skill.synthetic.${id}`,
    name: `Synthetic ${id}`,
    status: "supported",
    effects: [
      { type, value, targetTroop, status: "supported" },
    ],
    trigger: {
      type: "probability",
      probability,
      triggerPhase,
      frequency,
    },
  };
}

function scenarioOnRounds(
  id: string,
  rounds: readonly number[],
  skills: readonly Skill[],
): ExactProbabilityScenario {
  const events = skills.map((skill, index) =>
    createInstantProbabilityEvent(skill, `${id}.event.${index}`),
  );
  return {
    id,
    createRoundPlan: ({ round }) => ({
      beforeDamageEvents: rounds.includes(round) ? events : [],
    }),
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

describe("即时概率乘区", () => {
  it("50%概率damageIncrease +100%按两个伤害分支得到1.5倍期望", () => {
    const base = calculateBattleDamage(input).finalDamage;
    const result = calculateExpectedBattleDamage(input, {
      scenario: scenarioOnRounds(
        "scenario.half-double",
        [1],
        [instantSkill("half-double", 0.5, "damageIncrease", 1)],
      ),
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

  it("两个独立即时概率事件产生四个精确分支且概率和为1", () => {
    const events = [
      createInstantProbabilityEvent(
        instantSkill("p", 0.5, "damageIncrease", 0.2),
        "event.p",
      ),
      createInstantProbabilityEvent(
        instantSkill("q", 0.4, "vulnerable", 0.3),
        "event.q",
      ),
    ];
    const result = advanceProbabilityStates(
      [initialState()],
      events,
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

  it("两个同乘区即时概率效果都触发时按1+0.2+0.3加算", () => {
    const base = calculateBattleDamage(input).finalDamage;
    const result = calculateExpectedBattleDamage(input, {
      scenario: scenarioOnRounds(
        "scenario.same-zone",
        [1],
        [
          instantSkill("same-a", 1, "damageIncrease", 0.2),
          instantSkill("same-b", 1, "damageIncrease", 0.3),
        ],
      ),
    });

    expect(result.expectedRoundDamage[0]?.expectedTotalDamage).toBeCloseTo(
      base * 1.5,
      12,
    );
  });

  it("两个不同乘区即时概率效果都触发时按1.2×1.3乘算", () => {
    const base = calculateBattleDamage(input).finalDamage;
    const result = calculateExpectedBattleDamage(input, {
      scenario: scenarioOnRounds(
        "scenario.different-zones",
        [1],
        [
          instantSkill("different-a", 1, "damageIncrease", 0.2),
          instantSkill("different-b", 1, "vulnerable", 0.3),
        ],
      ),
    });

    expect(result.expectedRoundDamage[0]?.expectedTotalDamage).toBeCloseTo(
      base * 1.2 * 1.3,
      12,
    );
  });

  it("常驻车身与即时概率效果进入同一SkillResolver同乘区加算", () => {
    const withBody: BattleDamageInput = {
      ...input,
      bodyHeroIds: ["hero.body.suoniya"],
    };
    const noBodyBase = calculateBattleDamage(input).finalDamage;
    const result = calculateExpectedBattleDamage(withBody, {
      scenario: scenarioOnRounds(
        "scenario.always-plus-instant",
        [1],
        [instantSkill("instant-thirty", 1, "damageIncrease", 0.3)],
      ),
    });

    expect(result.expectedRoundDamage[0]?.expectedTotalDamage).toBeCloseTo(
      noBodyBase * 1.5,
      12,
    );
  });

  it("marksman-only即时效果只改变射手伤害", () => {
    const base = calculateBattleDamage(input);
    const result = calculateExpectedBattleDamage(input, {
      scenario: scenarioOnRounds(
        "scenario.marksman-only",
        [1],
        [instantSkill("marksman", 1, "marksmanDamage", 0.2, "marksman")],
      ),
    });
    const round = result.expectedRoundDamage[0];

    expect(round?.expectedShieldDamage).toBe(
      base.troopDamages.shield?.finalDamage,
    );
    expect(round?.expectedLancerDamage).toBe(
      base.troopDamages.lancer?.finalDamage,
    );
    expect(round?.expectedMarksmanDamage).toBeCloseTo(
      (base.troopDamages.marksman?.finalDamage ?? 0) * 1.2,
      12,
    );
  });

  it("即时效果在当前伤害结算后清空且不会进入ActiveEffect或下一回合", () => {
    const base = calculateBattleDamage(input).finalDamage;
    const result = calculateExpectedBattleDamage(input, {
      scenario: scenarioOnRounds(
        "scenario.no-leak",
        [1],
        [instantSkill("no-leak", 1, "damageIncrease", 1)],
      ),
    });

    expect(result.expectedRoundDamage[0]?.expectedTotalDamage).toBeCloseTo(
      base * 2,
      12,
    );
    expect(result.expectedRoundDamage[1]?.expectedTotalDamage).toBe(base);
    expect(result.finalStates).toHaveLength(1);
    expect(result.finalStates[0]?.state.activeEffects).toEqual([]);
    expect(result.finalStates[0]?.transientEffects).toEqual([]);
  });

  it("无概率场景时仍与确定性10回合伤害严格一致", () => {
    const deterministic = calculateBearBattleTotalDamage({
      ...input,
      bodyHeroIds: ["hero.body.jiexi", "hero.body.shuyun"],
    });
    const expected = calculateExpectedBattleDamage({
      ...input,
      bodyHeroIds: ["hero.body.jiexi", "hero.body.shuyun"],
    });

    expect(expected.expectedTotalDamage).toBe(deterministic.totalDamage);
    expect(expected.instantProbabilityEvents).toEqual([]);
  });

  it("报告概率、阶段、频率、效果和目标，不伪造单技能边际伤害", () => {
    const result = calculateExpectedBattleDamage(input, {
      scenario: scenarioOnRounds(
        "scenario.report",
        [1],
        [instantSkill("report", 0.25, "marksmanDamage", 0.4, "marksman")],
      ),
    });

    expect(result.instantProbabilityEvents).toEqual([
      {
        round: 1,
        eventId: "scenario.report.event.0",
        skillId: "skill.synthetic.report",
        skillName: "Synthetic report",
        triggerProbability: 0.25,
        triggerPhase: "beforeAttack",
        triggerFrequency: "explicitSchedule",
        effects: [
          { type: "marksmanDamage", value: 0.4, targetTroop: "marksman" },
        ],
      },
    ]);
    expect(result.expectedRoundDamage[0]?.instantProbabilityEvents).toHaveLength(1);
  });

  it("拒绝缺少时点/频率、带持续、extraDamage和伤害后即时事件", () => {
    const noPhase: Skill = {
      ...instantSkill("no-phase", 0.5, "attack", 0.2),
      trigger: {
        type: "probability",
        probability: 0.5,
        frequency: "explicitSchedule",
      },
    };
    const noFrequency: Skill = {
      ...instantSkill("no-frequency", 0.5, "attack", 0.2),
      trigger: {
        type: "probability",
        probability: 0.5,
        triggerPhase: "beforeAttack",
      },
    };
    const duration: Skill = {
      ...instantSkill("duration", 0.5, "attack", 0.2),
      trigger: {
        type: "probability",
        probability: 0.5,
        triggerPhase: "beforeAttack",
        frequency: "explicitSchedule",
        durationRounds: 1,
      },
    };
    const extraDamage = instantSkill(
      "extra-damage",
      0.5,
      "extraDamage",
      0.5,
    );
    const afterAttack = instantSkill(
      "after-attack",
      0.5,
      "attack",
      0.2,
      "all",
      "afterAttack",
    );

    for (const skill of [noPhase, noFrequency, duration, extraDamage, afterAttack]) {
      expect(() => createInstantProbabilityEvent(skill)).toThrow(
        InvalidProbabilityError,
      );
    }
  });
});
