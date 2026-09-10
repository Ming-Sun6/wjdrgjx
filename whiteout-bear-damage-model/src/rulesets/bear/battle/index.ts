export {
  calculateBearBattleTotalDamage,
  calculateBearBattleTotalDamageFromSingleRound,
  createBearBattleContext,
  createBearBattleTotalDamageCalculator,
  scoreCurrentBearBattleTotalDamage,
} from "./calculateBearBattleTotalDamage";
export type { BearBattleCalculatorDependencies } from "./calculateBearBattleTotalDamage";
export {
  BEAR_BATTLE_TOTAL_ROUNDS,
  BEAR_ENEMY_INFINITE_HP,
  BEAR_ENEMY_TROOP_TYPE,
  DEFAULT_BEAR_BATTLE_CONTEXT,
} from "./constants";
export * from "./errors";
