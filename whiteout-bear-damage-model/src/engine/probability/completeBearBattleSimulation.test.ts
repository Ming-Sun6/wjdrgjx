import { describe, expect, it } from "vitest";
import { calculateBattleDamage } from "../../app/calculateBattleDamage";
import type { BattleDamageInput } from "../../domain/battleDamage";
import type {
  ExactProbabilityScenario,
  StatefulBernoulliTransition,
} from "../../domain/probability";
import type { ExtraAttackTriggerPolicy, Skill } from "../../domain/skill";
import { createActiveEffect } from "../rounds/activeEffects";
import {
  advanceDurationEffectsAfterRound,
  createDurationProbabilityEvent,
} from "./createDurationProbabilityEvent";
import { calculateBearBattleExpectedDamage } from "./calculateExpectedBattleDamage";
import { createExtraAttackProbabilityEvent } from "./extraAttackEvents";
import { createExtraDamageProbabilityEvent } from "./extraDamageEvents";

const input: BattleDamageInput = {
  troops: [
    {
      troopType: "marksman",
      troopLevelId: "T10",
      troopCount: 10_000,
      stats: { attackPercent: 400, penetrationPercent: 100 },
    },
  ],
  bodyHeroIds: [],
  damageChannel: "normalAttack",
};

function oneEventEveryRound(
  id: string,
  event: ExactProbabilityScenario["createRoundPlan"] extends (
    ...args: never[]
  ) => infer _Plan
    ? NonNullable<ReturnType<ExactProbabilityScenario["createRoundPlan"]>["beforeDamageEvents"]>[number]
    : never,
): ExactProbabilityScenario {
  return {
    id,
    createRoundPlan: () => ({ beforeDamageEvents: [event] }),
  };
}

