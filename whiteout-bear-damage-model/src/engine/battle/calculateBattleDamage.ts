import type {
  BattleDamageInput,
  BattleDamageResult,
  BattleTroopDamageResult,
  AppliedSkillSummary,
  SelectedBodyHero,
} from "../../domain/battleDamage";
import type {
  HeadHeroCatalog,
  HeroCatalog,
  SupportedHeroDefinition,
} from "../../domain/hero";
import type { Skill } from "../../domain/skill";
import type { ExtraAttackTriggerPolicy } from "../../domain/skill";
import type { TroopType } from "../../domain/troop";
import type { AttackEvent, AttackPhase } from "../../domain/attack";
import type { BattleState } from "../../domain/battleState";
import { calculateBaseTotalDamage } from "../../rulesets/bear/base-damage/calculateBaseTotalDamage";
import { BEAR_BATTLE_TOTAL_ROUNDS } from "../../rulesets/bear/battle/constants";
import { resolveHeadHeroSkills } from "../heroes/resolveHeadHeroSkills";
import { createDamageBreakdown } from "../damage/resolveDamageComponent";
import { calculateAttackEventDamage, type AttackEventDamageCalculation } from "../attacks/calculateAttackEventDamage";
import { resolveAttackSequence } from "../attacks/resolveAttackSequence";
import {
  TooManyBodyHeroesError,
  UnknownBodyHeroError,
  UnsupportedBodyHeroError,
} from "./errors";

export interface BattleDamageCalculatorDependencies {
  readonly heroCatalog: HeroCatalog;
  readonly headHeroCatalog?: HeadHeroCatalog;
}

export interface BattleDamageRuntimeOptions {
  readonly round?: number;
  readonly initialState?: BattleState;
  /** 动态状态需要影响后续攻击时，按每个AttackEvent重新生成技能。 */
  readonly resolveStateSkills?: (
    state: BattleState,
    event: AttackEvent,
  ) => readonly Skill[];
  /** 仅由测试或已确认的攻击时序提供。 */
  readonly transitionAtAttackPhase?: (
    state: BattleState,
    event: AttackEvent,
    phase: Exclude<AttackPhase, "damageResolution">,
  ) => BattleState;
  /** 十回合调度器已接管非always目录技能时使用，避免重复/错误静态解析。 */
  readonly ignoreNonAlwaysCatalogSkills?: boolean;
}

const PRIMARY_ATTACK_TRIGGER_POLICY: ExtraAttackTriggerPolicy = {
  beforeAttack: true,
  onAttack: true,
  afterAttack: true,
  canTriggerExtraAttack: true,
  canTriggerExtraDamage: true,
};

/**
 * 创建数据源可注入的战斗伤害计算器。引擎不识别任何具体英雄 ID 或名称。
 */
export function createBattleDamageCalculator(
  dependencies: BattleDamageCalculatorDependencies,
): (input: BattleDamageInput) => BattleDamageResult {
  // 单回合静态入口只计算 always 技能；概率/持续/周期技能由十回合状态引擎调度。
  return (input) => calculateBattleDamageFromCatalog(
    input,
    dependencies,
    [],
    { ignoreNonAlwaysCatalogSkills: true },
  );
}

