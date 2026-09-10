import { calculateBattleDamage } from "../../../app/calculateBattleDamage";
import type {
  BattleDamageResult,
  TroopMultiplierBreakdown,
} from "../../../domain/battleDamage";
import type {
  BattleTotalDamageResult,
  BearBattleContext,
  BearBattleDamageInput,
  BearBattleOptions,
  BearEnemyDefenseState,
  RoundActiveEffects,
  RoundDamageResult,
} from "../../../domain/bearBattle";
import type { ResolvedSkillEffect } from "../../../domain/skill";
import type { ActiveEffect } from "../../../domain/battleState";
import { createActiveEffect } from "../../../engine/rounds/activeEffects";
import { createBattleState } from "../../../engine/rounds/battleState";
import { resolveRound } from "../../../engine/rounds/resolveRound";
import type { TroopType } from "../../../domain/troop";
import {
  BEAR_BATTLE_TOTAL_ROUNDS,
  BEAR_ENEMY_INFINITE_HP,
  BEAR_ENEMY_TROOP_TYPE,
} from "./constants";
import { InvalidBearBattleContextError } from "./errors";
import { createDamageBreakdown } from "../../../engine/damage/resolveDamageComponent";
import type { AttackDamageResult } from "../../../domain/attack";

const TROOP_TYPES: readonly TroopType[] = ["shield", "lancer", "marksman"];

export interface BearBattleCalculatorDependencies {
  readonly calculateSingleRoundDamage: (
    input: BearBattleDamageInput,
  ) => BattleDamageResult;
}

/** 当前入口：先调用既有单回合引擎，再进入固定十回合汇总层。 */
export const calculateBearBattleTotalDamage =
  createBearBattleTotalDamageCalculator({
    calculateSingleRoundDamage: calculateBattleDamage,
  });

export function createBearBattleTotalDamageCalculator(
  dependencies: BearBattleCalculatorDependencies,
): (
  input: BearBattleDamageInput,
  options?: BearBattleOptions,
) => BattleTotalDamageResult {
  return (input, options = {}) => {
    const singleRoundResult = dependencies.calculateSingleRoundDamage(input);
    return calculateBearBattleTotalDamageFromSingleRound(
      singleRoundResult,
      options,
    );
  };
}

/**
 * 当前所有可计算技能均为 always，因此通过状态框架复用同一单回合结算结果。
 * 后续加入回合触发机制时，可替换上层逐回合解析器而无需修改基础伤害函数。
 */
export function calculateBearBattleTotalDamageFromSingleRound(
  singleRoundResult: BattleDamageResult,
  options: BearBattleOptions = {},
): BattleTotalDamageResult {
  const context = createBearBattleContext(options);
  const activeEffects = createActiveEffects(singleRoundResult);
  const enemyDefense = createEnemyDefenseState(singleRoundResult, context);
  let state = createBattleState(context, createAlwaysStateEffects(singleRoundResult));
  const rounds: RoundDamageResult[] = [];
  while (state.status !== "completed") {
    const resolved = resolveRound(context, state, {
      // 常驻效果已由既有单回合引擎结算，状态层不会再次应用乘区。
      calculateDamage: () => singleRoundResult,
    });
    const attacks = rebaseAttacksForRound(
      singleRoundResult.attacks,
      resolved.round,
      resolved.stateBefore,
      resolved.stateAfter,
    );
    rounds.push({
      round: resolved.round,
      shieldDamage:
        singleRoundResult.troopDamages.shield?.finalDamage ?? 0,
      lancerDamage:
        singleRoundResult.troopDamages.lancer?.finalDamage ?? 0,
      marksmanDamage:
        singleRoundResult.troopDamages.marksman?.finalDamage ?? 0,
      totalDamage: singleRoundResult.finalDamage,
      damageBreakdown: singleRoundResult.damageBreakdown,
      troopDamageBreakdowns: Object.fromEntries(
        TROOP_TYPES.flatMap((troopType) => {
          const troopResult = singleRoundResult.troopDamages[troopType];
          return troopResult === undefined
            ? []
            : [[troopType, troopResult.damageBreakdown] as const];
        }),
      ),
      attacks,
      primaryAttackDamage: singleRoundResult.primaryAttackDamage,
      extraAttackDamage: singleRoundResult.extraAttackDamage,
      activeEffects: { ...activeEffects, instances: resolved.stateBefore.activeEffects },
      enemyDefense,
      singleRoundResult,
      stateBefore: resolved.stateBefore,
      stateAfter: resolved.stateAfter,
      phases: resolved.phases,
    });
    state = resolved.stateAfter;
  }
  const totalDamage = rounds.reduce(
    (sum, roundResult) => sum + roundResult.totalDamage,
    0,
  );
  const damageBreakdown = rounds.reduce(
    (sum, roundResult) =>
      createDamageBreakdown(
        sum.normalDamage + roundResult.damageBreakdown.normalDamage,
        sum.extraDamage + roundResult.damageBreakdown.extraDamage,
      ),
    createDamageBreakdown(0, 0),
  );

  return {
    context,
    rounds,
    singleRoundDamage: singleRoundResult.finalDamage,
    totalDamage,
    damageBreakdown,
    primaryAttackDamage: rounds.reduce(
      (sum, roundResult) => sum + roundResult.primaryAttackDamage,
      0,
    ),
    extraAttackDamage: rounds.reduce(
      (sum, roundResult) => sum + roundResult.extraAttackDamage,
      0,
    ),
    finalState: state,
  };
}

