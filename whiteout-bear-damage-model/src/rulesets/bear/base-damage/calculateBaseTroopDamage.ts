import type {
  BaseTroopDamageInput,
  BaseTroopDamageResult,
} from "../../../domain/baseDamage";
import { troopDamageCoefficients } from "../../../game-data/troops/troopDamageCoefficients";
import { BASE_DAMAGE_K, TROOP_COUNT_THRESHOLD } from "./constants";
import { percentageToMultiplier } from "./percent";
import { getTroopLevelConstant } from "./troopLevelLookup";
import { validateBaseTroopDamageInput } from "./validation";

/**
 * 计算单个兵种的基础打熊伤害。
 *
 * D = k * sqrt(min(N, 5000)) * sqrt(n) * C_d * C_t * (1 + P) * (1 + A)
 *
 * 第一个根号只由整支实际参战总兵数 N 决定；sqrt(n) 始终直接使用
 * 当前兵种兵数，不按 5000 截断。
 *
 * 本函数不包含英雄、车身、火晶技能、易伤、额外伤害或减防，也不取整。
 */
export function calculateBaseTroopDamage(
  input: BaseTroopDamageInput,
): BaseTroopDamageResult {
  validateBaseTroopDamageInput(input);

  const troopDamageCoefficient = troopDamageCoefficients[input.troopType];
  const troopLevelConstant = getTroopLevelConstant(input.troopLevelId);
  const attackMultiplier = percentageToMultiplier(input.stats.attackPercent);
  const penetrationMultiplier = percentageToMultiplier(
    input.stats.penetrationPercent,
  );
  const branch =
    input.totalTroopCount < TROOP_COUNT_THRESHOLD
      ? "below-5000"
      : "at-or-above-5000";

  const effectiveTotalCount = Math.min(
    input.totalTroopCount,
    TROOP_COUNT_THRESHOLD,
  );

  const totalCountFactor = Math.sqrt(effectiveTotalCount);
  const troopCountFactor = Math.sqrt(input.troopCount);

  const damage =
    BASE_DAMAGE_K *
    totalCountFactor *
    troopCountFactor *
    troopDamageCoefficient *
    troopLevelConstant *
    penetrationMultiplier *
    attackMultiplier;

  return {
    troopType: input.troopType,
    troopLevelId: input.troopLevelId,
    totalTroopCount: input.totalTroopCount,
    troopCount: input.troopCount,
    branch,
    factors: {
      k: BASE_DAMAGE_K,
      totalCountFactor,
      troopCountFactor,
      troopDamageCoefficient,
      troopLevelConstant,
      attackMultiplier,
      penetrationMultiplier,
    },
    damage,
  };
}
