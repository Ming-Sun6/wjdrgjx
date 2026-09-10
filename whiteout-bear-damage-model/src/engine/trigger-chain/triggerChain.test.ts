import { describe, expect, it } from "vitest";
import { calculateBattleDamage } from "../../app/calculateBattleDamage";
import type { BattleDamageInput } from "../../domain/battleDamage";
import type {
  BattleEvent,
  LinkedSkillDefinition,
  TriggerChainEffectDefinition,
  TriggeredSkillDefinition,
} from "../../domain/battleEvent";
import type { ExactProbabilityScenario } from "../../domain/probability";
import type { SkillEffect } from "../../domain/skill";
import { DEFAULT_BEAR_BATTLE_CONTEXT } from "../../rulesets/bear/battle/constants";
import { calculateExpectedBattleDamage } from "../probability/calculateExpectedBattleDamage";
import { calculateDamageForProbabilityState } from "../probability/damage";
import { advanceDurationEffectsAfterRound } from "../probability/createDurationProbabilityEvent";
import { createBattleState } from "../rounds/battleState";
import { createActiveEffect } from "../rounds/activeEffects";
import { createTriggerChainProbabilityEvent } from "./createTriggerChainProbabilityEvent";
import { linkedSkillDefinitionFromSkill } from "./definitions";
import { TriggerChainCycleError, TriggerChainDepthError } from "./errors";
import { matchesBattleConditions } from "./conditions";
import { resolveTriggeredSkillChain } from "./resolveTriggerChain";

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

const parentAttackEvent: BattleEvent = {
  eventId: "battle.round-1.primary-marksman",
  type: "attack",
  round: 1,
  rootEventId: "battle.round-1.primary-marksman",
  depth: 0,
  attackerTroopType: "marksman",
  enemyTroopType: "shield",
  attackKind: "normal",
};

function rootSkill(skillId = "skill.A"): TriggeredSkillDefinition {
  return {
    skillId,
    skillName: skillId,
    status: "supported",
    effects: [],
  };
}

function effect(
  id: string,
  runtimeEffect: SkillEffect,
  application: TriggerChainEffectDefinition["application"] = "transient",
  extra: Partial<TriggerChainEffectDefinition> = {},
): TriggerChainEffectDefinition {
  return {
    id,
    status: "supported",
    effect: { ...runtimeEffect, status: "supported" },
    application,
    ...extra,
  };
}

function linked(
  skillId: string,
  sourceSkillId: string,
  effects: readonly TriggerChainEffectDefinition[],
  probability?: number,
): LinkedSkillDefinition {
  return {
    id: `link.${sourceSkillId}.${skillId}`,
    skillId,
    skillName: skillId,
    status: "supported",
    trigger:
      probability === undefined
        ? { type: "onSkillTrigger", sourceSkillId }
        : {
            type: "probability",
            probability,
            event: "onSkillTrigger",
            requiredSkillId: sourceSkillId,
            triggerPhase: "onAttack",
            frequency: "explicitSchedule",
          },
    effects,
  };
}

function chainEvent(
  probability: number,
  linkedSkills: readonly LinkedSkillDefinition[],
  options: {
    readonly root?: TriggeredSkillDefinition;
    readonly parentEvent?: BattleEvent;
    readonly maxTriggerDepth?: number;
  } = {},
) {
  return createTriggerChainProbabilityEvent({
    id: "trigger-chain.synthetic",
    trigger: {
      type: "probability",
      probability,
      triggerPhase: "onAttack",
      frequency: "oncePerRound",
    },
    rootSkill: options.root ?? rootSkill(),
    linkedSkills,
    ...(options.parentEvent === undefined
      ? {}
      : { parentEvent: options.parentEvent }),
    attackerTroopType: "marksman",
    attackKind: "normal",
    maxTriggerDepth: options.maxTriggerDepth ?? 8,
  });
}

function scenarioFor(event: ReturnType<typeof chainEvent>): ExactProbabilityScenario {
  return {
    id: "scenario.synthetic.trigger-chain",
    createRoundPlan: () => ({ beforeDamageEvents: [event] }),
  };
}

