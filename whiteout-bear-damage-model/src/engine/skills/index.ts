export { aggregateMultipliers } from "./aggregateMultipliers";
export type {
  AggregatedMultipliers,
  AggregateMultiplierContext,
} from "./aggregateMultipliers";
export { calculateTroopDamageWithMultipliers } from "./calculateTroopDamageWithMultipliers";
export type {
  TroopDamageWithMultipliersInput,
  TroopDamageWithMultipliersResult,
} from "./calculateTroopDamageWithMultipliers";
export {
  InvalidSkillEffectError,
  SkillEffectResolutionError,
  UnknownEffectTypeError,
  UnsupportedSkillTriggerError,
  UnsupportedSkillLifecycleError,
  UnsupportedSkillDataStatusError,
  UnsupportedSkillEffectDataStatusError,
} from "./errors";
export { resolveSkillEffects } from "./resolveSkillEffects";
export * from "./resolveSupportedCatalogEffects";
export { defenseReductionResolver } from "./resolvers/defenseReductionResolver";
export { multiplierResolverRegistry } from "./resolvers/resolverRegistry";
