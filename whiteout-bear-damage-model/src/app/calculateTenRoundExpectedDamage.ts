import { calculateSimplifiedBearRoundDamage } from "../engine/battle/calculateSimplifiedBearRoundDamage";
import { resolveHeadHeroSkills } from "../engine/heroes/resolveHeadHeroSkills";
import {
  calculateDamageForProbabilityState,
  createDurationProbabilityEvent,
  createExtraDamageProbabilityEvent,
  createExpectedBattleDamageCalculator,
  createInstantProbabilityEvent,
  createPeriodicExtraDamageScenario,
  createPeriodicStackingScenario,
  advanceDurationEffectsAfterRound,
  combineProbabilityOnlySkillInstances,
} from "../engine/probability";
import { resolveSupportedCatalogEffects } from "../engine/skills/resolveSupportedCatalogEffects";
import { bodyHeroCatalog } from "../game-data/heroes/bodyHeroCatalog";
import { headHeroCatalog } from "../game-data/heroes/headHeroCatalog";
import { getTroopSkillById } from "../game-data/troop-skills/troopSkillQueries";
import { resolveAutomaticTroopSkills } from "../game-data/troop-skills/automaticTroopSkills";
import { prepareBattleModifiers } from "../systems/preparation";
import { resolveBattleReportAdjustedInput } from "../systems/reportHeroAdjustment";
import type {
  AppliedRealSkill,
  SkippedRealSkill,
  TenRoundExpectedDamageDependencies,
  TenRoundExpectedDamageInput,
  TenRoundExpectedDamageOptions,
  TenRoundExpectedDamageResult,
} from "../domain/tenRoundExpectedDamage";
import type { BearBattleContext } from "../domain/bearBattle";
import type { BearBattleDamageInput } from "../domain/bearBattle";
import type {
  BernoulliStateTransition,
  ExactProbabilityScenario,
} from "../domain/probability";
import type { Skill, SkillEffectData } from "../domain/skill";
import type { TroopSkillDefinition } from "../domain/troopSkill";
import {
  DuplicateFireCrystalSkillError,
  UnknownFireCrystalSkillError,
  UnsupportedRealSkillScheduleError,
} from "./tenRoundExpectedDamageErrors";
import {
  createBearBattleContext,
} from "../rulesets/bear/battle";

const DEFAULT_DEPENDENCIES: TenRoundExpectedDamageDependencies = {
  heroCatalog: bodyHeroCatalog,
  headHeroCatalog,
  getTroopSkillById,
};

/** 即使没有随机技能也逐回合结算，确保activeRounds/valueByRound按真实回合生效。 */
const EMPTY_EXACT_SCENARIO: ExactProbabilityScenario = {
  id: "scenario.formal-bear.no-random-events",
  createRoundPlan: () => ({}),
};

/** 当前真实数据使用的正式十回合期望伤害入口。 */
export const calculateTenRoundExpectedDamage =
  createTenRoundExpectedDamageCalculator(DEFAULT_DEPENDENCIES);

