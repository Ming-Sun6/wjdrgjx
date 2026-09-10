import type { BattleDamageResult } from "./battleDamage";
import type { DamageBreakdown } from "./damageComponent";
import type { ActiveEffect, BattleState } from "./battleState";
import type {
  BattleTotalDamageResult,
  BearBattleContext,
  BearBattleDamageInput,
  BearBattleOptions,
} from "./bearBattle";
import type {
  EffectType,
  ProbabilityTriggerFrequency,
  ProbabilityTriggerPhase,
  SkillEffect,
  SkillTrigger,
} from "./skill";
import type { TroopType } from "./troop";
import type { TriggerChainProbabilityTransition } from "./battleEvent";
import type { TroopMultiplierBreakdown } from "./battleDamage";

export const DEFAULT_PROBABILITY_TOLERANCE = 1e-12;

export interface AccumulatedBattleDamage {
  readonly shieldDamage: number;
  readonly lancerDamage: number;
  readonly marksmanDamage: number;
  readonly totalDamage: number;
  readonly normalDamage: number;
  readonly extraDamage: number;
  readonly primaryAttackDamage: number;
  readonly extraAttackDamage: number;
}

/** 某个未来战斗状态及其概率；累计伤害是该状态条件下的期望累计值。 */
export interface WeightedBattleState {
  readonly probability: number;
  readonly state: BattleState;
  readonly accumulatedDamage: AccumulatedBattleDamage;
  /** 仅供下一次伤害结算使用；不属于会跨回合保存的 BattleState。 */
  readonly transientEffects?: readonly TransientSkillEffect[];
}

type ProbabilitySkillTrigger = Extract<
  SkillTrigger,
  { readonly type: "probability" }
>;

/** 精确传播的事件必须显式声明判定阶段；未声明阶段的游戏数据仍不可计算。 */
export type ExplicitProbabilitySkillTrigger = Omit<
  ProbabilitySkillTrigger,
  "triggerPhase"
> & {
  readonly triggerPhase: ProbabilityTriggerPhase;
};

/** 本阶段可执行的即时概率事件还必须明确声明判定频率。 */
export type InstantProbabilitySkillTrigger = Omit<
  ExplicitProbabilitySkillTrigger,
  "durationRounds" | "frequency"
> & {
  readonly frequency: ProbabilityTriggerFrequency;
  readonly durationRounds?: never;
};

export interface TransientSkillEffect {
  readonly id: string;
  readonly sourceSkillId: string;
  readonly sourceSkillName: string;
  readonly effectIndex: number;
  readonly effect: SkillEffect & { readonly lifecycle?: never };
  readonly triggerProbability: number;
  readonly triggerPhase: ProbabilityTriggerPhase;
  readonly triggerFrequency: ProbabilityTriggerFrequency;
}

export interface ProbabilityTransitionContext {
  readonly battleContext: BearBattleContext;
  readonly round: number;
  readonly eventId: string;
  readonly triggerPhase: ProbabilityTriggerPhase;
}

/**
 * 一个由场景明确安排的 Bernoulli 事件。
 * 回调只改变 BattleState，不得自行计算或修改伤害。
 */
interface BernoulliTransitionBase {
  readonly id: string;
  readonly trigger: ExplicitProbabilitySkillTrigger;
}

export interface StatefulBernoulliTransition extends BernoulliTransitionBase {
  readonly kind?: "stateTransition";
  readonly applyTriggered: (
    state: BattleState,
    context: ProbabilityTransitionContext,
  ) => BattleState;
  readonly applyNotTriggered?: (
    state: BattleState,
    context: ProbabilityTransitionContext,
  ) => BattleState;
}

/** 触发分支只携带当前伤害结算使用的效果，不修改 BattleState。 */
export interface InstantProbabilityEffectTransition
  extends BernoulliTransitionBase {
  readonly kind: "instantEffects";
  readonly trigger: InstantProbabilitySkillTrigger;
  readonly transientEffects: readonly TransientSkillEffect[];
}

export type BernoulliStateTransition =
  | StatefulBernoulliTransition
  | InstantProbabilityEffectTransition
  | TriggerChainProbabilityTransition;

export interface ProbabilityRoundContext {
  readonly battleContext: BearBattleContext;
  readonly round: number;
}

/**
 * before/afterDamage 是软件结算边界，不代表任何真实英雄的已确认时序。
 * 每个数组内事件按声明顺序处理，并视为条件独立的 Bernoulli 判定。
 */
export interface ProbabilityRoundPlan {
  readonly beforeDamageEvents?: readonly BernoulliStateTransition[];
  readonly afterDamageEvents?: readonly BernoulliStateTransition[];
}

export interface ExactProbabilityScenario {
  readonly id: string;
  readonly createRoundPlan: (
    context: ProbabilityRoundContext,
  ) => ProbabilityRoundPlan;
  /** 持续时间递减等时序必须由测试或未来已确认规则显式提供。 */
  readonly transitionAfterRound?: (
    state: BattleState,
    context: ProbabilityRoundContext,
  ) => BattleState;
}