describe("第二十步10回合完整期望伤害模拟器", () => {
  it("无技能时总伤害严格等于现有单回合伤害乘10", () => {
    const singleRound = calculateBattleDamage(input);
    const battle = calculateBearBattleExpectedDamage(input);

    expect(battle.expectedRoundDamage).toHaveLength(10);
    expect(
      Math.abs(
        battle.expectedTotalDamage - singleRound.finalDamage * 10,
      ),
    ).toBeLessThan(singleRound.finalDamage * 1e-12);
    expect(
      Math.abs(battle.expectedBaseDamage - singleRound.baseDamage * 10),
    ).toBeLessThan(singleRound.baseDamage * 1e-12);
    expect(battle.expectedRoundDamage.every((round) =>
      round.expectedTotalDamage === singleRound.finalDamage,
    )).toBe(true);
  });

  it("永久attack +10%在10个回合均生效", () => {
    const baseline = calculateBattleDamage(input).finalDamage;
    const event: StatefulBernoulliTransition = {
      id: "event.synthetic.permanent-attack",
      trigger: {
        type: "probability",
        probability: 1,
        triggerPhase: "roundStart",
        frequency: "oncePerBattle",
      },
      applyTriggered: (state) => ({
        ...state,
        activeEffects: [
          ...state.activeEffects,
          createActiveEffect({
            id: "active.synthetic.permanent-attack",
            sourceSkillId: "skill.synthetic.permanent-attack",
            effect: {
              type: "attack",
              value: 0.1,
              targetTroop: "all",
              status: "supported",
            },
          }),
        ],
      }),
    };
    const scenario: ExactProbabilityScenario = {
      id: "scenario.synthetic.permanent-attack",
      createRoundPlan: ({ round }) => ({
        beforeDamageEvents: round === 1 ? [event] : [],
      }),
    };
    const battle = calculateBearBattleExpectedDamage(input, { scenario });

    expect(
      battle.expectedRoundDamage.every(
        (round) => Math.abs(round.expectedTotalDamage - baseline * 1.1) < 1e-9,
      ),
    ).toBe(true);
    expect(battle.expectedTotalDamage).toBeCloseTo(baseline * 11, 10);
  });

  it("第1回合施加的减防持续3回合，只应用等效乘区且不猜测有效防御", () => {
    const baseline = calculateBattleDamage(input).finalDamage;
    const skill: Skill = {
      id: "skill.synthetic.three-round-defense-reduction",
      name: "测试三回合减防",
      status: "supported",
      trigger: {
        type: "probability",
        probability: 1,
        triggerPhase: "roundStart",
        frequency: "oncePerBattle",
        durationRounds: 3,
      },
      lifecycle: {
        durationRounds: 3,
        activationTiming: "immediate",
        refreshMode: "replace",
      },
      effects: [
        {
          type: "defenseReduction",
          value: 0.25,
          targetTroop: "all",
          status: "supported",
        },
      ],
    };
    const event = createDurationProbabilityEvent(skill);
    const scenario: ExactProbabilityScenario = {
      id: "scenario.synthetic.three-round-defense-reduction",
      createRoundPlan: ({ round }) => ({
        beforeDamageEvents: round === 1 ? [event] : [],
      }),
      transitionAfterRound: advanceDurationEffectsAfterRound,
    };
    const battle = calculateBearBattleExpectedDamage(input, {
      scenario,
      enemyBaseDefense: 1_000,
    });

    expect(
      battle.expectedRoundDamage.map(
        (round) => round.enemyDefense.expectedEffectiveDefenseByTroop.marksman,
      ),
    ).toEqual([null, null, null, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000]);
    expect(
      battle.expectedRoundDamage.map(
        (round) =>
          round.enemyDefense.expectedDefenseReductionMultiplierByTroop.marksman,
      ),
    ).toEqual([1.25, 1.25, 1.25, 1, 1, 1, 1, 1, 1, 1]);
    expect(battle.expectedTotalDamage).toBeCloseTo(
      baseline * (3 * 1.25 + 7),
      10,
    );
  });

  it("30%概率造成50%额外伤害按状态分支得到10回合精确期望", () => {
    const baseline = calculateBattleDamage(input).finalDamage;
    const skill: Skill = {
      id: "skill.synthetic.probability-extra-damage",
      name: "测试概率额外伤害",
      status: "supported",
      trigger: {
        type: "probability",
        probability: 0.3,
        triggerPhase: "afterAttack",
        frequency: "oncePerRound",
      },
      effects: [
        {
          type: "extraDamage",
          value: 0.5,
          basis: "normalAttackDamage",
          damageCategory: "extra",
          applicableMultiplierZones: [],
          targetTroop: "all",
          status: "supported",
        },
      ],
    };
    const scenario = oneEventEveryRound(
      "scenario.synthetic.probability-extra-damage",
      createExtraDamageProbabilityEvent(skill),
    );
    const battle = calculateBearBattleExpectedDamage(input, { scenario });

    expect(battle.expectedExtraDamage).toBeCloseTo(baseline * 1.5, 9);
    expect(battle.expectedTotalDamage).toBeCloseTo(baseline * 11.5, 9);
    expect(battle.expectedRoundDamage[0]?.expectedExtraDamage).toBeCloseTo(
      baseline * 0.15,
      10,
    );
  });

  it("extraAttack作为独立攻击事件增加10回合期望攻击次数", () => {
    const noChildTriggers: ExtraAttackTriggerPolicy = {
      beforeAttack: false,
      onAttack: false,
      afterAttack: false,
      canTriggerExtraAttack: false,
      canTriggerExtraDamage: false,
    };
    const skill: Skill = {
      id: "skill.synthetic.certain-extra-attack",
      name: "测试必定额外攻击",
      status: "supported",
      trigger: {
        type: "probability",
        probability: 1,
        triggerPhase: "afterAttack",
        frequency: "oncePerRound",
      },
      effects: [
        {
          type: "extraAttack",
          value: 1,
          count: 1,
          damageScale: 1,
          triggerPolicy: noChildTriggers,
          maxAttackDepth: 1,
          targetTroop: "all",
          status: "supported",
        },
      ],
    };
    const scenario = oneEventEveryRound(
      "scenario.synthetic.certain-extra-attack",
      createExtraAttackProbabilityEvent(skill),
    );
    const baseline = calculateBattleDamage(input).finalDamage;
    const battle = calculateBearBattleExpectedDamage(input, { scenario });

    expect(battle.expectedAttackCount).toBe(20);
    expect(battle.expectedRoundDamage.every((round) => round.expectedAttackCount === 2)).toBe(true);
    expect(battle.expectedExtraAttackDamage).toBeCloseTo(baseline * 10, 9);
    expect(battle.expectedTotalDamage).toBeCloseTo(baseline * 20, 9);
  });
});
