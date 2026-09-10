import type {
  HeadHeroDefinition,
  HeadHeroId,
  HeadSkillReference,
  PendingHeroSkillDefinition,
  SupportedHeroSkillDefinition,
  UnsupportedHeroSkillDefinition,
} from "../../domain/hero";
import type { TroopType } from "../../domain/troop";
import { headHeroes } from "./headHeroes";

const allHeadHeroes: readonly HeadHeroDefinition[] = Object.freeze(
  Object.values(headHeroes).sort((left, right) => {
    const troopOrder = ["shield", "lancer", "marksman"];
    const troopDifference = troopOrder.indexOf(left.troopType ?? "") - troopOrder.indexOf(right.troopType ?? "");
    if (troopDifference !== 0) return troopDifference;
    if (left.generation === null && right.generation !== null) return 1;
    if (left.generation !== null && right.generation === null) return -1;
    return (left.generation ?? 0) - (right.generation ?? 0) || left.name.localeCompare(right.name, "zh-CN");
  }),
);
const heroesById: Readonly<Record<string, HeadHeroDefinition>> = headHeroes;

function allHeadSkillReferences(): readonly HeadSkillReference[] {
  return allHeadHeroes.flatMap((hero) =>
    hero.headSkills.map((skillDefinition) => ({ hero, skillDefinition })),
  );
}

export function getAllHeadHeroes(): readonly HeadHeroDefinition[] {
  return allHeadHeroes;
}

export function getHeadHeroesByTroopType(
  troopType: TroopType,
): readonly HeadHeroDefinition[] {
  return allHeadHeroes.filter((hero) => hero.troopType === troopType);
}

export function getHeadHeroById(
  heroId: HeadHeroId,
): HeadHeroDefinition | undefined {
  return heroesById[heroId];
}

export function getSupportedHeadSkills(): readonly HeadSkillReference<SupportedHeroSkillDefinition>[] {
  return allHeadSkillReferences().filter(
    (
      reference,
    ): reference is HeadSkillReference<SupportedHeroSkillDefinition> =>
      reference.skillDefinition.status === "supported",
  );
}

export function getPendingHeadSkills(): readonly HeadSkillReference<PendingHeroSkillDefinition>[] {
  return allHeadSkillReferences().filter(
    (
      reference,
    ): reference is HeadSkillReference<PendingHeroSkillDefinition> =>
      reference.skillDefinition.status === "pending",
  );
}

export function getUnsupportedHeadSkills(): readonly HeadSkillReference<UnsupportedHeroSkillDefinition>[] {
  return allHeadSkillReferences().filter(
    (
      reference,
    ): reference is HeadSkillReference<UnsupportedHeroSkillDefinition> =>
      reference.skillDefinition.status === "unsupported",
  );
}