function rebaseAttacksForRound(
  attacks: readonly AttackDamageResult[],
  round: number,
  stateBefore: import("../../../domain/battleState").BattleState,
  stateAfter: import("../../../domain/battleState").BattleState,
): readonly AttackDamageResult[] {
  const idMap = new Map(
    attacks.map((attack) => [
      attack.attackId,
      attack.attackId.replace(/^round:\d+:/, `round:${round}:`),
    ]),
  );
  return attacks.map((attack) => ({
    ...attack,
    attackId: idMap.get(attack.attackId)!,
    round,
    ...(attack.parentAttackId === undefined
      ? {}
      : { parentAttackId: idMap.get(attack.parentAttackId) ?? attack.parentAttackId }),
    stateBefore,
    stateAfter,
  }));
}

/** 当前常驻技能模型下的轻量评分；未来可由逐回合期望伤害评分器替换。 */
export function scoreCurrentBearBattleTotalDamage(
  singleRoundResult: BattleDamageResult,
): number {
  let totalDamage = 0;
  for (let round = 1; round <= BEAR_BATTLE_TOTAL_ROUNDS; round += 1) {
    totalDamage += singleRoundResult.finalDamage;
  }
  return totalDamage;
}

export function createBearBattleContext(
  options: BearBattleOptions = {},
): BearBattleContext {
  const enemyBaseDefense = options.enemyBaseDefense ?? null;

  if (
    enemyBaseDefense !== null &&
    (!Number.isFinite(enemyBaseDefense) || enemyBaseDefense < 0)
  ) {
    throw new InvalidBearBattleContextError(
      `巨熊基础防御必须是非负有限数字，收到：${enemyBaseDefense}。`,
    );
  }

  return {
    totalRounds: BEAR_BATTLE_TOTAL_ROUNDS,
    enemyTroopType: BEAR_ENEMY_TROOP_TYPE,
    enemyInfiniteHp: BEAR_ENEMY_INFINITE_HP,
    enemyBaseDefense,
  };
}

