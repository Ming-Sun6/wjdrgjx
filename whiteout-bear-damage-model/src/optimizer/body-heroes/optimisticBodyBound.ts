import type { Skill } from "../../domain/skill";
import type { TroopType } from "../../domain/troop";

const TROOP_TYPES: readonly TroopType[] = ["shield", "lancer", "marksman"];

/** 当前v0.1非负车身效果相对于既有伤害的严格乐观倍率。 */
export function optimisticBodyFactorForTroop(
  skills: readonly Skill[],
  troopType: TroopType,
): number {
  const sums = new Map<string, number>();
  for (const skill of skills) {
    for (const effect of skill.effects) {
      if (effect.targetTroop !== undefined && effect.targetTroop !== "all" && effect.targetTroop !== troopType) continue;
      if (effect.value <= 0) continue;
      sums.set(effect.type, (sums.get(effect.type) ?? 0) + optimisticExpectedEffectValue(skill, effect.value));
    }
  }
  return [...sums.values()].reduce((product, value) => product * (1 + value), 1);
}

export function optimisticBodyUpperBound(
  skills: readonly Skill[],
  baselineTroopDamage: Readonly<Record<TroopType, number>>,
): number {
  return TROOP_TYPES.reduce(
    (total, troopType) => total + baselineTroopDamage[troopType] * optimisticBodyFactorForTroop(skills, troopType),
    0,
  );
}

export function optimisticBodyGlobalFactor(skills: readonly Skill[]): number {
  return Math.max(...TROOP_TYPES.map((troopType) => optimisticBodyFactorForTroop(skills, troopType)));
}

function optimisticExpectedEffectValue(skill: Skill, value: number): number {
  if (skill.trigger.type !== "probability") return value;
  const attempts = skill.trigger.attemptsPerRound ?? 1;
  const successProbability = 1 - (1 - skill.trigger.probability) ** attempts;
  const duration = skill.lifecycle?.durationRounds ?? skill.trigger.durationRounds ?? 1;
  if (skill.lifecycle?.refreshMode === "refresh" && duration > 1) {
    return value * (1 - (1 - successProbability) ** duration);
  }
  return value * successProbability;
}
