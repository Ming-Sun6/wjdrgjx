import type { TroopType } from "../../domain/troop";

/** C_d：各兵种基础伤害系数。 */
export const troopDamageCoefficients = {
  shield: 1,
  lancer: 3,
  marksman: 4,
} as const satisfies Record<TroopType, number>;
