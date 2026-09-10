import { describe, expect, it } from "vitest";
import {
  calculateBattleDamage,
  calculateBattleDamageWithAdditionalSkills,
} from "../../app/calculateBattleDamage";
import type { BattleDamageInput } from "../../domain/battleDamage";
import type { ExactProbabilityScenario } from "../../domain/probability";
import type { Skill } from "../../domain/skill";
import { aggregateMultipliers } from "../skills/aggregateMultipliers";
import { advanceDurationEffectsAfterRound } from "../probability/createDurationProbabilityEvent";
import { createDurationProbabilityEvent } from "../probability/createDurationProbabilityEvent";
import { calculateExpectedBattleDamage } from "../probability/calculateExpectedBattleDamage";
import {
  createExtraDamageProbabilityEvent,
  createPeriodicExtraDamageScenario,
} from "../probability/extraDamageEvents";
import { InvalidProbabilityError } from "../probability/errors";
import { InvalidDamageComponentError } from "./errors";
import { resolveDamageComponent } from "./resolveDamageComponent";

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
  damageChannel: "normalAttack",
};

function extraEffect(value = 0.5): Skill["effects"][number] {
  return {
    type: "extraDamage",
    value,
    basis: "normalAttackDamage",
    damageCategory: "extra",
    applicableMultiplierZones: [],
    targetTroop: "all",
    status: "supported",
  };
}

function alwaysExtra(value = 0.5): Skill {
  return {
    id: "skill.synthetic.always-extra",
    name: "Synthetic always extra",
    status: "supported",
    trigger: { type: "always" },
    effects: [extraEffect(value)],
  };
}

function probabilityExtra(probability: number): Skill {
  return {
    id: "skill.synthetic.probability-extra",
    name: "Synthetic probability extra",
    status: "supported",
    trigger: {
      type: "probability",
      probability,
      triggerPhase: "afterAttack",
      frequency: "oncePerRound",
    },
    effects: [extraEffect()],
  };
}

