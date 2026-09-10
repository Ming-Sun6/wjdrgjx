import type { TroopLevelId, TroopStats, TroopType } from "./troop";

/** 分支名称描述 N 相对 5000 上限的位置，不描述当前兵种数 n。 */
export type BaseDamageBranch = "below-5000" | "at-or-above-5000";

export interface BaseTroopDamageInput {
  /** N：整支部队总兵数。 */
  readonly totalTroopCount: number;
  /** n：当前兵种兵数。 */
  readonly troopCount: number;
  readonly troopType: TroopType;
  readonly troopLevelId: TroopLevelId;
  readonly stats: TroopStats;
}

export interface BaseTroopDamageFactors {
  readonly k: number;
  readonly totalCountFactor: number;
  readonly troopCountFactor: number;
  readonly troopDamageCoefficient: number;
  readonly troopLevelConstant: number;
  readonly attackMultiplier: number;
  readonly penetrationMultiplier: number;
}

export interface BaseTroopDamageResult {
  readonly troopType: TroopType;
  readonly troopLevelId: TroopLevelId;
  readonly totalTroopCount: number;
  readonly troopCount: number;
  readonly branch: BaseDamageBranch;
  readonly factors: BaseTroopDamageFactors;
  /** 未进行 floor、round 或 ceil 的完整浮点结果。 */
  readonly damage: number;
}

export interface BaseTroopGroupInput {
  readonly troopCount: number;
  readonly troopType: TroopType;
  readonly troopLevelId: TroopLevelId;
  readonly stats: TroopStats;
}

export interface BaseTotalDamageInput {
  readonly troops: readonly BaseTroopGroupInput[];
}

export interface BaseTotalDamageResult {
  readonly totalTroopCount: number;
  readonly troopResults: readonly BaseTroopDamageResult[];
  readonly damageByTroopType: Readonly<Partial<Record<TroopType, number>>>;
  /** 各兵种未取整伤害的直接和。 */
  readonly totalDamage: number;
}
