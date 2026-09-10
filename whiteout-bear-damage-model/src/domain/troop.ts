export type TroopType = "shield" | "lancer" | "marksman";

/**
 * 等级 ID 使用稳定的配置键。模板类型允许未来添加等级，而不必修改领域模型。
 * 配置加载/查询时仍会验证该 ID 是否真实存在。
 */
export type TroopLevelId = `T${number}` | `T${number}-FC${number}`;

export interface TroopTypeDefinition {
  readonly id: TroopType;
  readonly displayName: string;
}

export type TroopLevelDataStatus = "known" | "missing";

interface TroopLevelBase {
  readonly id: TroopLevelId;
  readonly tier: number;
  readonly fireCrystalLevel: number | null;
}

export interface KnownTroopLevel extends TroopLevelBase {
  readonly constant: number;
  readonly status: "known";
}

export interface MissingTroopLevel extends TroopLevelBase {
  readonly constant: null;
  readonly status: "missing";
}

export type TroopLevel = KnownTroopLevel | MissingTroopLevel;

/**
 * 战报里的数值保持“百分数”单位：444.35 表示 +444.35%。
 * 当前基础公式只使用 attackPercent 和 penetrationPercent。
 */
export interface TroopStats {
  readonly attackPercent: number;
  readonly penetrationPercent: number;
  readonly defensePercent?: number;
  readonly healthPercent?: number;
}