export function createTenRoundExpectedDamageCalculator(
  dependencies: TenRoundExpectedDamageDependencies,
): (
  input: TenRoundExpectedDamageInput,
  options?: TenRoundExpectedDamageOptions,
) => TenRoundExpectedDamageResult {
  return (input, options = {}) => {
    const reportResolution = resolveBattleReportAdjustedInput(input);
    const { fireCrystal, preparation, ...unpreparedBattleInput } = reportResolution.input;
    const prepared = preparation === undefined ? undefined : prepareBattleModifiers(
      unpreparedBattleInput.troops,
      unpreparedBattleInput.headFormation ?? {},
      preparation,
    );
    const battleInputBase = { ...unpreparedBattleInput, damageChannel: unpreparedBattleInput.damageChannel ?? "normalAttack" as const };
    const battleInput = prepared === undefined ? battleInputBase : {
      ...battleInputBase,
      troops: unpreparedBattleInput.troops.map((troop) => ({
        ...troop,
        troopCount: prepared.troopCounts[troop.troopType],
      })),
    };
    const requestedTroopSkills = resolveSelectedTroopSkills(
      fireCrystal?.skillIds ?? [],
      dependencies,
    );
    const battleContext = createBearBattleContext(options);
    const automaticSkills = resolveAutomaticTroopSkills(
      battleInput.troops,
      preparation?.troopSkillLevels,
    );
    const automaticRecordIds = new Set(
      automaticSkills.flatMap((skill) =>
        skill.sourceRecordId === undefined ? [] : [skill.sourceRecordId],
      ),
    );
    const selectedTroopSkills = requestedTroopSkills.filter(
      (definition) => !automaticRecordIds.has(definition.id),
    );
    const fireResolution = resolveFireCrystalSkillsForBear(
      selectedTroopSkills,
      battleContext,
    );
    const headForScheduling = resolveHeadHeroSkills(battleInput.headFormation ?? {}, dependencies.headHeroCatalog);
    const bodyForScheduling = battleInput.bodyHeroIds.map((heroId) => {
      const hero=dependencies.heroCatalog.get(heroId);
      if(hero===undefined||hero.role!=="body"||hero.status!=="supported") throw new Error(`车身英雄 ${heroId} 不可用于调度。`);
      return hero.bodySkill;
    });
    const catalogDynamicSkills=[...bodyForScheduling,...headForScheduling.skills].filter(skill=>skill.trigger.type!=="always");
    const allAdditionalSkills = [...fireResolution.skills, ...automaticSkills, ...(prepared?.skills ?? [])];
    const staticSkills = allAdditionalSkills.filter(
      (skill) => skill.trigger.type === "always",
    );
    const dynamicSkills = [...catalogDynamicSkills, ...allAdditionalSkills.filter(
      (skill) => skill.trigger.type !== "always",
    )];
    const calculationDynamicSkills = combineProbabilityOnlySkillInstances(dynamicSkills);
    const dynamicScenarios = calculationDynamicSkills.map((skill, index) =>
      compileSupportedSkillScenario(skill, `instance.${index}`),
    );
    const scenario = combineScenarios([
      ...(options.scenario === undefined ? [] : [options.scenario]),
      ...dynamicScenarios,
    ]) ?? EMPTY_EXACT_SCENARIO;
    const catalogDependencies = {
      heroCatalog: dependencies.heroCatalog,
      headHeroCatalog: dependencies.headHeroCatalog,
    };
    const calculateWithAdditionalSkills: import("../engine/probability/damage").ProbabilityStateDamageCalculator = (
      stateInput,
      additionalSkills,
      runtimeOptions,
    ) =>
      calculateSimplifiedBearRoundDamage(
        stateInput,
        catalogDependencies,
        additionalSkills,
        {
          ...(runtimeOptions.round === undefined
            ? {}
            : { round: runtimeOptions.round }),
          ignoreNonAlwaysCatalogSkills: true,
        },
      );
    const calculateExpected = createExpectedBattleDamageCalculator({
      calculateDamageForState: (
        stateInput,
        activeEffects,
        transientEffects,
        round,
      ) =>
        calculateDamageForProbabilityState(
          stateInput,
          activeEffects,
          transientEffects,
          round,
          staticSkills,
          calculateWithAdditionalSkills,
        ),
    });
    const { scenario: _inputScenario, ...baseOptions } = options;
    const expected = calculateExpected(
      battleInput,
      { ...baseOptions, scenario },
    );
    const headResolution = resolveHeadHeroSkills(
      battleInput.headFormation ?? {},
      dependencies.headHeroCatalog,
    );
    const appliedSkills = [
      ...collectAppliedSkills(
      battleInput.bodyHeroIds,
      dependencies,
      headResolution.appliedSkills,
      fireResolution.skills,
      selectedTroopSkills,
      ),
      ...automaticSkills.map((skill) => ({ source: automaticSkillSource(skill), ownerId: skill.effects[0]?.targetTroop ?? "all", recordId: skill.sourceRecordId ?? skill.id, skillId: skill.id, skillName: skill.name })),
      ...(prepared?.skills.map((skill) => ({ source: "system" as const, ownerId: "battle-preparation", recordId: skill.id, skillId: skill.id, skillName: skill.name })) ?? []),
    ];
    const skipped = collectSkippedSkills(
      headResolution.skippedSkills,
      fireResolution.skipped,
    );
    const skippedPendingSkills = skipped.filter(
      (entry) => entry.status === "pending",
    );
    const unsupportedSkills = skipped.filter(
      (entry) => entry.status === "unsupported",
    );

    return {
      ...expected,
      expectedDamageByRound: expected.expectedRoundDamage,
      expectedDamageByTroop: {
        shield: expected.expectedShieldDamage,
        lancer: expected.expectedLancerDamage,
        marksman: expected.expectedMarksmanDamage,
      },
      damageBreakdown: {
        baseDamage: expected.expectedBaseDamage,
        skillDamage: expected.expectedSkillDamage,
        normalDamage: expected.expectedNormalDamage,
        extraDamage: expected.expectedExtraDamage,
        primaryAttackDamage: expected.expectedPrimaryAttackDamage,
        extraAttackDamage: expected.expectedExtraAttackDamage,
        totalDamage: expected.expectedTotalDamage,
      },
      appliedSkills,
      skippedPendingSkills,
      unsupportedSkills,
      roundSkillExplanations: createRoundSkillExplanations(
        expected.expectedRoundDamage,
        appliedSkills,
        skippedPendingSkills,
      ),
      ...(prepared === undefined ? {} : { preparation: prepared }),
      ...(reportResolution.adjustments === undefined
        ? {}
        : { battleReportHeroAdjustments: reportResolution.adjustments }),
    };
  };
}

