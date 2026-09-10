import type {
  BaseTotalDamageInput,
  BaseTotalDamageResult,
} from "../../../domain/baseDamage";
import type { TroopType } from "../../../domain/troop";
import { InvalidBaseDamageInputError } from "./errors";
import { calculateBaseTroopDamage } from "./calculateBaseTroopDamage";

/**
 * 使用各兵种兵数之和生成统一的 N，再分别计算并直接求和。
 */
export function calculateBaseTotalDamage(
  input: BaseTotalDamageInput,
): BaseTotalDamageResult {
  if (input.troops.length === 0) {
    throw new InvalidBaseDamageInputError("至少需要提供一个兵种。");
  }

  const totalTroopCount = input.troops.reduce(
    (sum, troop) => sum + troop.troopCount,
    0,
  );

  if (!Number.isSafeInteger(totalTroopCount)) {
    throw new InvalidBaseDamageInputError("整支部队总兵数超出安全整数范围。");
  }

  const troopResults = input.troops.map((troop) =>
    calculateBaseTroopDamage({
      ...troop,
      totalTroopCount,
    }),
  );

  const damageByTroopType: Partial<Record<TroopType, number>> = {};

  for (const result of troopResults) {
    damageByTroopType[result.troopType] =
      (damageByTroopType[result.troopType] ?? 0) + result.damage;
  }

  const totalDamage = troopResults.reduce(
    (sum, result) => sum + result.damage,
    0,
  );

  return {
    totalTroopCount,
    troopResults,
    damageByTroopType,
    totalDamage,
  };
}
