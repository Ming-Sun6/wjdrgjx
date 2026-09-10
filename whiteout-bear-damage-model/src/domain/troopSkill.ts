import type {
  SkillCalculationStatus,
  SkillEffectData,
  SkillTrigger,
} from "./skill";
import type { TroopType } from "./troop";

export type TroopSkillId = `troop-skill.${string}`;

interface TroopSkillDefinitionBase {
  readonly id: TroopSkillId;
  readonly name: string;
  readonly troopType: TroopType;
  /** 未提供具体火晶等级时明确保存为 null，不推测解锁等级。 */
  readonly level: string | number | null;
  readonly status: SkillCalculationStatus;
  readonly effects: readonly SkillEffectData[];
  /** 混合触发技能可为 null，并由各 effectData.trigger 分别表达。 */
  readonly trigger: SkillTrigger | null;
  readonly rawDescription: string;
  readonly notes: readonly string[];
  readonly source: string;
  readonly sourceKind?: "troopTierSkill" | "fireCrystalSkill";
}

export interface SupportedTroopSkillDefinition
  extends TroopSkillDefinitionBase {
  readonly status: "supported";
}

export interface PendingTroopSkillDefinition extends TroopSkillDefinitionBase {
  readonly status: "pending";
  readonly pendingReason: string;
}

export interface UnsupportedTroopSkillDefinition
  extends TroopSkillDefinitionBase {
  readonly status: "unsupported";
  readonly unsupportedReason: string;
}

export type TroopSkillDefinition =
  | SupportedTroopSkillDefinition
  | PendingTroopSkillDefinition
  | UnsupportedTroopSkillDefinition;

/** 当前项目先录入火晶技能；与英雄 Skill 数据源保持分离。 */
export type FireCrystalSkill = TroopSkillDefinition;