function automaticSkillSource(skill:Skill): "troopTierSkill" | "fireCrystal" {
  return skill.sourceKind === "troopTierSkill" || skill.id.includes("lancer.t12")
    ? "troopTierSkill"
    : "fireCrystal";
}

interface FireCrystalResolution {
  readonly skills: readonly Skill[];
  readonly skipped: readonly SkippedRealSkill[];
}

function resolveSelectedTroopSkills(
  skillIds: readonly import("../domain/troopSkill").TroopSkillId[],
  dependencies: TenRoundExpectedDamageDependencies,
): readonly TroopSkillDefinition[] {
  const seen = new Set<string>();
  return skillIds.map((skillId) => {
    if (seen.has(skillId)) throw new DuplicateFireCrystalSkillError(skillId);
    seen.add(skillId);
    const definition = dependencies.getTroopSkillById(skillId);
    if (definition === undefined) throw new UnknownFireCrystalSkillError(skillId);
    return definition;
  });
}

function resolveFireCrystalSkillsForBear(
  definitions: readonly TroopSkillDefinition[],
  battleContext: BearBattleContext,
): FireCrystalResolution {
  const skills: Skill[] = [];
  const skipped: SkippedRealSkill[] = [];

  for (const original of definitions) {
    const definition = withResolvedBearEnemyCondition(
      original,
      battleContext.enemyTroopType,
    );
    const resolution = resolveSupportedCatalogEffects(definition);
    skills.push(...resolution.skills);
    for (const skippedEffect of resolution.skippedEffects) {
      skipped.push({
        source: "fireCrystal",
        ownerId: definition.troopType,
        recordId: definition.id,
        effectId: skippedEffect.effectId,
        skillName: definition.name,
        status: skippedEffect.status,
        reason: skippedEffect.reason,
      });
    }
    if (definition.effects.length === 0 && definition.status !== "supported") {
      skipped.push({
        source: "fireCrystal",
        ownerId: definition.troopType,
        recordId: definition.id,
        effectId: null,
        skillName: definition.name,
        status: definition.status,
        reason:
          definition.status === "pending"
            ? definition.pendingReason
            : definition.unsupportedReason,
      });
    }
  }
  return { skills, skipped };
}

