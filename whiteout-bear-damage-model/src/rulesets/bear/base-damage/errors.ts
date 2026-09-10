import type { TroopLevelId } from "../../../domain/troop";

export class InvalidBaseDamageInputError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidBaseDamageInputError";
  }
}

export class MissingTroopLevelConstantError extends Error {
  public readonly troopLevelId: TroopLevelId;

  public constructor(troopLevelId: TroopLevelId) {
    super(`兵种等级 ${troopLevelId} 的等级常数缺失，不能计算基础伤害。`);
    this.name = "MissingTroopLevelConstantError";
    this.troopLevelId = troopLevelId;
  }
}

export class UnknownTroopLevelError extends Error {
  public readonly troopLevelId: TroopLevelId;

  public constructor(troopLevelId: TroopLevelId) {
    super(`未找到兵种等级配置：${troopLevelId}。`);
    this.name = "UnknownTroopLevelError";
    this.troopLevelId = troopLevelId;
  }
}
