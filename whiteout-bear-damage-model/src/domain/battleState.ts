import type { BearBattleContext } from "./bearBattle";
import type {
  EffectActivationTiming,
  EffectLifecycle,
  SkillEffect,
  SkillTrigger,
} from "./skill";
import type { TroopType } from "./troop";

/** refresh/replace 按完整身份定位，不能仅按 effectType 判断。 */
export interface ActiveEffectIdentity {
  readonly sourceId: string;
  readonly sourceSkillId: string;
  readonly effectId: string;
}

/** 同一个技能的多个来源、多个效果分别拥有唯一实例 ID。 */
export interface ActiveEffect extends EffectLifecycle {
  readonly id: string;
  readonly sourceSkillId: string;
  readonly identity: ActiveEffectIdentity;
  readonly effect: SkillEffect;
  readonly appliesToTroop?: TroopType;
  /** 以下回合字段只在显式持续技能策略中使用。 */
  readonly appliedRound?: number;
  readonly lastAppliedRound?: number;
  readonly activeFromRound?: number;
  readonly activationTiming?: EffectActivationTiming;
  readonly remainingRounds?: number;
  readonly valuePerStack?: number;
  readonly stackCount: number;
  readonly applicationCount: number;
}

/** 固定属性在 BearBattleContext/战斗输入中，此处只保存运行状态。 */
export interface BattleState {
  /** ready 时是待结算回合；completed 时保留 10，不创建第 11 回合。 */
  readonly currentRound: number;
  readonly totalRounds: BearBattleContext["totalRounds"];
  readonly status: "ready" | "completed";
  readonly activeEffects: readonly ActiveEffect[];
}

/** 软件编排阶段，不声明盾/矛/射攻击或复杂技能的游戏先后顺序。 */
export type RoundPhase =
  | "roundStart"
  | "readActiveEffects"
  | "resolveSkills"
  | "calculateDamage"
  | "updateState"
  | "roundEnd";

export interface RoundState {
  readonly round: number;
  readonly phase: RoundPhase;
}

export interface TriggerContext {
  readonly battleContext: BearBattleContext;
  readonly battleState: BattleState;
  readonly roundState: RoundState;
  readonly attackingTroop?: TroopType;
  readonly sourceSkillId?: string;
}

export type TriggerResolution =
  | {
      readonly status: "active";
      readonly triggerType: "always" | "onSkillTrigger";
    }
  | {
      readonly status: "inactive";
      readonly triggerType: "onSkillTrigger";
      readonly reason: string;
    }
  | {
      readonly status: "unimplemented";
      readonly triggerType: Exclude<
        SkillTrigger["type"],
        "always" | "onSkillTrigger"
      >;
      readonly reason: string;
    };
