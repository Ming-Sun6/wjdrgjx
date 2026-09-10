import type { AttackKind } from "./attack";
import type { BattleState } from "./battleState";
import type {
  InstantProbabilitySkillTrigger,
  TransientSkillEffect,
} from "./probability";
import type {
  SkillCalculationStatus,
  SkillEffect,
  SkillEffectCondition,
  SkillTrigger,
  TriggeredEffectApplication,
} from "./skill";
import type { ProbabilityTriggerPhase } from "./skill";
import type { TroopType } from "./troop";

export const BATTLE_EVENT_TYPES = [
  "roundStart",
  "beforeAttack",
  "attack",
  "skillTriggered",
  "damageResolved",
  "afterAttack",
  "roundEnd",
] as const;

export type BattleEventType = (typeof BATTLE_EVENT_TYPES)[number];

/** 统一事件只记录来源关系和判定上下文，不取代现有RoundPhase或AttackEvent。 */
export interface BattleEvent {
  readonly eventId: string;
  readonly type: BattleEventType;
  readonly round: number;
  readonly skillId?: string;
  readonly triggered?: boolean;
  readonly sourceEventId?: string;
  readonly parentEventId?: string;
  readonly rootEventId: string;
  readonly depth: number;
  readonly attackerTroopType?: TroopType;
  readonly enemyTroopType?: TroopType;
  readonly attackKind?: AttackKind;
  readonly triggerPhase?: ProbabilityTriggerPhase;
}

export interface TriggerChainEffectDefinition {
  readonly id: string;
  readonly status: SkillCalculationStatus;
  readonly effect: SkillEffect;
  readonly application: TriggeredEffectApplication;
  readonly conditions?: readonly SkillEffectCondition[];
  readonly pendingReason?: string;
  readonly unsupportedReason?: string;
}

export interface TriggeredSkillDefinition {
  readonly skillId: string;
  readonly skillName: string;
  readonly status: SkillCalculationStatus;
  readonly sourceId?: string;
  readonly effects: readonly TriggerChainEffectDefinition[];
}

/** onSkillTrigger随来源技能生效；probability表示来源成功后再次独立判定。 */
export interface LinkedSkillDefinition extends TriggeredSkillDefinition {
  readonly id: string;
  readonly trigger: Extract<
    SkillTrigger,
    { readonly type: "onSkillTrigger" | "probability" }
  >;
  readonly conditions?: readonly SkillEffectCondition[];
  readonly maxTriggerDepth?: number;
}

export interface TriggerChainProbabilityTransition {
  readonly kind: "triggerChain";
  readonly id: string;
  readonly trigger: InstantProbabilitySkillTrigger;
  readonly rootSkill: TriggeredSkillDefinition;
  readonly linkedSkills: readonly LinkedSkillDefinition[];
  readonly parentEvent?: BattleEvent;
  readonly attackerTroopType?: TroopType;
  readonly attackKind?: AttackKind;
  readonly maxTriggerDepth: number;
}

export interface SkippedTriggerChainEffect {
  readonly skillId: string;
  readonly effectId: string;
  readonly status: "pending" | "unsupported";
  readonly reason: string;
}

/** 单条精确路径；probability包含该路径内全部联动二次判定。 */
export interface TriggerChainBranch {
  readonly probability: number;
  readonly state: BattleState;
  readonly transientEffects: readonly TransientSkillEffect[];
  readonly events: readonly BattleEvent[];
  readonly skippedEffects: readonly SkippedTriggerChainEffect[];
}

export interface TriggerChainResolution {
  readonly branches: readonly TriggerChainBranch[];
  readonly probabilityMass: number;
  readonly maxDepthReached: number;
}
