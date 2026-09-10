import type { BattleDamageResult } from "../../domain/battleDamage";
import type { ActiveEffect } from "../../domain/battleState";
import type { BearBattleDamageInput } from "../../domain/bearBattle";
import type { TransientSkillEffect } from "../../domain/probability";
import type { Skill, SkillEffect } from "../../domain/skill";
import { calculateBattleDamageWithAdditionalSkills } from "../../app/calculateBattleDamage";
import type { BattleDamageRuntimeOptions } from "../battle/calculateBattleDamage";
import { validateActiveEffect } from "../rounds/activeEffects";
import { isActiveEffectEffectiveInRound } from "./createDurationProbabilityEvent";
import { UnsupportedProbabilityStateError } from "./errors";
import { BEAR_BATTLE_TOTAL_ROUNDS } from "../../rulesets/bear/battle/constants";

/**
 * 把已经触发且仍有效的状态实例转换为常驻输入，再交给现有伤害引擎。
 * 线性叠层按显式valuePerStack结算；没有该字段的多层实例会明确报错。
 * 字段完整的extraDamage保持其basis/category/乘区元数据并进入同一伤害引擎。
 */
export function calculateDamageForProbabilityState(
  input: BearBattleDamageInput,
  activeEffects: readonly ActiveEffect[],
  transientEffects: readonly TransientSkillEffect[] = [],
  round?: number,
  additionalAlwaysSkills: readonly Skill[] = [],
  calculateWithAdditionalSkills: ProbabilityStateDamageCalculator =
    calculateBattleDamageWithAdditionalSkills,
): BattleDamageResult {
  const effectiveActiveEffects =
    round === undefined
      ? activeEffects
      : activeEffects.filter((active) =>
          isActiveEffectEffectiveInRound(active, round),
        );
  const currentRound = round ?? 1;
  return calculateWithAdditionalSkills(
    input,
    [
      ...materializeRoundSkills(additionalAlwaysSkills, currentRound, "shield"),
      ...effectiveActiveEffects.map(activeEffectToRuntimeSkill),
      ...transientEffects.map(transientEffectToRuntimeSkill),
    ],
    {
      round: currentRound,
      initialState: {
        currentRound,
        totalRounds: BEAR_BATTLE_TOTAL_ROUNDS,
        status: "ready",
        activeEffects: effectiveActiveEffects,
      },
    },
  );
}

function materializeRoundSkills(skills:readonly Skill[],round:number,enemyTroopType:import("../../domain/troop").TroopType):readonly Skill[]{
  return skills.flatMap((skill)=>{
    const effects=skill.effects.flatMap((effect)=>{
      if(effect.activeRounds!==undefined&&!effect.activeRounds.includes(round))return [];
      const value=effect.valueByRound?.[round-1]??effect.valueByEnemyTroop?.[enemyTroopType]??effect.value;
      const {activeRounds:_a,valueByRound:_v,valueByEnemyTroop:_e,...rest}=effect;
      return [{...rest,value}];
    });
    return effects.length===0?[]:[{...skill,effects}];
  });
}

export type ProbabilityStateDamageCalculator = (
  input: BearBattleDamageInput,
  additionalSkills: readonly Skill[],
  runtimeOptions: BattleDamageRuntimeOptions,
) => BattleDamageResult;

function transientEffectToRuntimeSkill(
  transient: TransientSkillEffect,
): Skill {
  return {
    // 保留真实来源技能ID，使extraDamage/extraAttack与触发链解释可追踪。
    id: transient.sourceSkillId,
    name: `TransientEffect:${transient.sourceSkillName}`,
    status: "supported",
    effects: [
      {
        ...transient.effect,
        status: "supported",
      },
    ],
    trigger: { type: "always" },
  };
}

function activeEffectToRuntimeSkill(active: ActiveEffect): Skill {
  validateActiveEffect(active);
  if (
    active.stackCount !== 1 &&
    (active.refreshMode !== "stack" || active.valuePerStack === undefined)
  ) {
    throw new UnsupportedProbabilityStateError(
      `ActiveEffect ${active.id} 的 stackCount=${active.stackCount}；叠层数值语义尚未确认。`,
    );
  }

  const effectiveValue =
    active.refreshMode === "stack" && active.valuePerStack !== undefined
      ? active.valuePerStack * active.stackCount
      : active.effect.value;

  const effect: SkillEffect = {
    ...active.effect,
    value: effectiveValue,
    ...(active.appliesToTroop === undefined
      ? active.effect.targetTroop === undefined
        ? {}
        : { targetTroop: active.effect.targetTroop }
      : { targetTroop: active.appliesToTroop }),
  };

  return {
    id: `runtime.active-effect.${active.id}`,
    name: `ActiveEffect:${active.sourceSkillId}`,
    effects: [effect],
    trigger: { type: "always" },
  };
}
