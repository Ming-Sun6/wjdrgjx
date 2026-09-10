import { collectSkillCatalog } from "../../data-audit/collectSkillCatalog";
import type {
  SkillCatalogAuditRecord,
  SkillCatalogCategory,
} from "../../domain/skillAudit";
import type {
  EffectActivationTiming,
  EffectRefreshMode,
  Skill,
  SkillCalculationStatus,
  SkillEffectCondition,
  SkillEffectData,
  SkillTrigger,
  StackLimitBehavior,
} from "../../domain/skill";

export interface SkillCatalogDurationData {
  readonly effectId: string;
  readonly durationRounds: number;
  readonly activationTiming: EffectActivationTiming | null;
  readonly refreshMode: EffectRefreshMode | null;
}

export interface SkillCatalogStackingData {
  readonly effectId: string;
  readonly valuePerStack: number | null;
  readonly maxStacks: number | null;
  readonly atMaxStacks: StackLimitBehavior | null;
  readonly decayRate: number | null;
  readonly maxApplications: number | null;
}

/**
 * 对 body/head/fireCrystal/troopTierSkill 来源的统一只读视图。
 * 原始配置仍保存在各自数据文件中；这里不复制或改写技能规则。
 */
export interface SkillDataCatalogEntry {
  /** 每条目录记录始终存在的稳定 ID。 */
  readonly id: string;
  /** 可执行 Skill 的 ID；资料不完整、尚未构造 Skill 时为 null。 */
  readonly skillId: string | null;
  readonly heroId: string | null;
  readonly skillName: string;
  readonly skillType: SkillCatalogCategory;
  readonly source: string;
  readonly description: string;
  readonly effects: readonly SkillEffectData[];
  readonly trigger: SkillTrigger | null;
  readonly conditions: readonly SkillEffectCondition[];
  readonly durations: readonly SkillCatalogDurationData[];
  readonly stacking: readonly SkillCatalogStackingData[];
  readonly status: SkillCalculationStatus;
  readonly pendingReason: string | null;
  /** supported 记录使用；pending/unsupported 不会由目录偷偷转成可执行技能。 */
  readonly skill: Skill | null;
}

const entries: readonly SkillDataCatalogEntry[] = Object.freeze(
  collectSkillCatalog().map(toSkillDataCatalogEntry),
);
const entriesById = new Map(entries.map((entry) => [entry.id, entry]));

export function getAllSkillDataCatalogEntries(): readonly SkillDataCatalogEntry[] {
  return entries;
}

export function getSupportedSkillDataCatalogEntries(): readonly SkillDataCatalogEntry[] {
  return entries.filter((entry) => entry.status === "supported");
}

export function getPendingSkillDataCatalogEntries(): readonly SkillDataCatalogEntry[] {
  return entries.filter((entry) => entry.status === "pending");
}

export function getUnsupportedSkillDataCatalogEntries(): readonly SkillDataCatalogEntry[] {
  return entries.filter((entry) => entry.status === "unsupported");
}

export function getSkillDataCatalogEntryById(
  id: string,
): SkillDataCatalogEntry | undefined {
  return entriesById.get(id);
}

function toSkillDataCatalogEntry(
  record: SkillCatalogAuditRecord,
): SkillDataCatalogEntry {
  return {
    id: record.recordId,
    skillId: record.skillId,
    heroId: record.category === "body" || record.category === "head"
      ? record.ownerId
      : null,
    skillName: record.skillName,
    skillType: record.category,
    source: record.source,
    description: record.rawDescription,
    effects: record.effects,
    trigger: record.trigger,
    conditions: record.effects.flatMap((effect) => effect.conditions ?? []),
    durations: record.effects.flatMap((effect) => {
      const durationRounds = effect.lifecycle?.durationRounds;
      return durationRounds === undefined
        ? []
        : [
            {
              effectId: effect.id,
              durationRounds,
              activationTiming: effect.lifecycle?.activationTiming ?? null,
              refreshMode: effect.lifecycle?.refreshMode ?? null,
            },
          ];
    }),
    stacking: record.effects.flatMap((effect) => {
      const lifecycle = effect.lifecycle;
      const hasStackingData =
        effect.valuePerStack !== undefined ||
        lifecycle?.maxStacks !== undefined ||
        lifecycle?.decayRate !== undefined ||
        lifecycle?.maxApplications !== undefined;
      return hasStackingData
        ? [
            {
              effectId: effect.id,
              valuePerStack: effect.valuePerStack ?? null,
              maxStacks: lifecycle?.maxStacks ?? null,
              atMaxStacks: lifecycle?.atMaxStacks ?? null,
              decayRate: lifecycle?.decayRate ?? null,
              maxApplications: lifecycle?.maxApplications ?? null,
            },
          ]
        : [];
    }),
    status: record.status,
    pendingReason: record.status === "pending" ? record.reason : null,
    skill: record.status === "supported" ? record.skill : null,
  };
}
