import type { TroopType } from "./troop";

/**
 * 当前效果类型：可乘算效果，以及分别独立结算的 extraDamage 与 extraAttack。
 * 新增可乘算乘区时需要同时注册对应 resolver，
 * 防止配置中的拼写错误被静默忽略。
 */
export const EFFECT_TYPES = [
  "attack",
  "penetration",
  "defenseReduction",
  "baseDamageIncrease",
  "normalAttackDamageIncrease",
  "skillDamageIncrease",
  /** 旧数据兼容别名；正式打熊数据使用上面的 Increase 命名。 */
  "damageIncrease",
  "extraDamage",
  "extraAttack",
  "vulnerable",
  "normalAttackDamage",
  "skillDamage",
  "shieldDamage",
  "lancerDamage",
  "marksmanDamage",
  "troopVsTroopDamage",
  "buffAttack",
  "buffPenetration",
  "buffDefenseReduction",
  "expertBearDamage",
] as const;

export type EffectType = (typeof EFFECT_TYPES)[number];
export type SkillCalculationStatus = "supported" | "pending" | "unsupported";
export type MultiplicativeEffectType = Exclude<EffectType, "extraDamage" | "extraAttack">;
export type DamageChannel = "base" | "normalAttack" | "skill";
export type SkillEffectTarget = TroopType | "all";

export type NumericConditionOperator = "eq" | "gte" | "lte" | "gt" | "lt";

/** 通用联动条件；具体值均从当前事件、BattleContext或BattleState读取。 */
export type SkillEffectCondition =
  | { readonly type: "sourceSkillTriggered"; readonly requiredSkillId: string }
  | { readonly type: "attackerTroopType"; readonly troopType: TroopType }
  | { readonly type: "enemyTroopType"; readonly troopType: TroopType }
  | { readonly type: "attackKind"; readonly attackKind: "normal" | "extra" }
  | {
      readonly type: "round";
      readonly operator: NumericConditionOperator;
      readonly value: number;
    }
  | {
      readonly type: "stackCount";
      readonly activeEffectId: string;
      readonly operator: NumericConditionOperator;
      readonly value: number;
    };

/** 联动命中后如何交给现有执行层；不隐式推断生命周期。 */
export type TriggeredEffectApplication = "transient" | "duration" | "stack";

/**
 * extraDamage 的基准必须由数据显式声明。不同名称即使在当前基础模型中
 * 暂时落到同一个数值，也会保留语义，避免以后细分普攻/技能伤害时迁移数据。
 */
export const EXTRA_DAMAGE_BASES = [
  "baseDamage",
  "normalAttackDamage",
  "preMultiplierDamage",
  "postMultiplierDamage",
] as const;

export type ExtraDamageBasis = (typeof EXTRA_DAMAGE_BASES)[number];

export const DAMAGE_CATEGORIES = [
  "base",
  "normalAttack",
  "skill",
  "extra",
] as const;

export type DamageCategory = (typeof DAMAGE_CATEGORIES)[number];
export type ExtraDamageCategory = Exclude<DamageCategory, "base">;

export interface ExtraAttackTriggerPolicy {
  readonly beforeAttack: boolean;
  readonly onAttack: boolean;
  readonly afterAttack: boolean;
  readonly canTriggerExtraAttack: boolean;
  readonly canTriggerExtraDamage: boolean;
}

export type EffectRefreshMode = "refresh" | "replace" | "stack";
export type EffectActivationTiming = "immediate" | "nextRound";
export type StackLimitBehavior = "keep" | "refreshDuration";

/**
 * 多个技能实例命中同一个非叠幅状态时，先合并触发概率，再应用一次固定幅度。
 * groupId 来自数据层；引擎不得通过英雄名称推断分组。
 */
export interface ProbabilityInstanceAggregation {
  readonly groupId: string;
  readonly stackingMode: "probabilityOnly";
  readonly magnitudeStacking: false;
}

/**
 * 同一技能在一回合内按兵种分别进行一次独立 Bernoulli 判定。
 * 该字段只描述判定粒度；伤害引擎仍由 SkillEffect.targetTroop 决定效果目标。
 */
export type IndependentTroopProbabilityTargets = readonly TroopType[];

/**
 * 普通攻击计数器的资料层语义。当前熊模型每个兵种每回合恰有一次普通攻击，
 * 因而可由 everyNRounds 的显式回合表精确调度；counterId 用于声明多个技能共享计数器。
 */
export interface NormalAttackCounterRule {
  readonly counterId: string;
  readonly troopType: TroopType | "allIndependent";
  readonly attacksPerTrigger: number;
  readonly firstTriggerAttack: number;
  readonly counts: "normalAttackOnly";
}

export type CritAppliesTo = "normalAttackOnly";

/**
 * 概率判定所依附的事件阶段。
 * 这里只表达数据，不声明真实游戏中任一技能在哪个阶段判定。
 */