describe("skill trigger chain", () => {
  it("A必定触发后B的damageIncrease才进入现有伤害引擎", () => {
    const baseline = calculateBattleDamage(input).finalDamage;
    const event = chainEvent(1, [
      linked("skill.B", "skill.A", [
        effect("effect.B.damage", { type: "damageIncrease", value: 0.2 }),
      ]),
    ]);
    const result = calculateExpectedBattleDamage(input, {
      scenario: scenarioFor(event),
    });

    expect(result.expectedTotalDamage).toBeCloseTo(baseline * 12, 8);
  });

  it("A概率为0时B永远不生效", () => {
    const baseline = calculateBattleDamage(input).finalDamage;
    const event = chainEvent(0, [
      linked("skill.B", "skill.A", [
        effect("effect.B.damage", { type: "damageIncrease", value: 0.5 }),
      ]),
    ]);
    const result = calculateExpectedBattleDamage(input, {
      scenario: scenarioFor(event),
    });

    expect(result.expectedTotalDamage).toBeCloseTo(baseline * 10, 8);
  });

  it("A以30%概率触发并确定联动B+50%时精确期望为1.15倍", () => {
    const baseline = calculateBattleDamage(input).finalDamage;
    const event = chainEvent(0.3, [
      linked("skill.B", "skill.A", [
        effect("effect.B.damage", { type: "damageIncrease", value: 0.5 }),
      ]),
    ]);
    const result = calculateExpectedBattleDamage(input, {
      scenario: scenarioFor(event),
    });

    expect(result.expectedTotalDamage).toBeCloseTo(baseline * 11.5, 8);
    expect(result.statistics.maxStatesInAnyRound).toBeGreaterThanOrEqual(2);
  });

  it("来源触发后还可让B独立进行Bernoulli判定", () => {
    const event = chainEvent(1, [
      linked(
        "skill.B",
        "skill.A",
        [effect("effect.B.damage", { type: "damageIncrease", value: 0.5 })],
        0.4,
      ),
    ]);
    const resolution = resolveTriggeredSkillChain({
      transition: event,
      state: createBattleState(DEFAULT_BEAR_BATTLE_CONTEXT),
      battleContext: DEFAULT_BEAR_BATTLE_CONTEXT,
      probability: 1,
    });

    expect(resolution.branches.map((branch) => branch.probability).sort()).toEqual([
      0.4,
      0.6,
    ]);
    expect(resolution.probabilityMass).toBeCloseTo(1, 12);
  });

  it("A→B→C保留完整parent/root/depth来源关系", () => {
    const event = chainEvent(
      1,
      [
        linked("skill.B", "skill.A", []),
        linked("skill.C", "skill.B", []),
      ],
      { parentEvent: parentAttackEvent },
    );
    const resolution = resolveTriggeredSkillChain({
      transition: event,
      state: createBattleState(DEFAULT_BEAR_BATTLE_CONTEXT),
      battleContext: DEFAULT_BEAR_BATTLE_CONTEXT,
      probability: 1,
    });
    const events = resolution.branches[0]!.events;
    const [attack, a, b, c] = events;

    expect(attack).toEqual(parentAttackEvent);
    expect(a).toMatchObject({ skillId: "skill.A", parentEventId: attack!.eventId, depth: 1 });
    expect(b).toMatchObject({ skillId: "skill.B", parentEventId: a!.eventId, depth: 2 });
    expect(c).toMatchObject({ skillId: "skill.C", parentEventId: b!.eventId, depth: 3 });
    expect([a!.rootEventId, b!.rootEventId, c!.rootEventId]).toEqual([
      attack!.eventId,
      attack!.eventId,
      attack!.eventId,
    ]);
  });

  it("A→B→A配置在执行前被循环检测拒绝", () => {
    expect(() =>
      chainEvent(1, [
        linked("skill.B", "skill.A", []),
        linked("skill.A", "skill.B", []),
      ]),
    ).toThrow(TriggerChainCycleError);
  });

  it("maxTriggerDepth独立阻止过深技能链", () => {
    const event = chainEvent(
      1,
      [linked("skill.B", "skill.A", [])],
      { parentEvent: parentAttackEvent, maxTriggerDepth: 1 },
    );
    expect(() =>
      resolveTriggeredSkillChain({
        transition: event,
        state: createBattleState(DEFAULT_BEAR_BATTLE_CONTEXT),
        battleContext: DEFAULT_BEAR_BATTLE_CONTEXT,
        probability: 1,
      }),
    ).toThrow(TriggerChainDepthError);
  });

  it("A触发B的extraDamage继续使用既有basis和DamageBreakdown", () => {
    const baseline = calculateBattleDamage(input).finalDamage;
    const event = chainEvent(1, [
      linked("skill.B", "skill.A", [
        effect("effect.B.extra-damage", {
          type: "extraDamage",
          value: 0.5,
          basis: "normalAttackDamage",
          damageCategory: "extra",
          applicableMultiplierZones: [],
          targetTroop: "marksman",
        }),
      ]),
    ]);
    const result = calculateExpectedBattleDamage(input, {
      scenario: scenarioFor(event),
    });

    expect(result.expectedNormalDamage).toBeCloseTo(baseline * 10, 8);
    expect(result.expectedExtraDamage).toBeCloseTo(baseline * 5, 8);
    expect(result.expectedTotalDamage).toBeCloseTo(baseline * 15, 8);
  });

  it("A触发B的extraAttack会生成同回合子AttackEvent", () => {
    const event = chainEvent(
      1,
      [
        linked("skill.B", "skill.A", [
          effect("effect.B.extra-attack", {
            type: "extraAttack",
            value: 1,
            count: 1,
            damageScale: 1,
            targetTroop: "marksman",
            maxAttackDepth: 1,
            triggerPolicy: {
              beforeAttack: false,
              onAttack: false,
              afterAttack: false,
              canTriggerExtraAttack: false,
              canTriggerExtraDamage: false,
            },
          }),
        ]),
      ],
      { parentEvent: parentAttackEvent },
    );
    const resolution = resolveTriggeredSkillChain({
      transition: event,
      state: createBattleState(DEFAULT_BEAR_BATTLE_CONTEXT),
      battleContext: DEFAULT_BEAR_BATTLE_CONTEXT,
      probability: 1,
    });
    const branch = resolution.branches[0]!;
    const damage = calculateDamageForProbabilityState(
      input,
      branch.state.activeEffects,
      branch.transientEffects,
      1,
    );
    const attacks = damage.troopDamages.marksman!.attacks;

    expect(attacks).toHaveLength(2);
    expect(attacks[1]).toMatchObject({
      kind: "extra",
      round: 1,
      sourceSkillId: "skill.B",
      parentAttackId: attacks[0]!.attackId,
    });
    expect(damage.extraAttackDamage).toBeCloseTo(damage.primaryAttackDamage, 10);
  });

  it("duration和stack联动分别复用既有ActiveEffect更新器", () => {
    const duration = linked("skill.duration", "skill.A", [
      effect(
        "effect.duration",
        {
          type: "damageIncrease",
          value: 0.2,
          lifecycle: {
            durationRounds: 2,
            activationTiming: "immediate",
            refreshMode: "refresh",
          },
        },
        "duration",
      ),
    ]);
    const stack = linked("skill.stack", "skill.duration", [
      effect(
        "effect.stack",
        {
          type: "marksmanDamage",
          value: 0.1,
          valuePerStack: 0.1,
          lifecycle: {
            activationTiming: "immediate",
            refreshMode: "stack",
            maxStacks: 3,
            atMaxStacks: "keep",
          },
        },
        "stack",
      ),
    ]);
    const event = chainEvent(1, [duration, stack]);
    const first = resolveTriggeredSkillChain({
      transition: event,
      state: createBattleState(DEFAULT_BEAR_BATTLE_CONTEXT),
      battleContext: DEFAULT_BEAR_BATTLE_CONTEXT,
      probability: 1,
    }).branches[0]!;
    const durationEffect = first.state.activeEffects.find(
      (active) => active.sourceSkillId === "skill.duration",
    )!;
    const stackEffect = first.state.activeEffects.find(
      (active) => active.sourceSkillId === "skill.stack",
    )!;

    expect(durationEffect.remainingRounds).toBe(2);
    expect(advanceDurationEffectsAfterRound(first.state).activeEffects.find(
      (active) => active.id === durationEffect.id,
    )?.remainingRounds).toBe(1);
    expect(stackEffect.stackCount).toBe(1);

    const second = resolveTriggeredSkillChain({
      transition: event,
      state: first.state,
      battleContext: DEFAULT_BEAR_BATTLE_CONTEXT,
      probability: 1,
    }).branches[0]!;
    expect(second.state.activeEffects.find(
      (active) => active.id === stackEffect.id,
    )?.stackCount).toBe(2);
  });

  it("effect级pending被报告而同技能supported效果仍参与", () => {
    const pending: TriggerChainEffectDefinition = {
      id: "effect.B.pending",
      status: "pending",
      effect: { type: "damageIncrease", value: 0.9 },
      application: "transient",
      pendingReason: "测试专用：机制未确认。",
    };
    const event = chainEvent(1, [
      linked("skill.B", "skill.A", [
        effect("effect.B.supported", { type: "damageIncrease", value: 0.2 }),
        pending,
      ]),
    ]);
    const branch = resolveTriggeredSkillChain({
      transition: event,
      state: createBattleState(DEFAULT_BEAR_BATTLE_CONTEXT),
      battleContext: DEFAULT_BEAR_BATTLE_CONTEXT,
      probability: 1,
    }).branches[0]!;

    expect(branch.transientEffects).toHaveLength(1);
    expect(branch.skippedEffects).toEqual([
      {
        skillId: "skill.B",
        effectId: "effect.B.pending",
        status: "pending",
        reason: "测试专用：机制未确认。",
      },
    ]);
  });

  it("结构化Skill可直接转换为linked定义而无需名称判断", () => {
    const definition = linkedSkillDefinitionFromSkill({
      id: "skill.B",
      name: "Synthetic B",
      status: "supported",
      trigger: { type: "onSkillTrigger", sourceSkillId: "skill.A" },
      effects: [
        {
          type: "damageIncrease",
          value: 0.2,
          status: "supported",
          triggerApplication: "transient",
          conditions: [
            { type: "sourceSkillTriggered", requiredSkillId: "skill.A" },
          ],
        },
      ],
    });

    expect(definition).toMatchObject({
      skillId: "skill.B",
      trigger: { type: "onSkillTrigger", sourceSkillId: "skill.A" },
      effects: [
        {
          status: "supported",
          application: "transient",
        },
      ],
    });
  });

  it("通用条件从事件、BattleContext和BattleState读取", () => {
    const event = chainEvent(1, [
      {
        ...linked("skill.B", "skill.A", [
          effect(
            "effect.B.conditioned",
            { type: "damageIncrease", value: 0.2 },
            "transient",
            {
              conditions: [
                { type: "enemyTroopType", troopType: "shield" },
                { type: "round", operator: "eq", value: 1 },
              ],
            },
          ),
        ]),
        conditions: [
          { type: "sourceSkillTriggered", requiredSkillId: "skill.A" },
          { type: "attackerTroopType", troopType: "marksman" },
          { type: "attackKind", attackKind: "normal" },
        ],
      },
    ]);
    const branch = resolveTriggeredSkillChain({
      transition: event,
      state: createBattleState(DEFAULT_BEAR_BATTLE_CONTEXT),
      battleContext: DEFAULT_BEAR_BATTLE_CONTEXT,
      probability: 1,
    }).branches[0]!;

    expect(branch.transientEffects).toHaveLength(1);
  });

  it("stackCount条件读取指定ActiveEffect而不是推测技能层数", () => {
    const state = {
      ...createBattleState(DEFAULT_BEAR_BATTLE_CONTEXT),
      activeEffects: [
        createActiveEffect({
          id: "active.synthetic.stack",
          sourceSkillId: "skill.stack",
          effect: { type: "damageIncrease", value: 0.1 },
          stackCount: 2,
        }),
      ],
    };

    expect(matchesBattleConditions(
      [
        {
          type: "stackCount",
          activeEffectId: "active.synthetic.stack",
          operator: "gte",
          value: 2,
        },
      ],
      {
        sourceEvent: parentAttackEvent,
        battleState: state,
        battleContext: DEFAULT_BEAR_BATTLE_CONTEXT,
      },
    )).toBe(true);
  });
});
