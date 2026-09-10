import type {
  FireCrystalConfiguration,
  FireCrystalOptimizationDimension,
} from "../../domain/fullBattleSetupOptimization";
import type { TroopSkillDefinition, TroopSkillId } from "../../domain/troopSkill";
import {
  InvalidFireCrystalConfigurationError,
  NoFullSetupCandidateError,
  UnknownFireCrystalLevelError,
} from "./errors";

export interface FireCrystalDataSource {
  readonly getAllTroopSkills: () => readonly TroopSkillDefinition[];
  readonly getTroopSkillById: (skillId: TroopSkillId) => TroopSkillDefinition | undefined;
}

const EMPTY_CONFIGURATION: FireCrystalConfiguration = {
  id: "fire-crystal.empty",
  settings: { skillIds: [] },
};

export function generateFireCrystalConfigurations(
  dimension: FireCrystalOptimizationDimension | undefined,
  dataSource: FireCrystalDataSource,
): readonly FireCrystalConfiguration[] {
  if (dimension === undefined || dimension.mode === "fixed") {
    const configuration = dimension?.configuration ?? EMPTY_CONFIGURATION;
    validateConfiguration(configuration, dataSource);
    return [configuration];
  }

  const discovered = dataSource
    .getAllTroopSkills()
    .filter((skill) => skill.effects.some((effect) => effect.status === "supported"))
    .map((skill) => ({
      id: `fire-crystal.skill.${skill.id}`,
      settings: { skillIds: [skill.id] },
    }));
  const configured = dimension.allowedConfigurations ?? discovered;
  const candidates = [
    ...((dimension.includeEmpty ?? true) ? [EMPTY_CONFIGURATION] : []),
    ...configured,
  ];
  const ids = candidates.map((configuration) => configuration.id);
  if (new Set(ids).size !== ids.length) {
    throw new InvalidFireCrystalConfigurationError("火晶配置ID不能重复。");
  }
  const filtered = candidates.filter((configuration) => {
    validateConfiguration(configuration, dataSource);
    return matchesLevelRestrictions(configuration, dimension, dataSource);
  });
  if (filtered.length === 0) throw new NoFullSetupCandidateError("fireCrystal");
  return [...filtered].sort((left, right) => fireCrystalConfigurationKey(left).localeCompare(fireCrystalConfigurationKey(right)));
}

export function fireCrystalConfigurationKey(
  configuration: FireCrystalConfiguration,
): string {
  return `${configuration.id}|${configuration.settings.skillIds.join("|")}`;
}

function validateConfiguration(
  configuration: FireCrystalConfiguration,
  dataSource: FireCrystalDataSource,
): void {
  if (!configuration.id.trim()) {
    throw new InvalidFireCrystalConfigurationError("火晶配置ID不能为空。");
  }
  const skillIds = configuration.settings.skillIds;
  if (new Set(skillIds).size !== skillIds.length) {
    throw new InvalidFireCrystalConfigurationError(
      `火晶配置 ${configuration.id} 包含重复技能ID。`,
    );
  }
  for (const skillId of skillIds) {
    if (dataSource.getTroopSkillById(skillId) === undefined) {
      throw new InvalidFireCrystalConfigurationError(
        `火晶配置 ${configuration.id} 包含未知技能：${skillId}。`,
      );
    }
  }
}

function matchesLevelRestrictions(
  configuration: FireCrystalConfiguration,
  dimension: Extract<FireCrystalOptimizationDimension, { readonly mode: "optimize" }>,
  dataSource: FireCrystalDataSource,
): boolean {
  const hasRestriction =
    dimension.minLevel !== undefined ||
    dimension.maxLevel !== undefined ||
    dimension.allowedLevels !== undefined;
  if (!hasRestriction || configuration.settings.skillIds.length === 0) return true;

  return configuration.settings.skillIds.every((skillId) => {
    const definition = dataSource.getTroopSkillById(skillId)!;
    if (definition.level === null) throw new UnknownFireCrystalLevelError(skillId);
    if (
      dimension.allowedLevels !== undefined &&
      !dimension.allowedLevels.includes(definition.level)
    ) {
      return false;
    }
    if (dimension.minLevel !== undefined) {
      if (typeof definition.level !== "number") return false;
      if (definition.level < dimension.minLevel) return false;
    }
    if (dimension.maxLevel !== undefined) {
      if (typeof definition.level !== "number") return false;
      if (definition.level > dimension.maxLevel) return false;
    }
    return true;
  });
}
