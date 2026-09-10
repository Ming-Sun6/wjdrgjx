import type { MultiplicativeEffectType } from "../../../domain/skill";
import { additiveMultiplierResolver } from "./additiveMultiplierResolver";
import { defenseReductionResolver } from "./defenseReductionResolver";
import type { MultiplierResolver } from "./MultiplierResolver";

/**
 * 乘区与计算方法的集中注册表。减防仍使用独立 resolver，便于单独维护。
 */
export const multiplierResolverRegistry = {
  attack: additiveMultiplierResolver,
  penetration: additiveMultiplierResolver,
  defenseReduction: defenseReductionResolver,
  baseDamageIncrease: additiveMultiplierResolver,
  normalAttackDamageIncrease: additiveMultiplierResolver,
  skillDamageIncrease: additiveMultiplierResolver,
  damageIncrease: additiveMultiplierResolver,
  vulnerable: additiveMultiplierResolver,
  normalAttackDamage: additiveMultiplierResolver,
  skillDamage: additiveMultiplierResolver,
  shieldDamage: additiveMultiplierResolver,
  lancerDamage: additiveMultiplierResolver,
  marksmanDamage: additiveMultiplierResolver,
  troopVsTroopDamage: additiveMultiplierResolver,
  buffAttack: additiveMultiplierResolver,
  buffPenetration: additiveMultiplierResolver,
  buffDefenseReduction: additiveMultiplierResolver,
  expertBearDamage: additiveMultiplierResolver,
} as const satisfies Record<MultiplicativeEffectType, MultiplierResolver>;
