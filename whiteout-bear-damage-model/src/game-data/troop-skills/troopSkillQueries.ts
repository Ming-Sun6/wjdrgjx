import type { SkillEffectData } from "../../domain/skill";
import type {
  PendingTroopSkillDefinition,
  SupportedTroopSkillDefinition,
  TroopSkillDefinition,
  TroopSkillId,
  UnsupportedTroopSkillDefinition,
} from "../../domain/troopSkill";
import type { TroopType } from "../../domain/troop";
import { marksmanFireCrystalSkills } from "./marksmanFireCrystalSkills";
import { troopTierSkills } from "./troopTierSkills";

const allTroopSkills: readonly TroopSkillDefinition[] = Object.freeze([
  ...Object.values(marksmanFireCrystalSkills),
  ...Object.values(troopTierSkills),
]);
const troopSkillsById = Object.fromEntries(
  allTroopSkills.map((skill) => [skill.id, skill]),
) as Readonly<Record<string, TroopSkillDefinition>>;

export function getAllTroopSkills(): readonly TroopSkillDefinition[] {
  return allTroopSkills;
}

export function getFireCrystalSkills():readonly TroopSkillDefinition[]{return allTroopSkills.filter(skill=>skill.sourceKind==="fireCrystalSkill")}
export function getTroopTierSkills():readonly TroopSkillDefinition[]{return allTroopSkills.filter(skill=>skill.sourceKind==="troopTierSkill")}

export function getTroopSkillsByTroopType(
  troopType: TroopType,
): readonly TroopSkillDefinition[] {
  return allTroopSkills.filter((skill) => skill.troopType === troopType);
}

export function getTroopSkillById(
  skillId: TroopSkillId,
): TroopSkillDefinition | undefined {
  return troopSkillsById[skillId];
}

export function getSupportedTroopSkills(): readonly SupportedTroopSkillDefinition[] {
  return allTroopSkills.filter(
    (skill): skill is SupportedTroopSkillDefinition =>
      skill.status === "supported",
  );
}

export function getPendingTroopSkills(): readonly PendingTroopSkillDefinition[] {
  return allTroopSkills.filter(
    (skill): skill is PendingTroopSkillDefinition => skill.status === "pending",
  );
}

export function getUnsupportedTroopSkills(): readonly UnsupportedTroopSkillDefinition[] {
  return allTroopSkills.filter(
    (skill): skill is UnsupportedTroopSkillDefinition =>
      skill.status === "unsupported",
  );
}

export function getTroopSkillEffectsByStatus(
  status: SkillEffectData["status"],
): readonly SkillEffectData[] {
  return allTroopSkills.flatMap((skill) =>
    skill.effects.filter((effect) => effect.status === status),
  );
}
