import type { BattleState } from "./battleState";
import type {
  DamageBreakdown,
  ResolvedDamageComponent,
} from "./damageComponent";
import type {
  ExtraAttackTriggerPolicy,
  ResolvedSkillEffect,
} from "./skill";
import type { TroopType } from "./troop";

export const ATTACK_PHASES = [
  "beforeAttack",
  "onAttack",
  "damageResolution",
  "afterAttack",
] as const;

export type AttackPhase = (typeof ATTACK_PHASES)[number];
export type AttackKind = "normal" | "extra";

export interface AttackEvent {
  readonly id: string;
  readonly round: number;
  readonly troopType: TroopType;
  readonly kind: AttackKind;
  readonly sourceSkillId?: string;
  readonly parentAttackId?: string;
  readonly attackIndex: number;
  readonly attackDepth: number;
  readonly damageScale: number;
  readonly triggerPolicy: ExtraAttackTriggerPolicy;
}

export interface AttackDamageResult {
  readonly attackId: string;
  readonly round: number;
  readonly troopType: TroopType;
  readonly kind: AttackKind;
  readonly sourceSkillId?: string;
  readonly parentAttackId?: string;
  readonly attackIndex: number;
  readonly attackDepth: number;
  readonly damageScale: number;
  readonly normalDamage: number;
  readonly extraDamage: number;
  readonly totalDamage: number;
  readonly damageBreakdown: DamageBreakdown;
  readonly extraDamageComponents: readonly ResolvedDamageComponent[];
  readonly triggeredSkills: readonly string[];
  readonly phases: readonly AttackPhase[];
  readonly stateBefore: BattleState;
  readonly stateAfter: BattleState;
}

/** 攻击伤害解析器的内部输出，供事件调度器继续生成子攻击。 */
export interface AttackResolutionStep {
  readonly result: AttackDamageResult;
  readonly extraAttackEffects: readonly ResolvedSkillEffect[];
}

export interface AttackSequenceResult {
  readonly attacks: readonly AttackDamageResult[];
  readonly finalState: BattleState;
  readonly damageBreakdown: DamageBreakdown;
  readonly primaryAttackDamage: number;
  readonly extraAttackDamage: number;
}

