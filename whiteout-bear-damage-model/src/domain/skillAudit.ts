import type {
  Skill,
  SkillCalculationStatus,
  SkillEffectData,
  SkillTrigger,
} from "./skill";

export type SkillCatalogCategory = "body" | "head" | "fireCrystal" | "troopTierSkill";

export interface SkillCatalogAuditRecord {
  readonly category: SkillCatalogCategory;
  readonly ownerId: string;
  readonly recordId: string;
  readonly skillId: string | null;
  readonly skillName: string;
  readonly status: SkillCalculationStatus;
  readonly skill: Skill | null;
  readonly effects: readonly SkillEffectData[];
  readonly trigger: SkillTrigger | null;
  readonly rawDescription: string;
  readonly source: string;
  readonly reason: string | null;
  readonly blockerClassification?: "RULE_UNKNOWN" | "ENGINE_GAP" | "DATA_SOURCE_UNCERTAIN";
}

export interface DataValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface DataValidationResult {
  readonly valid: boolean;
  readonly checkedCount: number;
  readonly issues: readonly DataValidationIssue[];
}

export interface SkillStatusCounts {
  readonly supported: number;
  readonly pending: number;
  readonly unsupported: number;
}

export interface SkillSupportCounts {
  readonly skills: SkillStatusCounts;
  readonly effects: SkillStatusCounts;
}

export interface SkillSupportReportEntry {
  readonly category: SkillCatalogCategory;
  readonly ownerId: string;
  readonly recordId: string;
  readonly skillId: string | null;
  readonly skillName: string;
  readonly source: string;
  readonly status: SkillCalculationStatus;
  readonly reason: string | null;
  readonly effects: readonly {
    readonly id: string;
    readonly status: SkillCalculationStatus;
    readonly reason: string | null;
  }[];
}

export interface SkillSupportReport {
  readonly totals: SkillSupportCounts;
  readonly byCategory: Readonly<
    Record<SkillCatalogCategory, SkillSupportCounts>
  >;
  readonly entries: readonly SkillSupportReportEntry[];
}
