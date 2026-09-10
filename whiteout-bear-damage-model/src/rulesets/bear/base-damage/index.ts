export { calculateBaseTroopDamage } from "./calculateBaseTroopDamage";
export { calculateBaseTotalDamage } from "./calculateBaseTotalDamage";
export { BASE_DAMAGE_K, TROOP_COUNT_THRESHOLD } from "./constants";
export {
  InvalidBaseDamageInputError,
  MissingTroopLevelConstantError,
  UnknownTroopLevelError,
} from "./errors";
export { percentageToDecimal, percentageToMultiplier } from "./percent";
