import type {
  ProbabilityInstanceAggregation,
  Skill,
} from "../../domain/skill";
import { InvalidProbabilityError } from "./errors";
import { validateProbability } from "./probabilityMath";

export function getProbabilityOnlyAggregation(
  skill: Skill,
): ProbabilityInstanceAggregation | undefined {
  return skill.trigger.type === "probability"
    ? skill.trigger.instanceAggregation
    : undefined;
}

/**
 * 把共享同一非叠幅状态的多个独立实例合并成一次 Bernoulli 事件。
 * P(active) = 1 - Π(1-p_i)^(attempts_i)，效果幅度只保留一份。
 */
export function combineProbabilityOnlySkillInstances(
  skills: readonly Skill[],
): readonly Skill[] {
  const groups = new Map<string, Skill[]>();
  for (const skill of skills) {
    const aggregation = getProbabilityOnlyAggregation(skill);
    if (aggregation === undefined) continue;
    const group = groups.get(aggregation.groupId);
    if (group === undefined) groups.set(aggregation.groupId, [skill]);
    else group.push(skill);
  }

  const emittedGroups = new Set<string>();
  const result: Skill[] = [];
  for (const skill of skills) {
    const aggregation = getProbabilityOnlyAggregation(skill);
    if (aggregation === undefined) {
      result.push(skill);
      continue;
    }
    if (emittedGroups.has(aggregation.groupId)) continue;
    emittedGroups.add(aggregation.groupId);
    const group = groups.get(aggregation.groupId)!;
    result.push(group.length === 1 ? group[0]! : combineGroup(group, aggregation.groupId));
  }
  return result;
}

function combineGroup(skills: readonly Skill[], groupId: string): Skill {
  const first = skills[0]!;
  if (first.trigger.type !== "probability") {
    throw new InvalidProbabilityError(`概率合并组 ${groupId} 包含非概率技能。`);
  }
  const expectedOutcome = probabilityOnlyOutcomeKey(first);
  let noneProbability = 1;
  for (const skill of skills) {
    if (skill.trigger.type !== "probability") {
      throw new InvalidProbabilityError(`概率合并组 ${groupId} 包含非概率技能。`);
    }
    const aggregation = skill.trigger.instanceAggregation;
    if (
      aggregation?.groupId !== groupId ||
      aggregation.stackingMode !== "probabilityOnly" ||
      aggregation.magnitudeStacking !== false
    ) {
      throw new InvalidProbabilityError(`概率合并组 ${groupId} 的实例聚合配置不一致。`);
    }
    if (probabilityOnlyOutcomeKey(skill) !== expectedOutcome) {
      throw new InvalidProbabilityError(
        `概率合并组 ${groupId} 的效果、时序或生命周期不一致，不能安全合并。`,
      );
    }
    validateProbability(skill.trigger.probability, `${groupId}.${skill.id}`);
    const attempts = skill.trigger.attemptsPerRound ?? 1;
    if (!Number.isSafeInteger(attempts) || attempts < 1) {
      throw new InvalidProbabilityError(`概率合并组 ${groupId} 的判定次数必须是正整数。`);
    }
    noneProbability *= (1 - skill.trigger.probability) ** attempts;
  }

  return {
    ...first,
    id: `skill.probability-group.${groupId}`,
    name: `${first.name}（${skills.length}实例概率合并）`,
    trigger: {
      ...first.trigger,
      probability: 1 - noneProbability,
      attemptsPerRound: 1,
    },
  };
}

/** 排除概率值、判定次数和技能身份；其余结算语义必须完全相同。 */
function probabilityOnlyOutcomeKey(skill: Skill): string {
  if (skill.trigger.type !== "probability") return "not-probability";
  const {
    probability: _probability,
    attemptsPerRound: _attempts,
    instanceAggregation: _aggregation,
    ...schedule
  } = skill.trigger;
  return JSON.stringify({
    schedule,
    lifecycle: skill.lifecycle ?? null,
    effects: skill.effects.map((effect) => {
      const {
        status: _status,
        rawDescription: _rawDescription,
        pendingReason: _pendingReason,
        ...mechanics
      } = effect;
      return mechanics;
    }),
  });
}