/** 熊固定为shield；只解析数据中的敌方兵种条件，不按技能名称判断。 */
function withResolvedBearEnemyCondition(
  definition: TroopSkillDefinition,
  enemyTroopType: BearBattleContext["enemyTroopType"],
): TroopSkillDefinition {
  const effects = definition.effects.flatMap((effect) => {
    if (effect.status !== "supported") return [effect];
    if (
      effect.targetEnemyTroop !== undefined &&
      effect.targetEnemyTroop !== "all" &&
      effect.targetEnemyTroop !== enemyTroopType
    ) {
      return [];
    }
    if (
      effect.conditions?.some(
        (condition) =>
          condition.type === "enemyTroopType" &&
          condition.troopType !== enemyTroopType,
      ) === true
    ) {
      return [];
    }
    const { conditions, ...withoutConditions } = effect;
    const remainingConditions = conditions?.filter(
      (condition) => condition.type !== "enemyTroopType",
    );
    return [
      {
        ...withoutConditions,
        ...(remainingConditions === undefined || remainingConditions.length === 0
          ? {}
          : { conditions: remainingConditions }),
      },
    ];
  });
  return { ...definition, effects } as TroopSkillDefinition;
}

function collectAppliedSkills(
  bodyHeroIds: TenRoundExpectedDamageInput["bodyHeroIds"],
  dependencies: TenRoundExpectedDamageDependencies,
  headSkills: readonly import("../domain/battleDamage").AppliedSkillSummary[],
  fireSkills: readonly Skill[],
  selectedTroopSkills: readonly TroopSkillDefinition[],
): readonly AppliedRealSkill[] {
  const body: AppliedRealSkill[] = bodyHeroIds.map((heroId) => {
    const hero = dependencies.heroCatalog.get(heroId);
    if (hero === undefined || hero.role !== "body" || hero.status !== "supported") {
      throw new Error(`车身英雄 ${heroId} 未通过既有计算入口校验。`);
    }
    return {
      source: "body",
      ownerId: hero.id,
      recordId: hero.bodySkillDefinition.id,
      skillId: hero.bodySkill.id,
      skillName: hero.bodySkill.name,
    };
  });
  const head: AppliedRealSkill[] = headSkills.map((skill) => {
    const heroId = skill.heroId as import("../domain/hero").HeadHeroId;
    return {
      source: "head",
      ownerId: heroId,
      recordId:
        dependencies.headHeroCatalog
          .get(heroId)
          ?.headSkills.find((record) => record.skill?.id === skill.skillId)
          ?.id ?? skill.skillId,
      skillId: skill.skillId,
      skillName: skill.skillName,
    };
  });
  const fireByRuntimeId = new Map<string, TroopSkillDefinition>(
    selectedTroopSkills.flatMap((definition) =>
      definition.effects.map((effect) => [
        `${definition.id}.${effect.id}`,
        definition,
      ] as const),
    ),
  );
  const fire: AppliedRealSkill[] = fireSkills.map((skill) => {
    const definition = fireByRuntimeId.get(skill.id);
    if (definition === undefined) {
      throw new Error(`无法追踪火晶技能来源：${skill.id}。`);
    }
    return {
      source: "fireCrystal",
      ownerId: definition.troopType,
      recordId: definition.id,
      skillId: skill.id,
      skillName: definition.name,
    };
  });
  return [...body, ...head, ...fire];
}

function collectSkippedSkills(
  headSkills: readonly import("../domain/battleDamage").SkippedSkillSummary[],
  fireSkills: readonly SkippedRealSkill[],
): readonly SkippedRealSkill[] {
  return [
    ...headSkills.map((skill): SkippedRealSkill => ({
      source: "head",
      ownerId: skill.heroId,
      recordId: skill.skillRecordId,
      effectId: null,
      skillName: skill.skillName,
      status: skill.status,
      reason: skill.reason,
    })),
    ...fireSkills,
  ];
}