export interface ExpectedRoundDamageResult {
  readonly round: number;
  /** 未应用任何技能乘区前，既有单回合基础公式的期望值。 */
  readonly expectedBaseDamage: number;
  /** normalDamage - baseDamage；包含乘区增量及extraAttack产生的普通伤害。 */
  readonly expectedSkillDamage: number;
  readonly expectedShieldDamage: number;
  readonly expectedLancerDamage: number;
  readonly expectedMarksmanDamage: number;
  readonly expectedTotalDamage: number;
  readonly expectedNormalDamage: number;
  readonly expectedExtraDamage: number;
  readonly expectedPrimaryAttackDamage: number;
  readonly expectedExtraAttackDamage: number;
  readonly expectedAttackCount: number;
  readonly expectedActiveEffects: readonly ExpectedActiveEffectState[];
  readonly expectedMultipliersByTroop: Readonly<
    Partial<Record<TroopType, TroopMultiplierBreakdown>>
  >;
  readonly enemyDefense: ExpectedRoundEnemyDefense;
  readonly expectedTroopDamageBreakdowns: Readonly<
    Partial<Record<TroopType, DamageBreakdown>>
  >;
  readonly probabilityMass: number;
  readonly stateCountAtStart: number;
  readonly statesBeforeMerge: number;
  readonly statesAfterMerge: number;
  readonly instantProbabilityEvents: readonly InstantProbabilityEventReport[];
}

export interface ExpectedActiveEffectState {
  readonly id: string;
  readonly sourceSkillId: string;
  readonly effectType: EffectType;
  readonly targetTroop: SkillEffect["targetTroop"];
  /** 当前回合伤害结算时该状态存在且生效的概率。 */
  readonly activeProbability: number;
  /** 未条件化的概率加权状态值，便于UI解释分支。 */
  readonly expectedStackCount: number;
  readonly expectedApplicationCount: number;
  readonly expectedRemainingRounds: number | null;
}

export interface ExpectedRoundEnemyDefense {
  readonly enemyBaseDefense: number | null;
  readonly expectedEffectiveDefenseByTroop: Readonly<
    Partial<Record<TroopType, number | null>>
  >;
  readonly expectedDefenseReductionMultiplierByTroop: Readonly<
    Partial<Record<TroopType, number>>
  >;
  /** 伤害仍由既有1+sum(r)等效乘区应用一次；这里仅给出对应防御解释值。 */
  readonly defenseReductionAppliedExactlyOnce: true;
}

export interface InstantProbabilityEffectReport {
  readonly type: EffectType;
  readonly value: number;
  readonly targetTroop: SkillEffect["targetTroop"];
}

/**
 * 只报告判定概率和效果配置，不伪造具有顺序依赖的单技能边际伤害。
 */
export interface InstantProbabilityEventReport {
  readonly round: number;
  readonly eventId: string;
  readonly skillId: string;
  readonly skillName: string;
  readonly triggerProbability: number;
  readonly triggerPhase: ProbabilityTriggerPhase;
  readonly triggerFrequency: ProbabilityTriggerFrequency;
  readonly effects: readonly InstantProbabilityEffectReport[];
}

export interface ProbabilityEngineStatistics {
  /** 各回合完成全部分裂后的状态数之和。 */
  readonly statesBeforeMerge: number;
  /** 各回合完成精确合并后的状态数之和。 */
  readonly statesAfterMerge: number;
  readonly maxStatesInAnyRound: number;
  readonly finalStateCount: number;
  readonly elapsedMs: number;
}

export interface DamageDistributionPoint {
  readonly damage: number;
  readonly probability: number;
}

/** 当前模型已纳入随机触发所形成的离散10回合总伤害分布。 */
export interface DamageDistributionResult {
  readonly points: readonly DamageDistributionPoint[];
  readonly lower95: number;
  readonly upper95: number;
  readonly method: "exactStateDistribution" | "deterministicCompressedStateDistribution";
}

export interface ExpectedBattleDamageResult {
  readonly context: BearBattleContext;
  readonly expectedBaseDamage: number;
  readonly expectedSkillDamage: number;
  readonly expectedTotalDamage: number;
  readonly expectedShieldDamage: number;
  readonly expectedLancerDamage: number;
  readonly expectedMarksmanDamage: number;
  readonly expectedNormalDamage: number;
  readonly expectedExtraDamage: number;
  readonly expectedPrimaryAttackDamage: number;
  readonly expectedExtraAttackDamage: number;
  readonly expectedAttackCount: number;
  readonly expectedTroopDamageBreakdowns: Readonly<
    Partial<Record<TroopType, DamageBreakdown>>
  >;
  readonly expectedRoundDamage: readonly ExpectedRoundDamageResult[];
  readonly instantProbabilityEvents: readonly InstantProbabilityEventReport[];
  readonly finalStates: readonly WeightedBattleState[];
  readonly statistics: ProbabilityEngineStatistics;
  /** 仅在显式请求时生成；优化候选评分默认不承担完整分布成本。 */
  readonly damageDistribution?: DamageDistributionResult;
}

export interface ExpectedBattleDamageOptions extends BearBattleOptions {
  readonly scenario?: ExactProbabilityScenario;
  readonly probabilityTolerance?: number;
  readonly includeDamageDistribution?: boolean;
}

export interface ExpectedBattleDamageDependencies {
  readonly calculateDamageForState: (
    input: BearBattleDamageInput,
    activeEffects: readonly ActiveEffect[],
    transientEffects: readonly TransientSkillEffect[],
    round: number,
  ) => BattleDamageResult;
  readonly calculateDeterministicBattleDamage?: (
    input: BearBattleDamageInput,
    options?: BearBattleOptions,
  ) => BattleTotalDamageResult;
}
