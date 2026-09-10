import type {
  Skill,
  SkillCalculationStatus,
  SkillEffectData,
} from "./skill";
import type { TroopType } from "./troop";
import type { ExclusiveWeaponBuffType } from "./preparation";

export type HeroId = `hero.${string}`;
export type BodyHeroId = `hero.body.${string}`;
export type HeadHeroId = `hero.head.${string}`;
export type HeroRole = "body" | "head";
export type HeroTier = "S" | "A" | "B" | "C" | "D";
export type HeroCalculationStatus = SkillCalculationStatus;

export interface HeroSkillDefinitionBase {
  /** 即使尚无完整 Skill，也必须有稳定的数据记录 ID。 */
  readonly id: string;
  readonly name: string;
  readonly status: HeroCalculationStatus;
  readonly supported: boolean;
  readonly skill: Skill | null;
  readonly effectData: readonly SkillEffectData[];
  readonly rawDescription: string;
  readonly notes: readonly string[];
  readonly source?: string;
}

export interface SupportedHeroSkillDefinition
  extends HeroSkillDefinitionBase {
  readonly status: "supported";
  readonly supported: true;
  readonly skill: Skill;
}

export interface PendingHeroSkillDefinition extends HeroSkillDefinitionBase {
  readonly status: "pending";
  readonly supported: false;
  readonly skill: Skill | null;
  readonly pendingReason: string;
  readonly pendingClassification?: "RULE_UNKNOWN" | "DATA_SOURCE_UNCERTAIN";
}

export interface UnsupportedHeroSkillDefinition
  extends HeroSkillDefinitionBase {
  readonly status: "unsupported";
  readonly supported: false;
  readonly skill: Skill;
  readonly unsupportedReason: string;
}

export type HeroSkillDefinition =
  | SupportedHeroSkillDefinition
  | PendingHeroSkillDefinition
  | UnsupportedHeroSkillDefinition;

interface HeroDefinitionBase {
  readonly id: HeroId;
  readonly name: string;
  readonly tier: HeroTier | null;
  /** 用户尚未提供的代数使用 null，禁止猜测。 */
  readonly generation: number | null;
  readonly role: HeroRole;
  /** 资料不足的英雄可以为 null；此时不能放入任何兵种车头槽。 */
  readonly troopType: TroopType | null;
  readonly bodySkill: Skill | null;
  readonly headSkills: readonly HeroSkillDefinition[];
  readonly notes: readonly string[];
  readonly source?: string;
  /** 数据驱动互斥组；同一阵容中命中同一组的英雄不能同时出现。 */
  readonly exclusiveGroupIds?: readonly string[];
  readonly exclusiveWeaponBuffType?: ExclusiveWeaponBuffType;
  /** false 表示仅保留英雄/专武资料，不可作为打熊远征车头候选。 */
  readonly optimizableForBear?: boolean;
  /** 明确不参与“我方对熊输出”的技能仍保留在数据层，但不进入SkillResolver。 */
  readonly notApplicableToBearOutgoingDamage?: readonly {
    readonly name: string;
    readonly rawDescription: string;
  }[];
  /** 探险技能与远征技能严格分开。 */
  readonly explorationSkills?: readonly {
    readonly name: string;
    readonly rawDescription: string;
  }[];
}

interface BodyHeroDefinitionBase extends HeroDefinitionBase {
  readonly id: BodyHeroId;
  readonly role: "body";
  /** 当前车身数据库尚未提供英雄自身兵种，显式保持 null。 */
  readonly troopType: null;
  readonly headSkills: readonly [];
  readonly bodySkillDefinition: HeroSkillDefinition;
}

export interface SupportedHeroDefinition extends BodyHeroDefinitionBase {
  readonly status: "supported";
  readonly supported: true;
  /** 旧接口兼容别名；新代码使用 bodySkill。 */
  readonly skill: Skill;
  readonly bodySkill: Skill;
  readonly bodySkillDefinition: SupportedHeroSkillDefinition;
}

export interface PendingHeroDefinition extends BodyHeroDefinitionBase {
  readonly status: "pending";
  readonly supported: false;
  /** 旧接口兼容别名；新代码使用 bodySkill。 */
  readonly skill: Skill | null;
  readonly bodySkill: Skill | null;
  readonly bodySkillDefinition: PendingHeroSkillDefinition;
}

export interface UnsupportedHeroDefinition extends BodyHeroDefinitionBase {
  readonly status: "unsupported";
  readonly supported: false;
  /** 旧接口兼容别名；新代码使用 bodySkill。 */
  readonly skill: Skill;
  readonly bodySkill: Skill;
  readonly bodySkillDefinition: UnsupportedHeroSkillDefinition;
}

export type BodyHeroDefinition =
  | SupportedHeroDefinition
  | PendingHeroDefinition
  | UnsupportedHeroDefinition;

export interface HeadHeroDefinition extends HeroDefinitionBase {
  readonly id: HeadHeroId;
  readonly role: "head";
  readonly bodySkill: null;
  readonly headSkills: readonly HeroSkillDefinition[];
}

export type HeroDefinition = BodyHeroDefinition | HeadHeroDefinition;

/** 通用只读查询接口；计算器仍会验证返回英雄的 role。 */
export interface HeroCatalog {
  get(heroId: HeroId): HeroDefinition | undefined;
}

export interface HeadHeroCatalog {
  get(heroId: HeadHeroId): HeadHeroDefinition | undefined;
}

export interface HeadSkillReference<
  TSkill extends HeroSkillDefinition = HeroSkillDefinition,
> {
  readonly hero: HeadHeroDefinition;
  readonly skillDefinition: TSkill;
}