function compileSupportedSkillScenario(
  skill: Skill,
  instanceKey: string,
): ExactProbabilityScenario {
  if (skill.trigger.type === "probability") {
    const independentlyTargetedSkills = materializeIndependentTroopProbabilitySkills(skill);
    const events: BernoulliStateTransition[] = [];
    let transitionAfterRound:
      | ExactProbabilityScenario["transitionAfterRound"]
      | undefined;
    for (const targeted of independentlyTargetedSkills) {
      const eventSuffix = targeted.targetTroop === undefined
        ? instanceKey
        : `${instanceKey}.troop.${targeted.targetTroop}`;
      if (
        targeted.skill.lifecycle?.durationRounds !== undefined ||
        targeted.skill.effects.some((effect) => effect.lifecycle?.durationRounds !== undefined)
      ) {
        events.push(createDurationProbabilityEvent(targeted.skill, {
          sourceId: `${skill.id}.${eventSuffix}`,
          eventId: `duration.${skill.id}.${eventSuffix}`,
        }));
        transitionAfterRound = advanceDurationEffectsAfterRound;
      } else if (targeted.skill.effects.some((effect) => effect.type === "extraAttack")) {
        throw new UnsupportedRealSkillScheduleError(
          skill.id,
          "当前正式打熊模型不结算extraAttack；请由数据适配层映射为已确认的extraDamage期望。",
        );
      } else if (targeted.skill.effects.some((effect) => effect.type === "extraDamage")) {
        events.push(createExtraDamageProbabilityEvent(targeted.skill, {
          eventId: `extra-damage.${skill.id}.${eventSuffix}`,
        }));
      } else {
        events.push(createInstantProbabilityEvent(
          targeted.skill,
          `instant.${skill.id}.${eventSuffix}`,
        ));
      }
    }
    const frequency = skill.trigger.frequency;
    if (frequency !== "oncePerBattle" && frequency !== "oncePerRound" && frequency !== "explicitSchedule") {
      throw new UnsupportedRealSkillScheduleError(
        skill.id,
        "自动接入要求frequency为oncePerBattle或oncePerRound；显式调度仍需外部scenario。",
      );
    }
    const attempts = skill.trigger.attemptsPerRound ?? 1;
    if (!Number.isSafeInteger(attempts) || attempts < 1) {
      throw new UnsupportedRealSkillScheduleError(skill.id, "attemptsPerRound必须是正整数。");
    }
    return {
      id: `scenario.catalog.${skill.id}.${instanceKey}`,
      createRoundPlan: ({ round }) => ({
        beforeDamageEvents:
          frequency === "oncePerRound" || (frequency === "oncePerBattle" && round === 1) || (frequency === "explicitSchedule" && (skill.trigger.type === "probability" && skill.trigger.triggerRounds?.includes(round) === true))
            ? events.flatMap((event) =>
                Array.from({ length: attempts }, (_, index) => ({
                  ...event,
                  id: `${event.id}.attempt.${index}`,
                })),
              )
            : [],
      }),
      ...(transitionAfterRound === undefined ? {} : { transitionAfterRound }),
    };
  }

  if (skill.trigger.type === "everyNRounds") {
    return skill.effects.some((effect) => effect.type === "extraDamage")
      ? createPeriodicExtraDamageScenario(skill, {
          eventId: `periodic-extra-damage.${skill.id}.${instanceKey}`,
          scenarioId: `scenario.periodic-extra-damage.${skill.id}.${instanceKey}`,
        })
      : createPeriodicStackingScenario(skill);
  }

  throw new UnsupportedRealSkillScheduleError(
    skill.id,
    `当前自动目录适配器不单独调度${skill.trigger.type}；需要明确来源事件。`,
  );
}

