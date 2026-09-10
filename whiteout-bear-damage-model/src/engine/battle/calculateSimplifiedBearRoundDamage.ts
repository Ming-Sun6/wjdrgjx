import type {
  AppliedSkillSummary,
  BattleDamageInput,
  BattleDamageResult,
  BattleTroopDamageResult,
  SelectedBodyHero,
} from "../../domain/battleDamage";
import type {
  HeroCatalog,
  HeadHeroCatalog,
  SupportedHeroDefinition,
} from "../../domain/hero";
import type { Skill } from "../../domain/skill";
import type { TroopType } from "../../domain/troop";
import { calculateBaseTotalDamage } from "../../rulesets/bear/base-damage/calculateBaseTotalDamage";
import { createDamageBreakdown } from "../damage/resolveDamageComponent";
import { resolveHeadHeroSkills } from "../heroes/resolveHeadHeroSkills";
import { applyBearSkillsToBaseTroopDamage } from "../skills/calculateTroopDamageWithMultipliers";
import {
  TooManyBodyHeroesError,
  UnknownBodyHeroError,
  UnsupportedBodyHeroError,
} from "./errors";

export interface SimplifiedBearDamageDependencies {
  readonly heroCatalog: HeroCatalog;
  readonly headHeroCatalog?: HeadHeroCatalog;
}

export interface SimplifiedBearRoundOptions {
  readonly round?: number;
  readonly ignoreNonAlwaysCatalogSkills?: boolean;
}

/**
 * 当前正式打熊模型的单回合入口。
 *
 * 这里只解析基础伤害、普通乘区与同区加算的 extraDamage；不会创建 AttackEvent，
 * 也不会结算 extraAttack。旧事件引擎继续保留，但不属于当前正式口径。
 */