function createActiveEffects(
  singleRoundResult: BattleDamageResult,
): RoundActiveEffects {
  const multipliersByTroop: Partial<
    Record<TroopType, TroopMultiplierBreakdown>
  > = {};
  const deferredExtraDamageEffectsByTroop: Partial<
    Record<TroopType, readonly ResolvedSkillEffect[]>
  > = {};
  const deferredExtraAttackEffectsByTroop: Partial<
    Record<TroopType, readonly ResolvedSkillEffect[]>
  > = {};

  for (const troopType of TROOP_TYPES) {
    const troopResult = singleRoundResult.troopDamages[troopType];
    if (troopResult === undefined) {
      continue;
    }
    multipliersByTroop[troopType] = troopResult.multipliers;
    deferredExtraDamageEffectsByTroop[troopType] =
      troopResult.deferredExtraDamageEffects;
    deferredExtraAttackEffectsByTroop[troopType] = troopResult.deferredExtraAttackEffects ?? [];
  }

  return {
    selectedBodyHeroes: singleRoundResult.selectedBodyHeroes,
    selectedHeadHeroes: singleRoundResult.selectedHeadHeroes ?? [],
    appliedSkills: singleRoundResult.appliedSkills ?? [],
    skippedSkills: singleRoundResult.skippedSkills ?? [],
    multipliersByTroop,
    deferredExtraDamageEffectsByTroop,
    deferredExtraAttackEffectsByTroop,
  };
}

/** 只从单回合结果读取解释数据，不查询或判断具体英雄。 */
function createAlwaysStateEffects(singleRoundResult: BattleDamageResult): readonly ActiveEffect[] {
  return TROOP_TYPES.flatMap((troopType) =>
    (singleRoundResult.troopDamages[troopType]?.appliedEffects ?? []).map((effect, index) =>
      createActiveEffect({
        id: `${troopType}:${index}:${effect.skillId}:${effect.effectIndex}`,
        sourceSkillId: effect.skillId,
        effect,
        appliesToTroop: troopType,
      }),
    ),
  );
}

function createEnemyDefenseState(
  singleRoundResult: BattleDamageResult,
  context: BearBattleContext,
): BearEnemyDefenseState {
  const defenseReductionMultiplierByTroop: Partial<
    Record<TroopType, number>
  > = {};
  const enemyEffectiveDefenseByTroop: Partial<
    Record<TroopType, number | null>
  > = {};
  let affectedByDefenseReduction = false;

  for (const troopType of TROOP_TYPES) {
    const multiplier =
      singleRoundResult.troopDamages[troopType]?.multipliers.byEffectType
        .defenseReduction;
    if (multiplier === undefined) {
      continue;
    }
    defenseReductionMultiplierByTroop[troopType] = multiplier;
    if (multiplier !== 1) {
      affectedByDefenseReduction = true;
    }
  }

  if (context.enemyBaseDefense === null) {
    return {
      enemyBaseDefense: null,
      enemyEffectiveDefense: null,
      enemyEffectiveDefenseByTroop,
      status: "base-defense-not-provided",
      affectedByDefenseReduction,
      defenseReductionAppliedAsDamageMultiplier: true,
      defenseReductionMultiplierByTroop,
    };
  }

  if (!affectedByDefenseReduction) {
    for (const troopType of TROOP_TYPES) {
      if (defenseReductionMultiplierByTroop[troopType] !== undefined) {
        enemyEffectiveDefenseByTroop[troopType] = context.enemyBaseDefense;
      }
    }
    return {
      enemyBaseDefense: context.enemyBaseDefense,
      enemyEffectiveDefense: context.enemyBaseDefense,
      enemyEffectiveDefenseByTroop,
      status: "same-as-base-no-active-reduction",
      affectedByDefenseReduction: false,
      defenseReductionAppliedAsDamageMultiplier: true,
      defenseReductionMultiplierByTroop,
    };
  }

  for (const troopType of TROOP_TYPES) {
    const multiplier = defenseReductionMultiplierByTroop[troopType];
    if (multiplier !== undefined) {
      enemyEffectiveDefenseByTroop[troopType] =
        multiplier === 1 ? context.enemyBaseDefense : null;
    }
  }

  return {
    enemyBaseDefense: context.enemyBaseDefense,
    enemyEffectiveDefense: null,
    enemyEffectiveDefenseByTroop,
    status: "pending-effective-defense-formula",
    affectedByDefenseReduction: true,
    defenseReductionAppliedAsDamageMultiplier: true,
    defenseReductionMultiplierByTroop,
  };
}
