export type {
  BaseDamageBranch,
  BaseTotalDamageInput,
  BaseTotalDamageResult,
  BaseTroopDamageFactors,
  BaseTroopDamageInput,
  BaseTroopDamageResult,
  BaseTroopGroupInput,
} from "./domain/baseDamage";
export type {
  AttackDamageResult,
  AttackEvent,
  AttackKind,
  AttackPhase,
  AttackResolutionStep,
  AttackSequenceResult,
} from "./domain/attack";
export { ATTACK_PHASES } from "./domain/attack";
export { BATTLE_EVENT_TYPES } from "./domain/battleEvent";
export type {
  BattleEvent,
  BattleEventType,
  LinkedSkillDefinition,
  SkippedTriggerChainEffect,
  TriggerChainBranch,
  TriggerChainEffectDefinition,
  TriggerChainProbabilityTransition,
  TriggerChainResolution,
  TriggeredSkillDefinition,
} from "./domain/battleEvent";
export type {
  AppliedSkillSummary,
  BattleDamageInput,
  BattleDamageResult,
  BattleTroopDamageResult,
  HeadFormation,
  SelectedBodyHero,
  SelectedHeadHero,
  SkippedSkillSummary,
  TroopMultiplierBreakdown,
} from "./domain/battleDamage";
export type {
  DamageBreakdown,
  DamageComponentInput,
  DamageComponentKind,
  ResolvedDamageComponent,
} from "./domain/damageComponent";
export type {
  BattleTotalDamageResult,
  BearBattleContext,
  BearBattleDamageInput,
  BearBattleOptions,
  BearEnemyDefenseState,
  EnemyEffectiveDefenseStatus,
  RoundActiveEffects,
  RoundDamageResult,
} from "./domain/bearBattle";
export type {
  BodyOptimizationCandidateResult,
  BodyOptimizationInput,
  BodyOptimizationOptions,
  BodyOptimizationResult,
} from "./domain/bodyOptimization";
export type { AggregatedBodyEffect, BodySkillOption, BodySkillOptionId } from "./domain/bodySkillOption";
export { APP_TITLE, APP_VERSION } from "./app/version";
export type {
  BattleSetupOptimizationCandidateResult,
  BattleSetupOptimizationInput,
  BattleSetupOptimizationOptions,
  BattleSetupOptimizationResult,
} from "./domain/battleSetupOptimization";
export type {
  FireCrystalConfiguration,
  FireCrystalOptimizationDimension,
  FullBattleSetupCandidate,
  FullBattleSetupOptimizationInput,
  FullBattleSetupOptimizationOptions,
  FullBattleSetupOptimizationResult,
  FullBodyDimension,
  FullRatioDimension,
  HeadOptimizationDimension,
  HeadSlotDimension,
  OptimizationDimension,
} from "./domain/fullBattleSetupOptimization";
export type {
  TroopCounts,
  TroopRatioBounds,
  TroopRatioOptimizationCandidateResult,
  TroopRatioOptimizationInput,
  TroopRatioOptimizationOptions,
  TroopRatioOptimizationResult,
  TroopRatios,
  TroopRatioSettings,
} from "./domain/troopRatioOptimization";
export type {
  BodyHeroDefinition,
  BodyHeroId,
  HeadHeroCatalog,
  HeadHeroDefinition,
  HeadHeroId,
  HeadSkillReference,
  HeroCalculationStatus,
  HeroCatalog,
  HeroDefinition,
  HeroId,
  HeroRole,
  HeroSkillDefinition,
  HeroSkillDefinitionBase,
  HeroTier,
  PendingHeroDefinition,
  PendingHeroSkillDefinition,
  SupportedHeroDefinition,
  SupportedHeroSkillDefinition,
  UnsupportedHeroDefinition,
  UnsupportedHeroSkillDefinition,
} from "./domain/hero";
export type {
  KnownTroopLevel,
  MissingTroopLevel,
  TroopLevel,
  TroopLevelDataStatus,
  TroopLevelId,
  TroopStats,
  TroopType,
  TroopTypeDefinition,
} from "./domain/troop";
export {
  DAMAGE_CATEGORIES,
  EFFECT_TYPES,
  EXTRA_DAMAGE_BASES,
  PROBABILITY_TRIGGER_FREQUENCIES,
  PROBABILITY_TRIGGER_PHASES,
} from "./domain/skill";
export type {
  DamageCategory,
  DamageChannel,
  EffectType,
  MultiplicativeEffectType,
  ResolvedSkillEffect,
  Skill,
  SkillCalculationStatus,
  SkillEffect,
  SkillEffectData,
  SkillEffectTarget,
  SkillTrigger,
  EffectActivationTiming,
  EffectLifecycle,
  EffectRefreshMode,
  ExtraAttackTriggerPolicy,
  NumericConditionOperator,
  ExtraDamageBasis,
  ExtraDamageCategory,
  StackLimitBehavior,
  ProbabilityTriggerPhase,
  ProbabilityTriggerFrequency,
  SkillEffectCondition,
  TriggeredEffectApplication,
} from "./domain/skill";
export type {
  FireCrystalSkill,
  PendingTroopSkillDefinition,
  SupportedTroopSkillDefinition,
  TroopSkillDefinition,
  TroopSkillId,
  UnsupportedTroopSkillDefinition,
} from "./domain/troopSkill";
export type {
  DataValidationIssue,
  DataValidationResult,
  SkillCatalogAuditRecord,
  SkillCatalogCategory,
  SkillStatusCounts,
  SkillSupportCounts,
  SkillSupportReport,
  SkillSupportReportEntry,
} from "./domain/skillAudit";
export type {
  ActiveEffect,
  ActiveEffectIdentity,
  BattleState,
  RoundState,
  RoundPhase,
  TriggerContext,
  TriggerResolution,
} from "./domain/battleState";
export { DEFAULT_PROBABILITY_TOLERANCE } from "./domain/probability";
export type {
  AccumulatedBattleDamage,
  BernoulliStateTransition,
  ExactProbabilityScenario,
  ExpectedBattleDamageDependencies,
  ExpectedBattleDamageOptions,
  ExpectedBattleDamageResult,
  ExpectedActiveEffectState,
  ExpectedRoundDamageResult,
  ExpectedRoundEnemyDefense,
  ExplicitProbabilitySkillTrigger,
  InstantProbabilityEffectReport,
  InstantProbabilityEffectTransition,
  InstantProbabilityEventReport,
  InstantProbabilitySkillTrigger,
  ProbabilityEngineStatistics,
  ProbabilityRoundContext,
  ProbabilityRoundPlan,
  ProbabilityTransitionContext,
  StatefulBernoulliTransition,
  TransientSkillEffect,
  WeightedBattleState,
} from "./domain/probability";
export { OPTIMIZER_SCORING_MODES } from "./domain/optimizerScoring";
export type {
  ExpectedOptimizationFields,
  OptimizationPerformanceStats,
  OptimizerScoringMode,
} from "./domain/optimizerScoring";
export type {
  AppliedRealSkill,
  FireCrystalSettings,
  SkippedRealSkill,
  TenRoundExpectedDamageBreakdown,
  TenRoundExpectedDamageDependencies,
  TenRoundExpectedDamageInput,
  TenRoundExpectedDamageOptions,
  TenRoundExpectedDamageResult,
  TenRoundSkillRoundExplanation,
  ExpectedStackChange,
} from "./domain/tenRoundExpectedDamage";
export type {
  BattleReportHeroAdjustmentConfig,
  BattleReportHeroSelection,
  HeroStaticCombatStats,
  ReportHeroProfile,
  ReportHeroProfileId,
  ReportHeroRarity,
  ResolvedBattleReportAttributeAdjustment,
  ResolveBattleReportAttributesInput,
} from "./domain/reportHero";
export * from "./domain/preparation";
export * from "./game-data/systems/progression";
export * from "./systems/preparation";
export * from "./systems/reportHeroAdjustment";
export * from "./engine/rounds";
export * from "./engine/attacks";
export * from "./engine/trigger-chain";
export * from "./engine/damage";
export * from "./engine/probability";
export { troopDamageCoefficients } from "./game-data/troops/troopDamageCoefficients";
export { troopLevels } from "./game-data/troops/troopLevels";
export { troopTypes } from "./game-data/troops/troopTypes";
export { bodyHeroCatalog } from "./game-data/heroes/bodyHeroCatalog";
export { bodyHeroes } from "./game-data/heroes/bodyHeroes";
export * from "./game-data/body-skills";
export { headHeroCatalog } from "./game-data/heroes/headHeroCatalog";
export { headHeroes } from "./game-data/heroes/headHeroes";
export {
  getAllBodyHeroes,
  getHeroById,
  getPendingBodyHeroes,
  getSupportedBodyHeroes,
  getUnsupportedBodyHeroes,
} from "./game-data/heroes/bodyHeroQueries";
export {
  getAllHeadHeroes,
  getHeadHeroById,
  getHeadHeroesByTroopType,
  getPendingHeadSkills,
  getSupportedHeadSkills,
  getUnsupportedHeadSkills,
} from "./game-data/heroes/headHeroQueries";
export * from "./game-data/heroes/reportHeroProfiles";
export * from "./game-data/troop-skills";
export * from "./game-data/skills";
export * from "./data-audit";
export * from "./rulesets/bear/base-damage";
export * from "./rulesets/bear/battle";
export * from "./engine/skills";
export * from "./engine/battle";
export * from "./engine/heroes";
export {
  calculateBattleDamage,
  calculateBattleDamageWithAdditionalSkills,
} from "./app/calculateBattleDamage";
export {
  calculateTenRoundExpectedDamage,
  createTenRoundExpectedDamageCalculator,
} from "./app/calculateTenRoundExpectedDamage";
export * from "./app/tenRoundExpectedDamageErrors";
export { combinationsWithReplacement } from "./optimizer/combinationsWithReplacement";
export * from "./optimizer/body-heroes";
export * from "./optimizer/troop-ratio";
export * from "./optimizer/battle-setup";
export * from "./optimizer/evaluation";
export * from "./optimizer/full-setup";
