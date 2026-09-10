import type { SkillCatalogAuditRecord } from "../domain/skillAudit";
import { getAllBodyHeroes } from "../game-data/heroes/bodyHeroQueries";
import { getAllHeadHeroes } from "../game-data/heroes/headHeroQueries";
import { getAllTroopSkills } from "../game-data/troop-skills/troopSkillQueries";
import { resolveSupportedCatalogEffects } from "../engine/skills/resolveSupportedCatalogEffects";

export function collectSkillCatalog(): readonly SkillCatalogAuditRecord[] {
  const body: SkillCatalogAuditRecord[] = getAllBodyHeroes().map((hero) => {
    const definition = hero.bodySkillDefinition;
    return {
      category: "body",
      ownerId: hero.id,
      recordId: definition.id,
      skillId: definition.skill?.id ?? null,
      skillName: definition.name,
      status: definition.status,
      skill: definition.skill,
      effects: definition.effectData,
      trigger: definition.skill?.trigger ?? null,
      rawDescription: definition.rawDescription,
      source: definition.source ?? "项目车身英雄数据库",
      reason:
        definition.status === "pending"
          ? definition.pendingReason
          : definition.status === "unsupported"
            ? definition.unsupportedReason
            : null,
      ...(definition.status === "pending" && definition.pendingClassification !== undefined
        ? { blockerClassification: definition.pendingClassification }
        : {}),
    };
  });

  const head: SkillCatalogAuditRecord[] = getAllHeadHeroes().flatMap((hero) =>
    hero.headSkills.map((definition) => ({
      category: "head" as const,
      ownerId: hero.id,
      recordId: definition.id,
      skillId: definition.skill?.id ?? null,
      skillName: definition.name,
      status: definition.status,
      skill: definition.skill,
      effects: definition.effectData,
      trigger: definition.skill?.trigger ?? null,
      rawDescription: definition.rawDescription,
      source: definition.source ?? hero.source ?? "项目车头英雄数据库",
      reason:
        definition.status === "pending"
          ? definition.pendingReason
          : definition.status === "unsupported"
            ? definition.unsupportedReason
            : null,
      ...(definition.status === "pending" && definition.pendingClassification !== undefined
        ? { blockerClassification: definition.pendingClassification }
        : {}),
    })),
  );

  const troop: SkillCatalogAuditRecord[] = getAllTroopSkills().map((skill) => ({
    category: skill.sourceKind === "troopTierSkill" ? "troopTierSkill" : "fireCrystal",
    ownerId: skill.troopType,
    recordId: skill.id,
    skillId: skill.id,
    skillName: skill.name,
    status: skill.status,
    skill: skill.status === "supported"
      ? resolveSupportedCatalogEffects(skill).skills[0] ?? null
      : null,
    effects: skill.effects,
    trigger: skill.trigger,
    rawDescription: skill.rawDescription,
    source: skill.source,
    reason:
      skill.status === "pending"
        ? skill.pendingReason
        : skill.status === "unsupported"
          ? skill.unsupportedReason
          : null,
    ...(skill.status === "pending" ? { blockerClassification: "RULE_UNKNOWN" as const } : {}),
  }));

  return [...body, ...head, ...troop];
}
