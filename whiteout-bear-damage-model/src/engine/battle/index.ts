export {
  calculateBattleDamageFromCatalog,
  createBattleDamageCalculator,
} from "./calculateBattleDamage";
export type { BattleDamageCalculatorDependencies } from "./calculateBattleDamage";
export {
  BattleDamageCalculationError,
  IncompatibleHeadHeroSlotError,
  TooManyBodyHeroesError,
  UnknownBodyHeroError,
  UnknownHeadHeroError,
  UnknownHeadHeroTroopTypeError,
  UnsupportedBodyHeroError,
} from "./errors";
