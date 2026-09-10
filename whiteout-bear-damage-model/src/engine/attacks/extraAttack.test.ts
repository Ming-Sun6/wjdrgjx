import { describe, expect, it } from "vitest";
import {
  calculateBattleDamage,
  calculateBattleDamageWithAdditionalSkills,
} from "../../app/calculateBattleDamage";
import type { AttackEvent } from "../../domain/attack";
import type { BattleDamageInput } from "../../domain/battleDamage";
import type { ExactProbabilityScenario } from "../../domain/probability";
import type {
  ExtraAttackTriggerPolicy,
  ResolvedSkillEffect,
  Skill,
} from "../../domain/skill";
import { calculateBaseTotalDamage } from "../../rulesets/bear/base-damage/calculateBaseTotalDamage";
import { createBearBattleContext } from "../../rulesets/bear/battle/calculateBearBattleTotalDamage";
import { createDamageBreakdown } from "../damage/resolveDamageComponent";
import { calculateExpectedBattleDamage } from "../probability/calculateExpectedBattleDamage";
import { createExtraAttackProbabilityEvent } from "../probability/extraAttackEvents";
import { createActiveEffect } from "../rounds/activeEffects";
import { createBattleState } from "../rounds/battleState";
import { calculateAttackEventDamage } from "./calculateAttackEventDamage";
import { AttackRecursionLimitError } from "./errors";
import { resolveAttackSequence } from "./resolveAttackSequence";

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

const noChildTriggers: ExtraAttackTriggerPolicy = {
  beforeAttack: false,
  onAttack: false,
  afterAttack: false,
  canTriggerExtraAttack: false,
  canTriggerExtraDamage: false,
};

function extraAttackEffect(options: {
  readonly targetTroop?: "shield" | "lancer" | "marksman" | "all";
  readonly damageScale?: number;
  readonly triggerPolicy?: ExtraAttackTriggerPolicy;
  readonly maxAttackDepth?: number;
} = {}): Skill["effects"][number] {
  return {
    type: "extraAttack",
    value: 1,
    count: 1,
    damageScale: options.damageScale ?? 1,
    triggerPolicy: options.triggerPolicy ?? noChildTriggers,
    maxAttackDepth: options.maxAttackDepth ?? 1,
    targetTroop: options.targetTroop ?? "all",
    status: "supported",
  };
}

function alwaysExtraAttack(
  options: Parameters<typeof extraAttackEffect>[0] = {},
): Skill {
  return {
    id: "skill.synthetic.always-extra-attack",
    name: "Synthetic always extra attack",
    status: "supported",
    trigger: { type: "always" },
    effects: [extraAttackEffect(options)],
  };
}

function probabilityExtraAttack(probability: number): Skill {
  return {
    id: "skill.synthetic.probability-extra-attack",
    name: "Synthetic probability extra attack",
    status: "supported",
    trigger: {
      type: "probability",
      probability,
      triggerPhase: "onAttack",
      frequency: "oncePerRound",
    },
    effects: [extraAttackEffect()],
  };
}

function primaryAttack(): AttackEvent {
  return {
    id: "round:1:primary:shield:0",
    round: 1,
    troopType: "shield",
    kind: "normal",
    attackIndex: 0,
    attackDepth: 0,
    damageScale: 1,
    triggerPolicy: {
      beforeAttack: true,
      onAttack: true,
      afterAttack: true,
      canTriggerExtraAttack: true,
      canTriggerExtraDamage: true,
    },
  };
}