export function calculateBattleDamageFromCatalog(
  input: BattleDamageInput,
  dependencies: BattleDamageCalculatorDependencies,
  additionalSkills: readonly Skill[] = [],
  runtimeOptions: BattleDamageRuntimeOptions = {},
): BattleDamageResult {
  if (input.bodyHeroIds.length > 4) {
    throw new TooManyBodyHeroesError(input.bodyHeroIds.length);
  }

  const heroes = input.bodyHeroIds.map((heroId) => {
    const hero = dependencies.heroCatalog.get(heroId);

    if (hero === undefined || hero.role !== "body") {
      throw new UnknownBodyHeroError(heroId);
    }

    if (hero.status !== "supported") {
      throw new UnsupportedBodyHeroError(heroId, hero.status, hero.notes);
    }

    return hero;
  });

  const selectedBodyHeroes = createSelectedBodyHeroes(heroes);
  const headResolution = resolveHeadHeroSkills(
    input.headFormation ?? {},
    dependencies.headHeroCatalog,
  );
  const catalogSkills: readonly Skill[] = [
    ...heroes.map((hero) => hero.bodySkill),
    ...headResolution.skills,
  ];
  const round = runtimeOptions.round ?? runtimeOptions.initialState?.currentRound ?? 1;
  const skills: readonly Skill[] = materializeSkillsForRound([
    ...(runtimeOptions.ignoreNonAlwaysCatalogSkills
      ? catalogSkills.filter((skill) => skill.trigger.type === "always")
      : catalogSkills),
    ...additionalSkills,
  ], round);
  const appliedSkills: readonly AppliedSkillSummary[] = [
    ...heroes.map((hero) => ({
      source: "body" as const,
      heroId: hero.id,
      heroName: hero.name,
      skillId: hero.bodySkill.id,
      skillName: hero.bodySkill.name,
    })),
    ...headResolution.appliedSkills,
    ...additionalSkills.map((skill) => ({
      source: "runtime" as const,
      heroId: null,
      heroName: null,
      skillId: skill.id,
      skillName: skill.name,
    })),
  ];
  const baseResult = calculateBaseTotalDamage({ troops: input.troops });
  const damageChannel = input.damageChannel ?? "base";
  const troopDamages: Partial<Record<TroopType, BattleTroopDamageResult>> = {};
  let attackState = runtimeOptions.initialState ?? createDefaultAttackState(round);

  for (const [sourceIndex, baseTroopResult] of baseResult.troopResults.entries()) {
    const troopType = baseTroopResult.troopType;
    const primaryAttack: AttackEvent = {
      id: `round:${round}:primary:${troopType}:${sourceIndex}`,
      round,
      troopType,
      kind: "normal",
      attackIndex: 0,
      attackDepth: 0,
      damageScale: 1,
      triggerPolicy: PRIMARY_ATTACK_TRIGGER_POLICY,
    };
    let primaryCalculation: AttackEventDamageCalculation | undefined;
    const sequence = resolveAttackSequence({
      initialState: attackState,
      primaryAttack,
      calculateAttack: (event, state) => {
        const calculation = calculateAttackEventDamage({
          event,
          state,
          baseDamage: baseTroopResult,
          skills: [
            ...skills,
            ...(runtimeOptions.resolveStateSkills?.(state, event) ?? []),
          ],
          damageChannel,
        });
        if (event.kind === "normal") primaryCalculation = calculation;
        return calculation;
      },
      ...(runtimeOptions.transitionAtAttackPhase === undefined
        ? {}
        : { transitionAtPhase: runtimeOptions.transitionAtAttackPhase }),
    });
    attackState = sequence.finalState;
    if (primaryCalculation === undefined) {
      throw new Error(`主攻击 ${primaryAttack.id} 未完成伤害解析。`);
    }
    const aggregated = primaryCalculation.multipliers;
    const resolvedEffects = primaryCalculation.resolvedEffects;
    const damageBreakdown = sequence.damageBreakdown;
    const finalDamage = damageBreakdown.totalDamage;
    const extraDamageComponents = sequence.attacks.flatMap(
      (attack) => attack.extraDamageComponents,
    );
    const existing = troopDamages[troopType];

    if (existing === undefined) {
      troopDamages[troopType] = {
        troopType,
        baseDamage: baseTroopResult.damage,
        damageBreakdown,
        finalDamage,
        multipliers: {
          byEffectType: aggregated.multiplierByEffectType,
          combined: aggregated.combinedMultiplier,
        },
        sourceResults: [baseTroopResult],
        deferredExtraDamageEffects: aggregated.deferredExtraDamageEffects,
        extraDamageComponents,
        deferredExtraAttackEffects: aggregated.deferredExtraAttackEffects,
        attacks: sequence.attacks,
        primaryAttackDamage: sequence.primaryAttackDamage,
        extraAttackDamage: sequence.extraAttackDamage,
        appliedEffects: resolvedEffects.filter((effect) =>
          aggregated.appliedEffectTypes.some((type) => type === effect.type),
        ),
      };
      continue;
    }

    troopDamages[troopType] = {
      ...existing,
      baseDamage: existing.baseDamage + baseTroopResult.damage,
      damageBreakdown: createDamageBreakdown(
        existing.damageBreakdown.normalDamage + damageBreakdown.normalDamage,
        existing.damageBreakdown.extraDamage + damageBreakdown.extraDamage,
      ),
      finalDamage: existing.finalDamage + finalDamage,
      sourceResults: [...existing.sourceResults, baseTroopResult],
      extraDamageComponents: [
        ...existing.extraDamageComponents,
        ...extraDamageComponents,
      ],
      attacks: [...existing.attacks, ...sequence.attacks],
      primaryAttackDamage:
        existing.primaryAttackDamage + sequence.primaryAttackDamage,
      extraAttackDamage:
        existing.extraAttackDamage + sequence.extraAttackDamage,
    };
  }

  const damageBreakdown = Object.values(troopDamages).reduce(
    (sum, result) =>
      createDamageBreakdown(
        sum.normalDamage + result.damageBreakdown.normalDamage,
        sum.extraDamage + result.damageBreakdown.extraDamage,
      ),
    createDamageBreakdown(0, 0),
  );
  const finalDamage = damageBreakdown.totalDamage;
  const attacks = Object.values(troopDamages).flatMap(
    (troop) => troop.attacks,
  );
  const primaryAttackDamage = attacks
    .filter((attack) => attack.kind === "normal")
    .reduce((sum, attack) => sum + attack.totalDamage, 0);
  const extraAttackDamage = attacks
    .filter((attack) => attack.kind === "extra")
    .reduce((sum, attack) => sum + attack.totalDamage, 0);

  return {
    totalTroopCount: baseResult.totalTroopCount,
    selectedBodyHeroes,
    selectedHeadHeroes: headResolution.selectedHeadHeroes,
    appliedSkills,
    skippedSkills: headResolution.skippedSkills,
    baseDamage: baseResult.totalDamage,
    damageBreakdown,
    attacks,
    primaryAttackDamage,
    extraAttackDamage,
    finalDamage,
    troopDamages,
  };
}

