import type { BodyHeroId } from "./hero";
import type { Skill } from "./skill";

export type BodySkillOptionId = `body-skill.${string}`;

/** 普通车身 UI 与自动优化共用的“技能效果”数据，而不是英雄身份。 */
export interface BodySkillOption {
  readonly id: BodySkillOptionId;
  readonly label: string;
  readonly sourceHeroIds: readonly BodyHeroId[];
  readonly sourceHeroNames: readonly string[];
  /** 复用既有英雄技能进入统一引擎；null 表示已确认不增加对熊输出。 */
  readonly representativeHeroId: BodyHeroId | null;
  readonly skill: Skill | null;
  readonly outgoingDamageApplicable: boolean;
  readonly notes: readonly string[];
}

/** 优化热循环使用的预聚合车身效果；来源英雄不参与伤害签名。 */
export interface AggregatedBodyEffect {
  readonly options: readonly BodySkillOption[];
  readonly optionCounts: Readonly<Record<string, number>>;
  readonly skills: readonly Skill[];
  readonly representativeHeroIds: readonly BodyHeroId[];
  readonly signature: string;
}