describe("extraDamage伤害组件", () => {
  it("100%触发的50%额外伤害得到1.5倍总伤害并独立输出breakdown", () => {
    const baseline = calculateBattleDamage(input);
    const result = calculateBattleDamageWithAdditionalSkills(input, [alwaysExtra()]);

    expect(result.damageBreakdown.normalDamage).toBeCloseTo(
      baseline.finalDamage,
      12,
    );
    expect(result.damageBreakdown.extraDamage).toBeCloseTo(
      baseline.finalDamage * 0.5,
      12,
    );
    expect(result.finalDamage).toBeCloseTo(baseline.finalDamage * 1.5, 12);
    expect(result.damageBreakdown.totalDamage).toBe(result.finalDamage);
    for (const troopType of ["shield", "lancer", "marksman"] as const) {
      const troop = result.troopDamages[troopType]!;
      expect(troop.damageBreakdown.totalDamage).toBe(troop.finalDamage);
      expect(troop.extraDamageComponents).toHaveLength(1);
    }
  });

  it("p=0.3的50%额外伤害通过精确分支得到每回合1.15倍期望", () => {
    const baseline = calculateBattleDamage(input).finalDamage;
    const event = createExtraDamageProbabilityEvent(probabilityExtra(0.3));
    const scenario: ExactProbabilityScenario = {
      id: "scenario.synthetic.probability-extra",
      createRoundPlan: () => ({ beforeDamageEvents: [event] }),
    };
    const result = calculateExpectedBattleDamage(input, { scenario });

    for (const round of result.expectedRoundDamage) {
      expect(round.expectedNormalDamage).toBeCloseTo(baseline, 10);
      expect(round.expectedExtraDamage).toBeCloseTo(baseline * 0.15, 10);
      expect(round.expectedTotalDamage).toBeCloseTo(baseline * 1.15, 10);
    }
    expect(result.expectedTotalDamage).toBeCloseTo(baseline * 11.5, 9);
    expect(result.statistics.maxStatesInAnyRound).toBeGreaterThanOrEqual(2);
    expect(result.statistics.finalStateCount).toBe(1);
  });

  it("周期extraDamage复用everyNRounds并且仅在2、5、8回合出现", () => {
    const baseline = calculateBattleDamage(input).finalDamage;
    const skill: Skill = {
      id: "skill.synthetic.periodic-extra",
      name: "Synthetic periodic extra",
      status: "supported",
      trigger: {
        type: "everyNRounds",
        interval: 3,
        firstTriggerRound: 2,
        triggerPhase: "afterAttack",
      },
      effects: [extraEffect(1)],
    };
    const result = calculateExpectedBattleDamage(input, {
      scenario: createPeriodicExtraDamageScenario(skill),
    });

    expect(
      result.expectedRoundDamage
        .filter((round) => round.expectedExtraDamage > 0)
        .map((round) => round.round),
    ).toEqual([2, 5, 8]);
    expect(result.expectedTotalDamage).toBeCloseTo(baseline * 13, 9);
  });

  it("duration ActiveEffect可以在生效期间持续产生extraDamage", () => {
    const baseline = calculateBattleDamage(input).finalDamage;
    const skill: Skill = {
      id: "skill.synthetic.duration-extra",
      name: "Synthetic duration extra",
      status: "supported",
      trigger: {
        type: "probability",
        probability: 1,
        triggerPhase: "beforeAttack",
        frequency: "oncePerBattle",
        durationRounds: 2,
      },
      lifecycle: {
        durationRounds: 2,
        activationTiming: "immediate",
        refreshMode: "refresh",
      },
      effects: [extraEffect()],
    };
    const event = createDurationProbabilityEvent(skill);
    const scenario: ExactProbabilityScenario = {
      id: "scenario.synthetic.duration-extra",
      createRoundPlan: ({ round }) =>
        round === 1 ? { beforeDamageEvents: [event] } : {},
      transitionAfterRound: advanceDurationEffectsAfterRound,
    };
    const result = calculateExpectedBattleDamage(input, { scenario });

    expect(result.expectedRoundDamage.map((round) => round.expectedExtraDamage)).toEqual([
      expect.closeTo(baseline * 0.5, 8),
      expect.closeTo(baseline * 0.5, 8),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ]);
  });

  it("damageIncrease不会与extraDamage合并，适用乘区由配置控制", () => {
    const baseline = calculateBattleDamage(input).finalDamage;
    const damageIncrease: Skill = {
      id: "skill.synthetic.damage-increase",
      name: "Synthetic damage increase",
      status: "supported",
      trigger: { type: "always" },
      effects: [
        {
          type: "damageIncrease",
          value: 0.2,
          targetTroop: "all",
          status: "supported",
        },
      ],
    };
    const excluded = calculateBattleDamageWithAdditionalSkills(input, [
      damageIncrease,
      alwaysExtra(),
    ]);
    const includedExtra: Skill = {
      ...alwaysExtra(),
      id: "skill.synthetic.always-extra-with-zone",
      effects: [
        {
          ...extraEffect(),
          applicableMultiplierZones: ["damageIncrease"],
        },
      ],
    };
    const included = calculateBattleDamageWithAdditionalSkills(input, [
      damageIncrease,
      includedExtra,
    ]);

    expect(excluded.damageBreakdown.normalDamage).toBeCloseTo(baseline * 1.2, 10);
    expect(excluded.damageBreakdown.extraDamage).toBeCloseTo(baseline * 0.5, 10);
    expect(excluded.finalDamage).toBeCloseTo(baseline * 1.7, 9);
    expect(included.damageBreakdown.extraDamage).toBeCloseTo(baseline * 0.6, 10);
    expect(included.finalDamage).toBeCloseTo(baseline * 1.8, 10);
  });

  it("normalAttackDamage与skillDamage分别作用于各自组件", () => {
    const multipliers = aggregateMultipliers(
      [
        {
          type: "normalAttackDamage",
          value: 0.3,
          targetTroop: "all",
          skillId: "synthetic.normal",
          skillName: "Synthetic normal",
          effectIndex: 0,
        },
        {
          type: "skillDamage",
          value: 0.2,
          targetTroop: "all",
          skillId: "synthetic.skill",
          skillName: "Synthetic skill",
          effectIndex: 0,
        },
      ],
      { troopType: "shield", damageChannel: "base" },
    ).multiplierByEffectType;
    const normal = resolveDamageComponent(
      {
        id: "component.normal",
        kind: "normal",
        damageCategory: "normalAttack",
        basis: "preMultiplierDamage",
        basisDamage: 80,
        coefficient: 1,
        applicableMultiplierZones: ["normalAttackDamage"],
      },
      multipliers,
    );
    const skill = resolveDamageComponent(
      {
        id: "component.skill",
        kind: "extra",
        damageCategory: "skill",
        basis: "preMultiplierDamage",
        basisDamage: 20,
        coefficient: 1,
        applicableMultiplierZones: ["skillDamage"],
      },
      multipliers,
    );

    expect(normal.damage).toBeCloseTo(104, 12);
    expect(skill.damage).toBeCloseTo(24, 12);
    expect(normal.damage + skill.damage).toBeCloseTo(128, 12);
  });

  it("同一概率事件能够让extraDamage与vulnerable独立结算", () => {
    const baseline = calculateBattleDamage(input).finalDamage;
    const skill: Skill = {
      id: "skill.synthetic.extra-vulnerable",
      name: "Synthetic extra and vulnerable",
      status: "supported",
      trigger: {
        type: "probability",
        probability: 1,
        triggerPhase: "beforeAttack",
        frequency: "oncePerRound",
      },
      effects: [
        {
          ...extraEffect(),
          applicableMultiplierZones: ["vulnerable"],
        },
        {
          type: "vulnerable",
          value: 0.25,
          targetTroop: "all",
          status: "supported",
        },
      ],
    };
    const event = createExtraDamageProbabilityEvent(skill);
    const result = calculateExpectedBattleDamage(input, {
      scenario: {
        id: "scenario.synthetic.extra-vulnerable",
        createRoundPlan: () => ({ beforeDamageEvents: [event] }),
      },
    });

    expect(result.expectedRoundDamage[0]?.expectedNormalDamage).toBeCloseTo(
      baseline * 1.25,
      10,
    );
    expect(result.expectedRoundDamage[0]?.expectedExtraDamage).toBeCloseTo(
      baseline * 0.625,
      10,
    );
  });

  it("缺少basis/乘区声明会报错，extraAttack不会被当成extraDamage", () => {
    const incomplete: Skill = {
      ...alwaysExtra(),
      id: "skill.synthetic.incomplete-extra",
      effects: [
        {
          type: "extraDamage",
          value: 0.5,
          damageCategory: "extra",
          targetTroop: "all",
          status: "supported",
        },
      ],
    };
    const extraAttack: Skill = {
      ...probabilityExtra(1),
      id: "skill.synthetic.extra-attack",
      effects: [
        {
          type: "extraAttack",
          value: 1,
          targetTroop: "all",
          status: "supported",
        },
      ],
    };

    expect(() =>
      calculateBattleDamageWithAdditionalSkills(input, [incomplete]),
    ).toThrow(InvalidDamageComponentError);
    expect(() => createExtraDamageProbabilityEvent(extraAttack)).toThrow(
      InvalidProbabilityError,
    );
  });
});
