import type { HeadHeroId } from "./hero";
import type { Skill } from "./skill";
import type { TroopType } from "./troop";
import type { TroopCounts } from "./troopRatioOptimization";

export type TownBuffSize = "none" | "small" | "large";
export interface ExpertConfig { readonly hunterHeartLevel: number; readonly bearSlayerLevel: number }
export interface TownBuffConfig { readonly attack: TownBuffSize; readonly penetration: TownBuffSize; readonly defenseReduction: TownBuffSize; readonly marchCapacity: TownBuffSize }
export interface PetBuffConfig { readonly attackLevel: number; readonly penetrationLevel: number; readonly defenseReductionLevel: number; readonly capacityLevel: number }
export interface ExclusiveWeaponConfig { readonly levelsByHeroId: Readonly<Partial<Record<HeadHeroId, number>>> }
export interface TroopSkillLevelConfig { readonly marksmanBlazingStarLevel?: number; readonly lancerT12SkillLevel?: number }
export type CapacityApplicationMode = "expandBaseTroops" | "useFinalTroops";
export interface AdditionalDamageBuffConfig {
  readonly attackRate?: number;
  readonly penetrationRate?: number;
  readonly defenseReductionRate?: number;
}
export interface BattlePreparationConfig {
  readonly baseMarchCapacity: number;
  /** 战报兵数走扩容；集结兵数已经是最终出征，不得再次扩容。 */
  readonly capacityMode?: CapacityApplicationMode;
  readonly otherFixedCapacity?: number;
  readonly expert: ExpertConfig;
  readonly town: TownBuffConfig;
  readonly pet: PetBuffConfig;
  readonly exclusiveWeapons?: ExclusiveWeaponConfig;
  readonly troopSkillLevels?: TroopSkillLevelConfig;
  /** 集结等来源的额外Buff；始终留在Buff大乘区，不进入基础A/P。 */
  readonly additionalDamageBuffs?: AdditionalDamageBuffConfig;
}
export interface MarchCapacityResult { readonly baseMarchCapacity:number; readonly expertFixedCapacity:number; readonly petFixedCapacity:number; readonly otherFixedCapacity:number; readonly fixedAdjustedCapacity:number; readonly townMarchCapacityRate:number; readonly rawFinalMarchCapacity:number; readonly finalMarchCapacity:number }
export interface PreparedBattleModifiers { readonly capacity: MarchCapacityResult; readonly troopCounts: TroopCounts; readonly skills: readonly Skill[] }
export type ExclusiveWeaponBuffType = "attack" | "penetration" | "none";
export type BuffTroopType = TroopType;
export const BUFF_ZONES = ["attack", "penetration", "defenseReduction", "capacity"] as const;
export type BuffZone = (typeof BUFF_ZONES)[number];
