import type { HeadHeroId } from "./hero";
import type { TroopType } from "./troop";

export type ReportHeroProfileId = `report-hero.${string}`;
export type ReportHeroRarity = "R" | "SR" | "SSR";

export interface HeroStaticCombatStats {
  /** 百分数点：260.20 表示 +260.20%。 */
  readonly heroAttackPercent: number;
  /** 满级专武提供的静态穿透百分数点。 */
  readonly maxWeaponPenetrationPercent: number;
}

/** 战报属性还原专用档案；它不携带技能，也不能进入 SkillResolver。 */
export interface ReportHeroProfile extends HeroStaticCombatStats {
  readonly id: ReportHeroProfileId;
  readonly label: string;
  readonly troopType: TroopType;
  readonly rarity: ReportHeroRarity;
  readonly generation: number | null;
  readonly hasExclusiveWeapon: boolean;
  /** 已知正式车头的静态身份关联；S代模板、R/SR为null。 */
  readonly headHeroId: HeadHeroId | null;
}

export interface BattleReportHeroSelection {
  readonly profileId: ReportHeroProfileId;
  readonly weaponLevel: number;
}

export interface BattleReportHeroAdjustmentConfig {
  readonly reportHeroes: Readonly<Record<TroopType, BattleReportHeroSelection>>;
  /** 当前实际车头专武等级；英雄身份由同一战斗输入的 HeadFormation 提供。 */
  readonly actualWeaponLevels: Readonly<Record<TroopType, number>>;
}

export interface ResolvedBattleReportAttributeAdjustment {
  readonly troopType: TroopType;
  readonly reportHero: ReportHeroProfile;
  readonly actualHeadHeroId: HeadHeroId | null;
  readonly reportWeaponLevel: number;
  readonly actualWeaponLevel: number;
  readonly reportHeroAttackPercent: number;
  readonly actualHeroAttackPercent: number;
  readonly reportWeaponPenetrationPercent: number;
  readonly actualWeaponPenetrationPercent: number;
  readonly deltaAttackPercent: number;
  readonly deltaPenetrationPercent: number;
  readonly bearPitAttackPercent: number;
  readonly correctedAttackPercent: number;
  readonly correctedPenetrationPercent: number;
}

export interface ResolveBattleReportAttributesInput {
  readonly troopType: TroopType;
  readonly battleReportAttackPercent: number;
  readonly battleReportPenetrationPercent: number;
  readonly reportHero: BattleReportHeroSelection;
  readonly actualHeadHeroId?: HeadHeroId;
  readonly actualWeaponLevel: number;
}
