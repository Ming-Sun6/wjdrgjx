import { InvalidBaseDamageInputError } from "./errors";

/** 将 444.35 这样的战报百分数转换为 4.4435。 */
export function percentageToDecimal(percentage: number): number {
  if (!Number.isFinite(percentage)) {
    throw new InvalidBaseDamageInputError("战报百分数必须是有限数字。");
  }

  return percentage / 100;
}

/** 将 +444.35% 转换为公式中的 (1 + A) = 5.4435。 */
export function percentageToMultiplier(percentage: number): number {
  return 1 + percentageToDecimal(percentage);
}