export function calculateSimplifiedBearRoundDamage(
  input: BattleDamageInput,
  dependencies: SimplifiedBearDamageDependencies,
  additionalSkills: readonly Skill[] = [],
  options: SimplifiedBearRoundOptions = {},
): BattleDamageResult {
  if (input.bodyHeroIds.length > 4) {
    throw new TooManyBodyHeroesError(input.bodyHeroIds.length);
  }

  const heroes = input.bodyHeroIds.map((heroId) => {
    const hero = dependencies.heroCatalog.get(heroId);
    if (hero === undefined || hero.role !== "body") {
      throw new UnknownBodyHeroError(heroId);
    }
    if (hero.status !== "supported") {
      throw new UnsupportedBodyHeroError(heroId, hero.status, hero.notes);
    }
    return hero;
  });
  const selectedBodyHeroes = createSelectedBodyHeroes(heroes);
  const headResolution = resolveHeadHeroSkills(
    input.headFormation ?? {},
    dependencies.headHeroCatalog,
  );
  const catalogSkills = [
    ...heroes.map((hero) => hero.bodySkill),
    ...headResolution.skills,
  ];
  const round = options.round ?? 1;
  const skills = materializeSkillsForRound(
    [
      ...(options.ignoreNonAlwaysCatalogSkills
        ? catalogSkills.filter((skill) => skill.trigger.type === "always")
        : catalogSkills),
      ...additionalSkills,
    ],
    round,
  );
  const appliedSkills: readonly AppliedSkillSummary[] = [
    ...heroes.map((hero) => ({
      source: "body" as const,
      heroId: hero.id,
      heroName: hero.name,
      skillId: hero.bodySkill.id,
      skillName: hero.bodySkill.name,
    })),
    ...headResolution.appliedSkills,
    ...additionalSkills.map((skill) => ({
      source: "runtime" as const,
      heroId: null,
      heroName: null,
      skillId: skill.id,
      skillName: skill.name,
    })),
  ];
  const baseResult = calculateBaseTotalDamage({ troops: input.troops });
  const troopDamages: Partial<Record<TroopType, BattleTroopDamageResult>> = {};

  for (const baseTroopResult of baseResult.troopResults) {
    const calculation = applyBearSkillsToBaseTroopDamage(baseTroopResult, skills);
    if (calculation.multipliers.deferredExtraAttackEffects.length > 0) {
      throw new Error(
        "当前正式打熊模型不结算 extraAttack；请在数据适配层映射为已确认的 extraDamage。",
      );
    }
    const troopType = baseTroopResult.troopType;
    const existing = troopDamages[troopType];
    const appliedEffects = calculation.resolvedEffects.filter(
      (effect) => effect.type !== "extraAttack",
    );

    if (existing === undefined) {
      troopDamages[troopType] = {
        troopType,
        baseDamage: baseTroopResult.damage,
        damageBreakdown: calculation.damageBreakdown,
        finalDamage: calculation.damage,
        multipliers: {
          byEffectType: calculation.multipliers.multiplierByEffectType,
          combined: calculation.multipliers.combinedMultiplier,
        },
        sourceResults: [baseTroopResult],
        deferredExtraDamageEffects:
          calculation.multipliers.deferredExtraDamageEffects,
        extraDamageComponents: calculation.extraDamageComponents,
        deferredExtraAttackEffects: [],
        attacks: [],
        primaryAttackDamage: calculation.damageBreakdown.normalDamage,
        extraAttackDamage: 0,
        appliedEffects,
      };
      continue;
    }

    const damageBreakdown = createDamageBreakdown(
      existing.damageBreakdown.normalDamage +
        calculation.damageBreakdown.normalDamage,
      existing.damageBreakdown.extraDamage +
        calculation.damageBreakdown.extraDamage,
    );
    troopDamages[troopType] = {
      ...existing,
      baseDamage: existing.baseDamage + baseTroopResult.damage,
      damageBreakdown,
      finalDamage: damageBreakdown.totalDamage,
      sourceResults: [...existing.sourceResults, baseTroopResult],
      deferredExtraDamageEffects: [
        ...existing.deferredExtraDamageEffects,
        ...calculation.multipliers.deferredExtraDamageEffects,
      ],
      extraDamageComponents: [
        ...existing.extraDamageComponents,
        ...calculation.extraDamageComponents,
      ],
      primaryAttackDamage:
        existing.primaryAttackDamage + calculation.damageBreakdown.normalDamage,
      appliedEffects: [...(existing.appliedEffects ?? []), ...appliedEffects],
    };
  }

  const damageBreakdown = Object.values(troopDamages).reduce(
    (sum, result) =>
      createDamageBreakdown(
        sum.normalDamage + result.damageBreakdown.normalDamage,
        sum.extraDamage + result.damageBreakdown.extraDamage,
      ),
    createDamageBreakdown(0, 0),
  );

  return {
    totalTroopCount: baseResult.totalTroopCount,
    selectedBodyHeroes,
    selectedHeadHeroes: headResolution.selectedHeadHeroes,
    appliedSkills,
    skippedSkills: headResolution.skippedSkills,
    baseDamage: baseResult.totalDamage,
    damageBreakdown,
    attacks: [],
    primaryAttackDamage: damageBreakdown.totalDamage,
    extraAttackDamage: 0,
    finalDamage: damageBreakdown.totalDamage,
    troopDamages,
  };
}

function materializeSkillsForRound(
  skills: readonly Skill[],
  round: number,
): readonly Skill[] {
  return skills.flatMap((skill) => {
    const effects = skill.effects.flatMap((effect) => {
      if (
        effect.activeRounds !== undefined &&
        !effect.activeRounds.includes(round)
      ) {
        return [];
      }
      const value =
        effect.valueByRound?.[round - 1] ??
        effect.valueByEnemyTroop?.shield ??
        effect.value;
      const {
        activeRounds: _activeRounds,
        valueByRound: _valueByRound,
        valueByEnemyTroop: _valueByEnemyTroop,
        ...rest
      } = effect;
      return [{ ...rest, value }];
    });
    return effects.length === 0 ? [] : [{ ...skill, effects }];
  });
}

function createSelectedBodyHeroes(
  heroes: readonly SupportedHeroDefinition[],
): readonly SelectedBodyHero[] {
  return heroes.map((hero, slotIndex) => ({
    slotIndex,
    heroId: hero.id,
    heroName: hero.name,
  }));
}