function materializeIndependentTroopProbabilitySkills(
  skill: Skill,
): readonly { readonly skill: Skill; readonly targetTroop?: import("../domain/troop").TroopType }[] {
  if (skill.trigger.type !== "probability") return [{ skill }];
  const targets = skill.trigger.independentTroopTargets;
  if (targets === undefined) return [{ skill }];
  if (targets.length === 0 || new Set(targets).size !== targets.length) {
    throw new UnsupportedRealSkillScheduleError(
      skill.id,
      "independentTroopTargets必须是非空且无重复的兵种列表。",
    );
  }
  return targets.map((targetTroop) => ({
    targetTroop,
    skill: {
      ...skill,
      effects: skill.effects.map((effect) => {
        const configuredTarget = effect.targetTroop ?? "all";
        if (configuredTarget !== "all" && configuredTarget !== targetTroop) {
          throw new UnsupportedRealSkillScheduleError(
            skill.id,
            `独立${targetTroop}判定不能应用到${configuredTarget}效果。`,
          );
        }
        return { ...effect, targetTroop };
      }),
    },
  }));
}

function combineScenarios(
  scenarios: readonly ExactProbabilityScenario[],
): ExactProbabilityScenario | undefined {
  if (scenarios.length === 0) return undefined;
  if (scenarios.length === 1) return scenarios[0];
  return {
    id: `scenario.combined.${scenarios.map((scenario) => scenario.id).join("+")}`,
    createRoundPlan: (context) => {
      const plans = scenarios.map((scenario) => scenario.createRoundPlan(context));
      return {
        beforeDamageEvents: plans.flatMap((plan) => plan.beforeDamageEvents ?? []),
        afterDamageEvents: plans.flatMap((plan) => plan.afterDamageEvents ?? []),
      };
    },
    transitionAfterRound: (state, context) =>
      [...new Set(scenarios.map((scenario) => scenario.transitionAfterRound))]
        .filter(
          (transition): transition is NonNullable<
            ExactProbabilityScenario["transitionAfterRound"]
          > => transition !== undefined,
        )
        .reduce(
        (current, scenario) =>
          scenario(current, context),
        state,
      ),
  };
}

function createRoundSkillExplanations(
  rounds: readonly import("../domain/probability").ExpectedRoundDamageResult[],
  appliedSkills: readonly AppliedRealSkill[],
  skippedPendingEffects: readonly SkippedRealSkill[],
): TenRoundExpectedDamageResult["roundSkillExplanations"] {
  return rounds.map((round, index) => {
    const previous = rounds[index - 1]?.expectedActiveEffects ?? [];
    const previousById = new Map(previous.map((effect) => [effect.id, effect]));
    const currentById = new Map(
      round.expectedActiveEffects.map((effect) => [effect.id, effect]),
    );
    const newlyActiveEffects = round.expectedActiveEffects.filter((effect) => {
      const before = previousById.get(effect.id)?.activeProbability ?? 0;
      return effect.activeProbability > before;
    });
    const expiredEffects = previous.filter((effect) => {
      const current = currentById.get(effect.id)?.activeProbability ?? 0;
      return current < effect.activeProbability;
    });
    const stackChanges = round.expectedActiveEffects.flatMap((effect) => {
      const previousExpectedStackCount =
        previousById.get(effect.id)?.expectedStackCount ?? 0;
      const delta = effect.expectedStackCount - previousExpectedStackCount;
      return delta === 0
        ? []
        : [
            {
              activeEffectId: effect.id,
              sourceSkillId: effect.sourceSkillId,
              previousExpectedStackCount,
              expectedStackCount: effect.expectedStackCount,
              delta,
            },
          ];
    });

    return {
      round: round.round,
      selectedSupportedSkills: appliedSkills,
      activeEffects: round.expectedActiveEffects,
      newlyActiveEffects,
      expiredEffects,
      stackChanges,
      instantProbabilityEvents: round.instantProbabilityEvents,
      expectedAttackCount: round.expectedAttackCount,
      expectedExtraAttackDamage: round.expectedExtraAttackDamage,
      expectedExtraDamage: round.expectedExtraDamage,
      skippedPendingEffects,
    };
  });
}