function materializeSkillsForRound(skills:readonly Skill[],round:number):readonly Skill[]{return skills.flatMap(skill=>{const effects=skill.effects.flatMap(effect=>{if(effect.activeRounds!==undefined&&!effect.activeRounds.includes(round))return[];const value=effect.valueByRound?.[round-1]??effect.valueByEnemyTroop?.shield??effect.value;const{activeRounds:_a,valueByRound:_r,valueByEnemyTroop:_e,...rest}=effect;return[{...rest,value}]});return effects.length?[{...skill,effects}]:[]})}

function createDefaultAttackState(round: number): BattleState {
  if (!Number.isSafeInteger(round) || round < 1 || round > BEAR_BATTLE_TOTAL_ROUNDS) {
    throw new Error(`攻击事件回合必须位于1～${BEAR_BATTLE_TOTAL_ROUNDS}。`);
  }
  return {
    currentRound: round,
    totalRounds: BEAR_BATTLE_TOTAL_ROUNDS,
    status: "ready",
    activeEffects: [],
  };
}

function createSelectedBodyHeroes(
  heroes: readonly SupportedHeroDefinition[],
): readonly SelectedBodyHero[] {
  return heroes.map((hero, slotIndex) => ({
    slotIndex,
    heroId: hero.id as SelectedBodyHero["heroId"],
    heroName: hero.name,
  }));
}
