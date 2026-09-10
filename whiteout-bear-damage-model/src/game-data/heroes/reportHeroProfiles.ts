import type { HeadHeroId } from "../../domain/hero";
import type {
  HeroStaticCombatStats,
  ReportHeroProfile,
  ReportHeroProfileId,
} from "../../domain/reportHero";
import type { TroopType } from "../../domain/troop";
import { getAllHeadHeroes, getHeadHeroById } from "./headHeroQueries";

export const GENERATION_STATIC_COMBAT_STATS: Readonly<Record<number, HeroStaticCombatStats>> = {
  1: { heroAttackPercent: 200.16, maxWeaponPenetrationPercent: 55 },
  2: { heroAttackPercent: 240.19, maxWeaponPenetrationPercent: 60 },
  3: { heroAttackPercent: 290.23, maxWeaponPenetrationPercent: 70 },
  4: { heroAttackPercent: 370.29, maxWeaponPenetrationPercent: 92.5 },
  5: { heroAttackPercent: 444.35, maxWeaponPenetrationPercent: 111 },
  6: { heroAttackPercent: 540.43, maxWeaponPenetrationPercent: 133.5 },
  7: { heroAttackPercent: 650.52, maxWeaponPenetrationPercent: 160.5 },
  8: { heroAttackPercent: 780.62, maxWeaponPenetrationPercent: 193 },
  9: { heroAttackPercent: 940.75, maxWeaponPenetrationPercent: 232 },
  10: { heroAttackPercent: 1110.88, maxWeaponPenetrationPercent: 277.5 },
  11: { heroAttackPercent: 1281.02, maxWeaponPenetrationPercent: 320 },
  12: { heroAttackPercent: 1451.16, maxWeaponPenetrationPercent: 362.5 },
  13: { heroAttackPercent: 1621.29, maxWeaponPenetrationPercent: 405 },
  14: { heroAttackPercent: 1791.43, maxWeaponPenetrationPercent: 447.5 },
  15: { heroAttackPercent: 1961.51, maxWeaponPenetrationPercent: 490 },
  16: { heroAttackPercent: 2131.70, maxWeaponPenetrationPercent: 532.5 },
};

/** 特殊静态档案只存在数据层；计算器不按英雄姓名或代数分支。 */
const SPECIAL_HEAD_HERO_STATIC_OVERRIDES: Readonly<Partial<Record<HeadHeroId, HeroStaticCombatStats>>> = {
  "hero.head.nimo": { heroAttackPercent: 260.20, maxWeaponPenetrationPercent: 62.5 },
};

const BASIC_PROFILE_STATS = {
  R: { heroAttackPercent: 90.07, maxWeaponPenetrationPercent: 0 },
  SR: { heroAttackPercent: 140.11, maxWeaponPenetrationPercent: 0 },
  GINA: { heroAttackPercent: 110.08, maxWeaponPenetrationPercent: 0 },
} as const;

const TROOP_TYPES: readonly TroopType[] = ["shield", "lancer", "marksman"];

export function getHeroStaticCombatStats(heroId: HeadHeroId): HeroStaticCombatStats {
  const override = SPECIAL_HEAD_HERO_STATIC_OVERRIDES[heroId];
  if (override !== undefined) return override;
  const hero = getHeadHeroById(heroId);
  if (hero === undefined) throw new Error(`找不到车头英雄静态属性：${heroId}。`);
  if (hero.generation === null) throw new Error(`${hero.name}尚未提供代际静态属性。`);
  const stats = GENERATION_STATIC_COMBAT_STATS[hero.generation];
  if (stats === undefined) throw new Error(`S${hero.generation}尚未提供静态属性。`);
  return stats;
}

const allReportHeroProfiles: readonly ReportHeroProfile[] = Object.freeze(
  TROOP_TYPES.flatMap(createTroopProfiles),
);
const profileById = new Map(allReportHeroProfiles.map((profile) => [profile.id, profile]));

export function getAllReportHeroProfiles(): readonly ReportHeroProfile[] {
  return allReportHeroProfiles;
}

export function getReportHeroProfilesByTroopType(
  troopType: TroopType,
): readonly ReportHeroProfile[] {
  return allReportHeroProfiles.filter((profile) => profile.troopType === troopType);
}

export function getReportHeroProfileById(
  profileId: ReportHeroProfileId,
): ReportHeroProfile | undefined {
  return profileById.get(profileId);
}

function createTroopProfiles(troopType: TroopType): readonly ReportHeroProfile[] {
  const profiles: ReportHeroProfile[] = [
    basicProfile(troopType, "R", "R", BASIC_PROFILE_STATS.R),
    basicProfile(troopType, "SR", "SR", BASIC_PROFILE_STATS.SR),
  ];
  if (troopType === "marksman") {
    profiles.push(basicProfile(troopType, "gina", "吉娜（SR）", BASIC_PROFILE_STATS.GINA));
  }

  const heroes = getAllHeadHeroes().filter((hero) => hero.troopType === troopType);
  for (let generation = 1; generation <= 16; generation += 1) {
    const generationHeroes = heroes.filter((hero) => hero.generation === generation);
    const preserveGenericTemplate = troopType === "shield" && generation === 1;
    if (generationHeroes.length === 0 || preserveGenericTemplate) {
      profiles.push(generationProfile(troopType, generation));
    }
    for (const hero of generationHeroes) profiles.push(headHeroProfile(hero.id));
  }
  return profiles;
}

function basicProfile(
  troopType: TroopType,
  suffix: string,
  label: string,
  stats: HeroStaticCombatStats,
): ReportHeroProfile {
  return {
    id: `report-hero.${troopType}.${suffix.toLowerCase()}`,
    label,
    troopType,
    rarity: suffix === "R" ? "R" : "SR",
    generation: null,
    ...stats,
    hasExclusiveWeapon: false,
    headHeroId: null,
  };
}

function generationProfile(troopType: TroopType, generation: number): ReportHeroProfile {
  const stats = GENERATION_STATIC_COMBAT_STATS[generation];
  if (stats === undefined) throw new Error(`S${generation}静态属性缺失。`);
  return {
    id: `report-hero.${troopType}.s${generation}`,
    label: `S${generation}`,
    troopType,
    rarity: "SSR",
    generation,
    ...stats,
    hasExclusiveWeapon: true,
    headHeroId: null,
  };
}

function headHeroProfile(heroId: HeadHeroId): ReportHeroProfile {
  const hero = getHeadHeroById(heroId);
  if (hero === undefined || hero.troopType === null || hero.generation === null) {
    throw new Error(`车头英雄 ${heroId} 缺少战报静态档案字段。`);
  }
  return {
    id: `report-hero.${hero.troopType}.head.${hero.id.slice("hero.head.".length)}`,
    label: `${hero.name}（S${hero.generation}）`,
    troopType: hero.troopType,
    rarity: "SSR",
    generation: hero.generation,
    ...getHeroStaticCombatStats(hero.id),
    hasExclusiveWeapon: true,
    headHeroId: hero.id,
  };
}
