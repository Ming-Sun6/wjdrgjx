import { describe, expect, it } from "vitest";
import type { Skill, SkillTrigger } from "../../domain/skill";
import type { TriggerContext } from "../../domain/battleState";
import { DEFAULT_BEAR_BATTLE_CONTEXT } from "../../rulesets/bear/battle/constants";
import { createBattleState } from "./battleState";
import { resolveSkillTrigger } from "./resolveSkillTrigger";
import { resolveSkillEffects } from "../skills/resolveSkillEffects";
import { aggregateMultipliers } from "../skills/aggregateMultipliers";
import { UnsupportedSkillLifecycleError, UnsupportedSkillTriggerError } from "../skills/errors";
import { calculateBattleDamageFromCatalog } from "../battle/calculateBattleDamage";
import { calculateBearBattleTotalDamageFromSingleRound } from "../../rulesets/bear/battle/calculateBearBattleTotalDamage";

const context: TriggerContext = {
  battleContext: DEFAULT_BEAR_BATTLE_CONTEXT,
  battleState: createBattleState(DEFAULT_BEAR_BATTLE_CONTEXT),
  roundState: { round: 1, phase: "resolveSkills" },
};
const unsupported: readonly SkillTrigger[] = [
  { type: "probability", probability: 0.5 },
  { type: "everyNRounds", interval: 4 },
  { type: "beforeAttack" }, { type: "afterAttack" },
  { type: "stacking", maxStacks: 8 },
];

describe("通用 trigger 接口与未实现机制", () => {
  it("always 明确解析为 active", () => {
    expect(resolveSkillTrigger({ type: "always" }, context)).toEqual({ status: "active", triggerType: "always" });
  });

  it.each(unsupported)("$type 只返回未实现诊断；正式技能解析仍报错", (trigger) => {
    const before = structuredClone(context);
    expect(resolveSkillTrigger(trigger, context)).toMatchObject({ status: "unimplemented", triggerType: trigger.type });
    expect(context).toEqual(before);
    const skill: Skill = { id: "test", name: "test", trigger, effects: [{ type: "attack", value: 0.25 }] };
    expect(() => resolveSkillEffects([skill], "shield")).toThrow(UnsupportedSkillTriggerError);
  });

  it("onSkillTrigger只在稳定sourceSkillId匹配时生效", () => {
    const trigger = { type: "onSkillTrigger", sourceSkillId: "synthetic" } as const;
    expect(resolveSkillTrigger(trigger, { ...context, sourceSkillId: "synthetic" })).toEqual({
      status: "active",
      triggerType: "onSkillTrigger",
    });
    expect(resolveSkillTrigger(trigger, { ...context, sourceSkillId: "other" })).toMatchObject({
      status: "inactive",
      triggerType: "onSkillTrigger",
    });
    const skill: Skill = { id: "test", name: "test", trigger, effects: [{ type: "attack", value: 0.25 }] };
    expect(() => resolveSkillEffects([skill], "shield")).toThrow(UnsupportedSkillTriggerError);
  });

  it("always 携带未确认生命周期也不能被当作普通常驻技能计算", () => {
    const base: Skill = { id: "test", name: "test", trigger: { type: "always" }, effects: [{ type: "attack", value: 0.25 }] };
    for (const skill of [
      { ...base, lifecycle: { durationRounds: 3, refreshMode: "refresh" as const } },
      { ...base, effects: [{ ...base.effects[0]!, lifecycle: { maxStacks: 8, decayRate: 0.85 } }] },
    ]) {
      expect(() => resolveSkillEffects([skill], "shield")).toThrow(UnsupportedSkillLifecycleError);
    }
  });

  it("damageIncrease、extraDamage、extraAttack 分别保存，只有普通增伤进入乘区", () => {
    const skill: Skill = {
      id: "synthetic-extra-effects", name: "结构测试", trigger: { type: "always" },
      effects: [
        { type: "damageIncrease", value: 0.2 },
        { type: "extraDamage", value: 0.6 },
        { type: "extraAttack", value: 1 },
      ],
    };
    const resolved = resolveSkillEffects([skill], "marksman");
    const aggregate = aggregateMultipliers(resolved, { troopType: "marksman", damageChannel: "base" });
    expect(aggregate.combinedMultiplier).toBe(1.2);
    expect(aggregate.deferredExtraDamageEffects.map((effect) => effect.type)).toEqual(["extraDamage"]);
    expect(aggregate.deferredExtraAttackEffects.map((effect) => effect.type)).toEqual(["extraAttack"]);
    const single = calculateBattleDamageFromCatalog({
      troops: [{ troopType: "marksman", troopLevelId: "T10", troopCount: 10_000, stats: { attackPercent: 0, penetrationPercent: 0 } }],
      bodyHeroIds: ["hero.body.test"],
    }, {
      heroCatalog: { get: () => ({ id: "hero.body.test", name: "结构测试", role: "body", tier: "C", generation: null, troopType: null, status: "supported", supported: true, skill, bodySkill: skill, bodySkillDefinition: { id: "body-skill-record.hero.body.test", name: skill.name, status: "supported", supported: true, skill, effectData: [{ id: "test.effect.0", status: "supported", type: "damageIncrease", value: 0.2, rawDescription: "测试" }, { id: "test.effect.1", status: "supported", type: "extraDamage", value: 0.6, rawDescription: "测试" }, { id: "test.effect.2", status: "supported", type: "extraAttack", value: 1, rawDescription: "测试" }], rawDescription: "测试", notes: [] }, headSkills: [], notes: [] }) },
    });
    const battle = calculateBearBattleTotalDamageFromSingleRound(single);
    for (const round of battle.rounds) {
      expect(round.activeEffects.deferredExtraAttackEffectsByTroop?.marksman?.[0]?.type).toBe("extraAttack");
      expect(round.activeEffects.deferredExtraDamageEffectsByTroop.marksman?.[0]?.type).toBe("extraDamage");
      expect(round.activeEffects.instances?.map((active) => active.effect.type)).toEqual(["damageIncrease"]);
      expect(round.singleRoundResult.troopDamages.marksman?.multipliers.combined).toBe(1.2);
    }
  });
});
