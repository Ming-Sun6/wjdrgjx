import type {
  AppliedSkillSummary,
  HeadFormation,
  SelectedHeadHero,
  SkippedSkillSummary,
} from "../../domain/battleDamage";
import type { HeadHeroCatalog, HeadHeroId } from "../../domain/hero";
import type { Skill } from "../../domain/skill";
import type { TroopType } from "../../domain/troop";
import {
  IncompatibleHeadHeroSlotError,
  UnknownHeadHeroError,
  UnknownHeadHeroTroopTypeError,
} from "../battle/errors";

export interface ResolvedHeadHeroSkills {
  readonly selectedHeadHeroes: readonly SelectedHeadHero[];
  readonly skills: readonly Skill[];
  readonly appliedSkills: readonly AppliedSkillSummary[];
  readonly skippedSkills: readonly SkippedSkillSummary[];
}

const HEAD_SLOTS = [
  { slot: "shield", field: "shieldHeroId" },
  { slot: "lancer", field: "lancerHeroId" },
  { slot: "marksman", field: "marksmanHeroId" },
] as const satisfies readonly {
  readonly slot: TroopType;
  readonly field: keyof HeadFormation;
}[];

/**
 * 只根据结构化数据收集技能；没有任何具体英雄 ID 或名称判断。
 * pending/unsupported 技能会留下解释记录，但不会进入 SkillResolver。
 */
export function resolveHeadHeroSkills(
  formation: HeadFormation,
  catalog: HeadHeroCatalog | undefined,
): ResolvedHeadHeroSkills {
  const selectedHeadHeroes: SelectedHeadHero[] = [];
  const skills: Skill[] = [];
  const appliedSkills: AppliedSkillSummary[] = [];
  const skippedSkills: SkippedSkillSummary[] = [];

  for (const { slot, field } of HEAD_SLOTS) {
    const heroId = formation[field];
    if (heroId === undefined) continue;
    const hero = catalog?.get(heroId);
    if (hero === undefined) throw new UnknownHeadHeroError(heroId);
    if (hero.troopType === null) {
      throw new UnknownHeadHeroTroopTypeError(heroId);
    }
    if (hero.troopType !== slot) {
      throw new IncompatibleHeadHeroSlotError(heroId, hero.troopType, slot);
    }

    selectedHeadHeroes.push({
      slot,
      heroId,
      heroName: hero.name,
      troopType: hero.troopType,
    });

    for (const definition of hero.headSkills) {
      if (definition.status === "supported") {
        skills.push(definition.skill);
        appliedSkills.push({
          source: "head",
          heroId,
          heroName: hero.name,
          skillId: definition.skill.id,
          skillName: definition.skill.name,
        });
        continue;
      }

      skippedSkills.push({
        source: "head",
        heroId,
        heroName: hero.name,
        skillRecordId: definition.id,
        skillId: definition.skill?.id ?? null,
        skillName: definition.skill?.name ?? definition.name,
        status: definition.status,
        reason:
          definition.notes.length === 0
            ? `技能状态为 ${definition.status}。`
            : definition.notes.join("；"),
      });
    }
  }

  return {
    selectedHeadHeroes,
    skills,
    appliedSkills,
    skippedSkills,
  };
}