describe("extraAttack攻击事件", () => {
  it("100%额外攻击一次会产生独立AttackEvent并得到2倍伤害", () => {
    const baseline = calculateBattleDamage(input);
    const result = calculateBattleDamageWithAdditionalSkills(input, [
      alwaysExtraAttack(),
    ]);

    expect(result.finalDamage).toBeCloseTo(baseline.finalDamage * 2, 10);
    expect(result.primaryAttackDamage).toBeCloseTo(baseline.finalDamage, 10);
    expect(result.extraAttackDamage).toBeCloseTo(baseline.finalDamage, 10);
    expect(result.attacks.filter((attack) => attack.kind === "normal")).toHaveLength(3);
    expect(result.attacks.filter((attack) => attack.kind === "extra")).toHaveLength(3);
    for (const extra of result.attacks.filter((attack) => attack.kind === "extra")) {
      expect(extra.parentAttackId).toBeDefined();
      expect(extra.attackDepth).toBe(1);
      expect(extra.round).toBe(1);
    }
  });

  it("10%额外攻击通过精确概率分支得到1.1倍期望", () => {
    const baseline = calculateBattleDamage(input).finalDamage;
    const event = createExtraAttackProbabilityEvent(probabilityExtraAttack(0.1));
    const scenario: ExactProbabilityScenario = {
      id: "scenario.synthetic.probability-extra-attack",
      createRoundPlan: () => ({ beforeDamageEvents: [event] }),
    };
    const result = calculateExpectedBattleDamage(input, { scenario });

    for (const round of result.expectedRoundDamage) {
      expect(round.expectedPrimaryAttackDamage).toBeCloseTo(baseline, 9);
      expect(round.expectedExtraAttackDamage).toBeCloseTo(baseline * 0.1, 9);
      expect(round.expectedTotalDamage).toBeCloseTo(baseline * 1.1, 9);
    }
    expect(result.expectedTotalDamage).toBeCloseTo(baseline * 11, 8);
    expect(result.statistics.maxStatesInAnyRound).toBeGreaterThanOrEqual(2);
  });

  it("damageScale=0.5仍重新结算攻击事件并得到1.5倍总伤害", () => {
    const baseline = calculateBattleDamage(input).finalDamage;
    const result = calculateBattleDamageWithAdditionalSkills(input, [
      alwaysExtraAttack({ damageScale: 0.5 }),
    ]);

    expect(result.finalDamage).toBeCloseTo(baseline * 1.5, 10);
    expect(result.extraAttackDamage).toBeCloseTo(baseline * 0.5, 10);
    expect(result.attacks.filter((attack) => attack.kind === "extra")).toHaveLength(3);
  });

  it("主攻击后的状态变化会被第二击重新读取而不是复制第一击伤害", () => {
    const troopInput = input.troops[0]!;
    const base = calculateBaseTotalDamage({ troops: [troopInput] }).troopResults[0]!;
    const extraSkill = alwaysExtraAttack({
      triggerPolicy: { ...noChildTriggers, canTriggerExtraDamage: true },
    });
    const initialState = createBattleState(createBearBattleContext());
    const sequence = resolveAttackSequence({
      initialState,
      primaryAttack: primaryAttack(),
      calculateAttack: (event, state) => {
        const stateSkills: Skill[] = state.activeEffects.map((active) => ({
          id: `runtime.${active.id}`,
          name: active.id,
          status: "supported",
          trigger: { type: "always" },
          effects: [{ ...active.effect, status: "supported" }],
        }));
        return calculateAttackEventDamage({
          event,
          state,
          baseDamage: base,
          skills: [extraSkill, ...stateSkills],
          damageChannel: "normalAttack",
        });
      },
      transitionAtPhase: (state, event, phase) => {
        if (event.kind !== "normal" || phase !== "afterAttack") return state;
        return {
          ...state,
          activeEffects: [
            ...state.activeEffects,
            createActiveEffect({
              id: "active.synthetic.after-primary",
              sourceSkillId: "skill.synthetic.after-primary",
              effect: { type: "damageIncrease", value: 0.2 },
            }),
          ],
        };
      },
    });

    expect(sequence.attacks).toHaveLength(2);
    expect(sequence.attacks[0]?.totalDamage).toBeCloseTo(base.damage, 12);
    expect(sequence.attacks[1]?.totalDamage).toBeCloseTo(base.damage * 1.2, 12);
    expect(sequence.attacks[1]?.stateBefore.activeEffects).toHaveLength(1);
  });

  it("允许extraAttack递归的数据会被maxAttackDepth明确阻止", () => {
    const recursivePolicy: ExtraAttackTriggerPolicy = {
      ...noChildTriggers,
      canTriggerExtraAttack: true,
    };
    const effect: ResolvedSkillEffect = {
      ...extraAttackEffect({
        triggerPolicy: recursivePolicy,
        maxAttackDepth: 1,
      }),
      type: "extraAttack",
      targetTroop: "shield",
      skillId: "skill.synthetic.recursive",
      skillName: "Synthetic recursive",
      effectIndex: 0,
    };
    const state = createBattleState(createBearBattleContext());

    expect(() =>
      resolveAttackSequence({
        initialState: state,
        primaryAttack: primaryAttack(),
        calculateAttack: () => ({
          damageBreakdown: createDamageBreakdown(100, 0),
          extraDamageComponents: [],
          extraAttackEffects: [effect],
        }),
      }),
    ).toThrow(AttackRecursionLimitError);
  });

  it("extraAttack与extraDamage分别记录且第二击可按策略再次产生extraDamage", () => {
    const baseline = calculateBattleDamage(input).finalDamage;
    const skill: Skill = {
      ...alwaysExtraAttack({
        triggerPolicy: { ...noChildTriggers, canTriggerExtraDamage: true },
      }),
      id: "skill.synthetic.extra-attack-and-damage",
      effects: [
        extraAttackEffect({
          triggerPolicy: { ...noChildTriggers, canTriggerExtraDamage: true },
        }),
        {
          type: "extraDamage",
          value: 0.2,
          basis: "normalAttackDamage",
          damageCategory: "extra",
          applicableMultiplierZones: [],
          targetTroop: "all",
          status: "supported",
        },
      ],
    };
    const result = calculateBattleDamageWithAdditionalSkills(input, [skill]);

    expect(result.attacks).toHaveLength(6);
    expect(result.damageBreakdown.normalDamage).toBeCloseTo(baseline * 2, 10);
    expect(result.damageBreakdown.extraDamage).toBeCloseTo(baseline * 0.4, 10);
    expect(result.primaryAttackDamage).toBeCloseTo(baseline * 1.2, 10);
    expect(result.extraAttackDamage).toBeCloseTo(baseline * 1.2, 10);
    expect(result.finalDamage).toBeCloseTo(baseline * 2.4, 10);
    expect(result.attacks.every((attack) => attack.extraDamage > 0)).toBe(true);
  });

  it("兵种目标限制确保射手额外攻击不会让盾和矛重复攻击", () => {
    const baseline = calculateBattleDamage(input);
    const result = calculateBattleDamageWithAdditionalSkills(input, [
      alwaysExtraAttack({ targetTroop: "marksman" }),
    ]);
    const marksmanDamage = baseline.troopDamages.marksman!.finalDamage;

    expect(result.troopDamages.shield?.attacks).toHaveLength(1);
    expect(result.troopDamages.lancer?.attacks).toHaveLength(1);
    expect(result.troopDamages.marksman?.attacks).toHaveLength(2);
    expect(result.finalDamage).toBeCloseTo(baseline.finalDamage + marksmanDamage, 10);
  });

  it("triggerPolicy只让额外攻击经过显式启用的phase", () => {
    const effect: ResolvedSkillEffect = {
      ...extraAttackEffect({
        triggerPolicy: {
          ...noChildTriggers,
          onAttack: true,
        },
      }),
      type: "extraAttack",
      targetTroop: "shield",
      skillId: "skill.synthetic.phase-policy",
      skillName: "Synthetic phase policy",
      effectIndex: 0,
    };
    const visited: string[] = [];
    const state = createBattleState(createBearBattleContext());
    const sequence = resolveAttackSequence({
      initialState: state,
      primaryAttack: primaryAttack(),
      calculateAttack: () => ({
        damageBreakdown: createDamageBreakdown(100, 0),
        extraDamageComponents: [],
        extraAttackEffects: [effect],
      }),
      transitionAtPhase: (current, event, phase) => {
        visited.push(`${event.kind}:${phase}`);
        return current;
      },
    });

    expect(sequence.attacks[1]?.phases).toEqual(["onAttack", "damageResolution"]);
    expect(visited.filter((entry) => entry.startsWith("extra:"))).toEqual([
      "extra:onAttack",
    ]);
  });
});

