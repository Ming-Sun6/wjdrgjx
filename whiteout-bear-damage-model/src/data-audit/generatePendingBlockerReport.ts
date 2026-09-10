import type { SkillCatalogAuditRecord } from "../domain/skillAudit";
import { collectSkillCatalog } from "./collectSkillCatalog";

export interface PendingSkillBlockerEntry {
  readonly classification: "ENGINE_GAP" | "RULE_UNKNOWN" | "DATA_SOURCE_UNCERTAIN";
  readonly recordId: string;
  readonly skillName: string;
  readonly category: SkillCatalogAuditRecord["category"];
  readonly reason: string;
}

export interface PendingSkillBlockerReport {
  /** 数据和语义完整、但引擎不能表达；对应目录状态unsupported。 */
  readonly engineCapability: readonly PendingSkillBlockerEntry[];
  /** 游戏资料或精确时序不足；对应目录状态pending。 */
  readonly gameRuleInformation: readonly PendingSkillBlockerEntry[];
  readonly dataSourceUncertain: readonly PendingSkillBlockerEntry[];
}

/** 按项目既有status定义分类，不根据中文描述猜测原因。 */
export function generatePendingSkillBlockerReport(
  records: readonly SkillCatalogAuditRecord[] = collectSkillCatalog(),
): PendingSkillBlockerReport {
  return {
    engineCapability: records
      .filter((record) => record.status === "unsupported")
      .map((record) => toEntry(record, "ENGINE_GAP")),
    gameRuleInformation: records
      .filter((record) => record.status === "pending" && record.blockerClassification !== "DATA_SOURCE_UNCERTAIN")
      .map((record) => toEntry(record, "RULE_UNKNOWN")),
    dataSourceUncertain: records
      .filter((record) => record.status === "pending" && record.blockerClassification === "DATA_SOURCE_UNCERTAIN")
      .map((record) => toEntry(record, "DATA_SOURCE_UNCERTAIN")),
  };
}

function toEntry(
  record: SkillCatalogAuditRecord,
  classification: PendingSkillBlockerEntry["classification"],
): PendingSkillBlockerEntry {
  return {
    classification,
    recordId: record.recordId,
    skillName: record.skillName,
    category: record.category,
    reason: record.reason ?? `${record.status}技能未提供原因。`,
  };
}