export const PROBABILITY_TRIGGER_PHASES = [
  "roundStart",
  "beforeAttack",
  "onAttack",
  "afterAttack",
  "roundEnd",
] as const;

export type ProbabilityTriggerPhase =
  (typeof PROBABILITY_TRIGGER_PHASES)[number];

/**
 * 概率判定频率只描述数据，不会被概率引擎擅自解释成具体回合安排。
 * `explicitSchedule` 用于测试或已经由外部规则明确列出判定次数的场景。
 */
export const PROBABILITY_TRIGGER_FREQUENCIES = [
  "oncePerBattle",
  "oncePerRound",
  "oncePerAttack",
  "explicitSchedule",
] as const;

export type ProbabilityTriggerFrequency =
  (typeof PROBABILITY_TRIGGER_FREQUENCIES)[number];

/** 仅声明生命周期规则，不代表触发时序已经确认。 */
export interface EffectLifecycle {
  readonly durationRounds?: number;
  /** 明确持续效果从触发当回合还是下一回合开始生效。 */
  readonly activationTiming?: EffectActivationTiming;
  readonly refreshMode?: EffectRefreshMode;
  readonly maxStacks?: number;
  /** 达到层数上限后的行为必须显式配置，不能由引擎猜测。 */
  readonly atMaxStacks?: StackLimitBehavior;
  /** 后一次效果相对前一次的比例；不在当前伤害函数中应用。 */
  readonly decayRate?: number;
  readonly maxApplications?: number;
}

/**
 * 普通乘区 value 使用小数（0.25 = +25%），未指定目标时默认为 all。
 * extraDamage 在basis/category/适用乘区完整且显式supported时独立结算；
 * extraAttack 必须额外声明次数、比例、触发策略和递归上限后才能正式执行。
 */
export interface SkillEffect {
  readonly type: EffectType;
  readonly value: number;
  /** 线性叠层时每层的独立数值；不与 applicationCount/decay 混用。 */
  readonly valuePerStack?: number;
  /** extraDamage 专用：明确伤害基准，缺失时不得正式结算。 */
  readonly basis?: ExtraDamageBasis;
  /** extraDamage 专用：声明该伤害段属于普攻、技能或独立额外伤害。 */
  readonly damageCategory?: ExtraDamageCategory;
  /** extraDamage 专用：仅应用这里显式列出的技能乘区。 */
  readonly applicableMultiplierZones?: readonly MultiplicativeEffectType[];
  /** extraAttack 专用：产生的额外攻击次数。 */
  readonly count?: number;
  /** extraAttack 专用：新攻击事件自身的基础伤害比例。 */
  readonly damageScale?: number;
  /** extraAttack 专用：新攻击允许经过和继续触发的阶段。 */
  readonly triggerPolicy?: ExtraAttackTriggerPolicy;
  /** extraAttack 专用：触发链的显式深度上限。 */
  readonly maxAttackDepth?: number;
  readonly targetTroop?: SkillEffectTarget;
  readonly lifecycle?: EffectLifecycle;
  /** 复杂技能允许效果级条件；普通always解析器不会静默忽略它。 */
  readonly conditions?: readonly SkillEffectCondition[];
  readonly triggerApplication?: TriggeredEffectApplication;
  readonly maxTriggerDepth?: number;
  /** replace时，本次结算仅采用同乘区replace效果，忽略普通加算效果。 */
  readonly zoneAggregation?: "additive" | "replace";
  /** 已确认的固定回合集合；为空或省略表示每回合。 */
  readonly activeRounds?: readonly number[];
  /** 逐回合确定值，下标0对应round1。 */
  readonly valueByRound?: readonly number[];
  readonly valueByEnemyTroop?: Readonly<Partial<Record<TroopType, number>>>;
  /** 数据目录中的显式状态；旧测试/合成输入缺省时按 supported 处理。 */
  readonly status?: SkillCalculationStatus;
  readonly rawDescription?: string;
  readonly pendingReason?: string;
}

/**
 * 数据层的效果记录。type/value 可以在资料不足时为 null；只有 supported
 * 且字段完整的记录才能转换为伤害引擎使用的 SkillEffect。
 */
