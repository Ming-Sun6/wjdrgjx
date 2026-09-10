import type {
  SkillCatalogAuditRecord,
  SkillCatalogCategory,
  SkillStatusCounts,
  SkillSupportCounts,
  SkillSupportReport,
} from "../domain/skillAudit";
import type { SkillCalculationStatus } from "../domain/skill";
import { collectSkillCatalog } from "./collectSkillCatalog";

export function generateSkillSupportReport(
  records: readonly SkillCatalogAuditRecord[] = collectSkillCatalog(),
): SkillSupportReport {
  const byCategory = {
    body: emptySupportCounts(),
    head: emptySupportCounts(),
    fireCrystal: emptySupportCounts(),
    troopTierSkill: emptySupportCounts(),
  } satisfies Record<SkillCatalogCategory, MutableSupportCounts>;

  for (const record of records) {
    increment(byCategory[record.category].skills, record.status);
    for (const effect of record.effects) {
      increment(byCategory[record.category].effects, effect.status);
    }
  }

  return {
    totals: sumSupportCounts(Object.values(byCategory)),
    byCategory,
    entries: records.map((record) => ({
      category: record.category,
      ownerId: record.ownerId,
      recordId: record.recordId,
      skillId: record.skillId,
      skillName: record.skillName,
      source: record.source,
      status: record.status,
      reason: record.reason,
      effects: record.effects.map((effect) => ({
        id: effect.id,
        status: effect.status,
        reason:
          effect.pendingReason ?? effect.unsupportedReason ?? null,
      })),
    })),
  };
}

type MutableStatusCounts = {
  -readonly [K in keyof SkillStatusCounts]: number;
};
interface MutableSupportCounts {
  readonly skills: MutableStatusCounts;
  readonly effects: MutableStatusCounts;
}

function emptyStatusCounts(): MutableStatusCounts {
  return { supported: 0, pending: 0, unsupported: 0 };
}

function emptySupportCounts(): MutableSupportCounts {
  return { skills: emptyStatusCounts(), effects: emptyStatusCounts() };
}

function increment(
  counts: MutableStatusCounts,
  status: SkillCalculationStatus,
): void {
  counts[status] += 1;
}

function sumSupportCounts(
  counts: readonly SkillSupportCounts[],
): SkillSupportCounts {
  const total = emptySupportCounts();
  for (const count of counts) {
    for (const status of ["supported", "pending", "unsupported"] as const) {
      total.skills[status] += count.skills[status];
      total.effects[status] += count.effects[status];
    }
  }
  return total;
}