export interface SkillEffectData {
  readonly id: string;
  readonly status: SkillCalculationStatus;
  readonly type: EffectType | null;
  readonly value: number | null;
  /** 资料只给出多个技能等级数值、但尚未知道玩家等级或结算语义时保留。 */
  readonly valueOptions?: readonly number[];
  readonly targetTroop?: SkillEffectTarget;
  readonly targetEnemyTroop?: SkillEffectTarget;
  readonly trigger?: SkillTrigger | null;
  readonly conditions?: readonly SkillEffectCondition[];
  readonly triggerApplication?: TriggeredEffectApplication;
  readonly maxTriggerDepth?: number | null;
  readonly zoneAggregation?: "additive" | "replace";
  readonly activeRounds?: readonly number[];
  readonly valueByRound?: readonly number[];
  readonly valueByEnemyTroop?: Readonly<Partial<Record<TroopType, number>>>;
  readonly lifecycle?: EffectLifecycle;
  readonly valuePerStack?: number | null;
  readonly basis?: ExtraDamageBasis | null;
  readonly damageCategory?: ExtraDamageCategory | null;
  readonly applicableMultiplierZones?: readonly MultiplicativeEffectType[] | null;
  readonly count?: number | null;
  readonly damageScale?: number | null;
  readonly triggerPolicy?: ExtraAttackTriggerPolicy | null;
  readonly maxAttackDepth?: number | null;
  readonly rawDescription: string;
  readonly pendingReason?: string;
  readonly unsupportedReason?: string;
}

export type SkillTrigger =
  | {
      readonly type: "always";
    }
  | {
      readonly type: "probability";
      /** 常规技能解析器不会直接按 p×增益计算；精确概率场景另行传播状态。 */
      readonly probability: number;
      /**
       * 必须由已确认规则或显式测试场景指定；缺省时仍只是未实现的数据。
      */
      readonly triggerPhase?: ProbabilityTriggerPhase;
      /** 未提供时不能作为本阶段正式的即时概率技能执行。 */
      readonly frequency?: ProbabilityTriggerFrequency;
      /** 已知的触发事件；当前仅作为数据保存，不参与计算。 */
      readonly event?: "beforeAttack" | "afterAttack" | "onSkillTrigger";
      /** event=onSkillTrigger时声明被监听的技能；不能由名称推断。 */
      readonly requiredSkillId?: string;
      /** 概率效果持续回合数；当前仅作为数据保存，不参与计算。 */
      readonly durationRounds?: number;
      /** 同一回合相互独立的判定次数；省略为1。 */
      readonly attemptsPerRound?: number;
      /** 每个列出的兵种分别独立判定；不得折叠成一次全军概率。 */
      readonly independentTroopTargets?: IndependentTroopProbabilityTargets;
      /** explicitSchedule使用；仅在列出的回合判定。 */
      readonly triggerRounds?: readonly number[];
      /** 多实例共享同一状态时的精确概率合并规则。 */
      readonly instanceAggregation?: ProbabilityInstanceAggregation;
    }
  | {
      readonly type: "everyNRounds";
      readonly interval: number;
      readonly firstTriggerRound?: number;
      readonly triggerPhase?: ProbabilityTriggerPhase;
      /** 缺省表示确定性触发；提供时仅在周期回合做Bernoulli判定。 */
      readonly probability?: number;
      /** 旧配置兼容字段；正式执行要求使用 firstTriggerRound。 */
      readonly firstRound?: number;
    }
  | {
      readonly type: "beforeAttack";
      readonly attackCount?: number;
    }
  | {
      readonly type: "afterAttack";
      readonly attackCount?: number;
    }
  | {
      readonly type: "onSkillTrigger";
      readonly sourceSkillId?: string;
    }
  | {
      /** 兼容原有预留数据；叠层触发的具体时序尚未确认。 */
      readonly type: "stacking";
      readonly maxStacks: number;
      readonly stackValue?: number;
    };

export interface Skill {
  readonly id: string;
  readonly name: string;
  /** 英雄远征技能按当前已确认规则统一取 5 级；兵种技能可继续使用自身等级配置。 */
  readonly level?: number;
  /** 自动解锁技能用于与旧的显式配置接口去重；不参与伤害语义。 */
  readonly sourceRecordId?: string;
  readonly sourceKind?: "troopTierSkill" | "fireCrystalSkill" | "system";
  /** 原始文本表达的机制；正式熊模型可以保留其等价的简化映射。 */
  readonly rawMechanicType?: "extraAttack" | "extraDamage";
  /** 当前正式熊模型采用的结算语义。 */
  readonly bearModelType?: "extraDamageExpected" | "extraDamage";
  /** 暴击保留为概率普通攻击倍率，不归入全局 damageIncrease。 */
  readonly critProbability?: number;
  readonly critMultiplier?: number;
  readonly critAppliesTo?: CritAppliesTo;
  /** 攻击计数语义；多个技能可用同一 counterId 明确共享计数。 */
  readonly normalAttackCounter?: NormalAttackCounterRule;
  readonly effects: readonly SkillEffect[];
  readonly trigger: SkillTrigger;
  readonly lifecycle?: EffectLifecycle;
  /** 真实数据应填写；旧测试/合成 Skill 缺省时按 supported 处理。 */
  readonly status?: SkillCalculationStatus;
  readonly rawDescription?: string;
  readonly pendingReason?: string;
  readonly source?: string;
}

export interface ResolvedSkillEffect extends SkillEffect {
  readonly skillId: string;
  readonly skillName: string;
  readonly effectIndex: number;
  readonly targetTroop: SkillEffectTarget;
}
