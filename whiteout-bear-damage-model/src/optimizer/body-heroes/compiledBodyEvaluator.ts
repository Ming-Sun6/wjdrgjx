import type { TroopMultiplierBreakdown } from "../../domain/battleDamage";
import type { BaseTroopGroupInput } from "../../domain/baseDamage";
import type { TenRoundExpectedDamageInput, TenRoundExpectedDamageResult } from "../../domain/tenRoundExpectedDamage";
import type { BodySkillOption } from "../../domain/bodySkillOption";
import type { BodyHeroId } from "../../domain/hero";
import type { MultiplicativeEffectType, Skill, SkillEffect } from "../../domain/skill";
import type { TroopType } from "../../domain/troop";
import type { TroopCounts } from "../../domain/troopRatioOptimization";
import type { ExpectedRoundDamageResult } from "../../domain/probability";
import { getHeadHeroById } from "../../game-data/heroes/headHeroQueries";
import { resolveAutomaticTroopSkills } from "../../game-data/troop-skills/automaticTroopSkills";
import { calculateBaseTotalDamage } from "../../rulesets/bear/base-damage";
import { TROOP_DAMAGE_EFFECT_BY_TROOP } from "../../engine/skills/effectTypes";
import {
  combineProbabilityOnlySkillInstances,
  getProbabilityOnlyAggregation,
} from "../../engine/probability";

const ROUND_COUNT = 10;
const TROOP_TYPES: readonly TroopType[] = ["shield", "lancer", "marksman"];
const COMMON_ZONES = [
  "attack",
  "penetration",
  "defenseReduction",
  "baseDamageIncrease",
  "vulnerable",
] as const;
const BODY_ZONES = [...COMMON_ZONES, "normalAttackDamageIncrease"] as const;
const COMMON_MULTIPLIER_ORDER: readonly MultiplicativeEffectType[] = [
  "attack",
  "penetration",
  "defenseReduction",
  "baseDamageIncrease",
  "vulnerable",
  "troopVsTroopDamage",
  "buffAttack",
  "buffPenetration",
  "buffDefenseReduction",
  "expertBearDamage",
];

type BodyZone = (typeof BODY_ZONES)[number];

const ZONE_INDEX = Object.fromEntries(
  BODY_ZONES.map((zone, index) => [zone, index]),
) as Readonly<Record<BodyZone, number>>;

const VECTOR_LENGTH = ROUND_COUNT * TROOP_TYPES.length * BODY_ZONES.length;

export interface CompiledBodySkillOption {
  readonly numericId: number;
  readonly option: BodySkillOption;
  readonly expectedContributionVector: Float64Array;
}

export interface CompiledBodyEffect {
  readonly numericSignature: number;
  readonly options: readonly BodySkillOption[];
  readonly representativeHeroIds: readonly BodyHeroId[];
  readonly expectedContributionVector: Float64Array;
  /** 尚未与车头等固定实例合并的 probability-only 技能。 */
  readonly probabilityOnlySkills: readonly Skill[];
}

export interface StaticBodyBattleContext {
  readonly baselineResult: TenRoundExpectedDamageResult;
  readonly referenceTroopCounts: TroopCounts;
  readonly cells: readonly StaticRoundTroopCell[];
  readonly replacementMask: Uint8Array;
  readonly troopTemplates: Readonly<Record<TroopType, BaseTroopGroupInput>>;
  readonly externalProbabilityOnlySkills: readonly Skill[];
}

interface StaticRoundTroopCell {
  readonly baseDamage: number;
  readonly normalDamage: number;
  readonly extraDamage: number;
  readonly externalExtraRate: number;
  readonly externalMultipliers: Readonly<Record<BodyZone, number>>;
  readonly allExternalMultipliers: Readonly<Record<MultiplicativeEffectType, number>>;
}

export interface FastBodyScore {
  readonly totalDamage: number;
  readonly troopDamages: Readonly<Record<TroopType, number>>;
}

export interface CompiledBodyDetailedScore extends FastBodyScore {
  readonly expectedDamageByRound: readonly ExpectedRoundDamageResult[];
}

/**
 * 将九类车身技能编译成定长纯数值向量。每个选项必须只改变一个乘区；
 * 这是当前可证明按期望向量合并的边界，未来多乘区同源随机技能会明确回退。
 */
export function compileBodySkillOptions(
  options: readonly BodySkillOption[],
): readonly CompiledBodySkillOption[] {
  return options.map((option, numericId) => ({
    numericId,
    option,
    expectedContributionVector: compileOptionVector(option),
  }));
}

/** 以三进制计数元组作为稳定整数签名；当前每类最多2份，不拼接长字符串。 */
export function compileBodyEffect(
  selected: readonly CompiledBodySkillOption[],
): CompiledBodyEffect {
  const vector = new Float64Array(VECTOR_LENGTH);
  const counts = new Uint8Array(
    selected.reduce((maximum, item) => Math.max(maximum, item.numericId + 1), 0),
  );
  const heroIds: BodyHeroId[] = [];
  const probabilityOnlySkills: Skill[] = [];
  for (const item of selected) {
    counts[item.numericId] = (counts[item.numericId] ?? 0) + 1;
    if (item.option.skill !== null && getProbabilityOnlyAggregation(item.option.skill) !== undefined) {
      probabilityOnlySkills.push(item.option.skill);
    } else {
      addVector(vector, item.expectedContributionVector);
    }
    if (item.option.representativeHeroId !== null) {
      heroIds.push(item.option.representativeHeroId);
    }
  }
  let signature = 0;
  let place = 1;
  for (const count of counts) {
    signature += count * place;
    place *= 3;
  }
  return {
    numericSignature: signature,
    options: selected.map((item) => item.option),
    representativeHeroIds: heroIds,
    expectedContributionVector: vector,
    probabilityOnlySkills,
  };
}

/**
 * 固定输入只运行一次正式无车身期望模拟，再将每回合/兵种的固定伤害与乘区压平。
 * 返回null表示发现当前证明范围外的相关随机效果，应回退通用正式引擎。
 */
export function tryCreateStaticBodyBattleContext(
  input: TenRoundExpectedDamageInput,
  baselineResult: TenRoundExpectedDamageResult,
): StaticBodyBattleContext | null {
  if (!isExternalSkillSetFactorizable(input)) return null;
  const replacementMask = createDeterministicReplacementMask(input);
  if (replacementMask === null) return null;
  const troopTemplates = createTroopTemplates(input.troops);
  if (troopTemplates === null) return null;
  const cells: StaticRoundTroopCell[] = [];
  const referenceTroopCounts: Record<TroopType, number> = { shield: 0, lancer: 0, marksman: 0 };
  for (const troop of input.troops) referenceTroopCounts[troop.troopType] += troop.troopCount;
  if (baselineResult.preparation !== undefined) {
    Object.assign(referenceTroopCounts, baselineResult.preparation.troopCounts);
  }
  const referenceBaseDamageByTroop = calculateExactBaseDamageByTroop(
    troopTemplates,
    referenceTroopCounts,
  );
  for (const round of baselineResult.expectedDamageByRound) {
    for (const troopType of TROOP_TYPES) {
      const multiplierBreakdown = round.expectedMultipliersByTroop[troopType];
      const multipliers = multiplierBreakdown?.byEffectType;
      const breakdown = round.expectedTroopDamageBreakdowns[troopType];
      const externalMultipliers = Object.fromEntries(
        BODY_ZONES.map((zone) => [zone, multipliers?.[zone] ?? 1]),
      ) as Record<BodyZone, number>;
      const exactBaseDamage = referenceBaseDamageByTroop[troopType];
      const commonDamage = exactBaseDamage * (multiplierBreakdown?.combined ?? 1);
      cells.push({
        baseDamage: exactBaseDamage,
        normalDamage: breakdown?.normalDamage ?? 0,
        extraDamage: breakdown?.extraDamage ?? 0,
        externalExtraRate: commonDamage === 0 ? 0 : (breakdown?.extraDamage ?? 0) / commonDamage,
        externalMultipliers,
        allExternalMultipliers: multipliers ?? createIdentityMultiplierRecord(),
      });
    }
  }
  return {
    baselineResult,
    referenceTroopCounts,
    cells,
    replacementMask,
    troopTemplates,
    externalProbabilityOnlySkills: collectExternalProbabilityOnlySkills(input),
  };
}

/** 热循环：无技能解析、Map/Set、回合对象或解释文本，只返回一个number。 */
export function scoreBodyFast(
  context: StaticBodyBattleContext,
  effect: CompiledBodyEffect,
  targetTroopCounts: TroopCounts = context.referenceTroopCounts,
): number {
  return scoreBodyTroopsFast(context, effect, targetTroopCounts).totalDamage;
}

/** 联合优化器只额外需要三个兵种系数；仍不创建逐回合解释对象。 */
export function scoreBodyTroopsFast(
  context: StaticBodyBattleContext,
  effect: CompiledBodyEffect,
  targetTroopCounts: TroopCounts = context.referenceTroopCounts,
): FastBodyScore {
  const boundEffect = bindProbabilityOnlyGroups(context, effect);
  const troopDamages: Record<TroopType, number> = {
    shield: 0,
    lancer: 0,
    marksman: 0,
  };
  let totalDamage = 0;
  for (let roundIndex = 0; roundIndex < ROUND_COUNT; roundIndex += 1) {
    for (let troopIndex = 0; troopIndex < TROOP_TYPES.length; troopIndex += 1) {
      const cellIndex = roundIndex * TROOP_TYPES.length + troopIndex;
      const cell = context.cells[cellIndex]!;
      const troopType = TROOP_TYPES[troopIndex]!;
      const referenceCount = context.referenceTroopCounts[troopType];
      const countScale = referenceCount === 0
        ? targetTroopCounts[troopType] === 0 ? 0 : Number.NaN
        : Math.sqrt(targetTroopCounts[troopType] / referenceCount);
      if (!Number.isFinite(countScale)) {
        throw new Error(`编译评分参考阵容缺少${troopType}，不能外推其伤害系数。`);
      }
      let commonScale = 1;
      for (const zone of COMMON_ZONES) {
        const external = cell.externalMultipliers[zone];
        const body = context.replacementMask[vectorIndex(roundIndex, troopIndex, zone)] === 1
          ? 0
          : boundEffect.expectedContributionVector[vectorIndex(roundIndex, troopIndex, zone)]!;
        commonScale *= (external + body) / external;
      }
      const normalZone = "normalAttackDamageIncrease" as const;
      const externalNormal = cell.externalMultipliers[normalZone];
      const bodyNormal = boundEffect.expectedContributionVector[
        vectorIndex(roundIndex, troopIndex, normalZone)
      ]!;
      const normalDamage = cell.normalDamage * countScale * commonScale * (
        (externalNormal + bodyNormal) / externalNormal
      );
      const extraDamage = cell.extraDamage * countScale * commonScale;
      const damage = normalDamage + extraDamage;
      troopDamages[troopType] += damage;
      totalDamage += damage;
    }
  }
  return { totalDamage, troopDamages };
}

/** 只为最终Top K生成逐回合紧凑解释；不再运行通用概率状态机。 */
export function simulateCompiledBodyDetails(
  context: StaticBodyBattleContext,
  effect: CompiledBodyEffect,
  targetTroopCounts: TroopCounts = context.referenceTroopCounts,
): CompiledBodyDetailedScore {
  const boundEffect = bindProbabilityOnlyGroups(context, effect);
  const exactBaseDamageByTroop = calculateExactBaseDamageByTroop(
    context.troopTemplates,
    targetTroopCounts,
  );
  const troopDamages: Record<TroopType, number> = { shield: 0, lancer: 0, marksman: 0 };
  const roundScores = context.baselineResult.expectedDamageByRound.map((round) => ({
    source: round,
    baseDamage: 0,
    normalDamage: 0,
    extraDamage: 0,
    troopDamages: { shield: 0, lancer: 0, marksman: 0 } as Record<TroopType, number>,
    troopNormal: { shield: 0, lancer: 0, marksman: 0 } as Record<TroopType, number>,
    troopExtra: { shield: 0, lancer: 0, marksman: 0 } as Record<TroopType, number>,
    multiplierByTroop: {} as Partial<Record<TroopType, TroopMultiplierBreakdown>>,
  }));
  for (let roundIndex = 0; roundIndex < ROUND_COUNT; roundIndex += 1) {
    for (let troopIndex = 0; troopIndex < TROOP_TYPES.length; troopIndex += 1) {
      const cell = context.cells[roundIndex * TROOP_TYPES.length + troopIndex]!;
      const troopType = TROOP_TYPES[troopIndex]!;
      const countScale = troopCountScale(context.referenceTroopCounts, targetTroopCounts, troopType);
      let commonScale = 1;
      for (const zone of COMMON_ZONES) {
        const external = cell.externalMultipliers[zone];
        const body = bodyContribution(context, boundEffect, roundIndex, troopIndex, zone);
        commonScale *= (external + body) / external;
      }
      const normalZone = "normalAttackDamageIncrease" as const;
      const externalNormal = cell.externalMultipliers[normalZone];
      const bodyNormal = bodyContribution(context, boundEffect, roundIndex, troopIndex, normalZone);
      const normalScale = (externalNormal + bodyNormal) / externalNormal;
      const exactCommonMultiplier = combinedCommonMultiplier(
        cell.allExternalMultipliers,
        context,
        boundEffect,
        roundIndex,
        troopIndex,
        troopType,
      );
      const exactBaseDamage = exactBaseDamageByTroop[troopType];
      const normalDamage = exactBaseDamage * exactCommonMultiplier * (externalNormal + bodyNormal);
      const extraDamage = exactBaseDamage * exactCommonMultiplier * cell.externalExtraRate;
      const damage = normalDamage + extraDamage;
      const roundScore = roundScores[roundIndex]!;
      roundScore.baseDamage += exactBaseDamage;
      roundScore.normalDamage += normalDamage;
      roundScore.extraDamage += extraDamage;
      roundScore.troopDamages[troopType] = damage;
      roundScore.troopNormal[troopType] = normalDamage;
      roundScore.troopExtra[troopType] = extraDamage;
      const baselineMultipliers = roundScore.source.expectedMultipliersByTroop[troopType];
      if (baselineMultipliers !== undefined) {
        const byEffectType = { ...baselineMultipliers.byEffectType } as Record<MultiplicativeEffectType, number>;
        for (const zone of BODY_ZONES) {
          byEffectType[zone] = byEffectType[zone] + bodyContribution(
            context,
            boundEffect,
            roundIndex,
            troopIndex,
            zone,
          );
        }
        byEffectType.damageIncrease = byEffectType.baseDamageIncrease;
        byEffectType.normalAttackDamage = byEffectType.normalAttackDamageIncrease;
        roundScore.multiplierByTroop[troopType] = {
          byEffectType,
          combined: baselineMultipliers.combined * commonScale * normalScale,
        };
      }
      troopDamages[troopType] += damage;
    }
  }
  const expectedDamageByRound: ExpectedRoundDamageResult[] = roundScores.map((roundScore) => {
    const total = roundScore.normalDamage + roundScore.extraDamage;
    const defenseReductionByTroop = Object.fromEntries(
      TROOP_TYPES.flatMap((troopType) => {
        const multiplier = roundScore.multiplierByTroop[troopType]?.byEffectType.defenseReduction;
        return multiplier === undefined ? [] : [[troopType, multiplier] as const];
      }),
    );
    return {
      ...roundScore.source,
      expectedBaseDamage: roundScore.baseDamage,
      expectedSkillDamage: roundScore.normalDamage - roundScore.baseDamage,
      expectedShieldDamage: roundScore.troopDamages.shield,
      expectedLancerDamage: roundScore.troopDamages.lancer,
      expectedMarksmanDamage: roundScore.troopDamages.marksman,
      expectedTotalDamage: total,
      expectedNormalDamage: roundScore.normalDamage,
      expectedExtraDamage: roundScore.extraDamage,
      expectedPrimaryAttackDamage: total,
      expectedExtraAttackDamage: 0,
      expectedMultipliersByTroop: roundScore.multiplierByTroop,
      enemyDefense: {
        ...roundScore.source.enemyDefense,
        expectedDefenseReductionMultiplierByTroop: defenseReductionByTroop,
      },
      expectedTroopDamageBreakdowns: {
        shield: createBreakdown(roundScore.troopNormal.shield, roundScore.troopExtra.shield),
        lancer: createBreakdown(roundScore.troopNormal.lancer, roundScore.troopExtra.lancer),
        marksman: createBreakdown(roundScore.troopNormal.marksman, roundScore.troopExtra.marksman),
      },
    };
  });
  const totalDamage = expectedDamageByRound.reduce(
    (sum, round) => sum + round.expectedTotalDamage,
    0,
  );
  return { totalDamage, troopDamages, expectedDamageByRound };
}

function createTroopTemplates(
  troops: readonly BaseTroopGroupInput[],
): Readonly<Record<TroopType, BaseTroopGroupInput>> | null {
  const templates: Partial<Record<TroopType, BaseTroopGroupInput>> = {};
  for (const troop of troops) {
    if (templates[troop.troopType] !== undefined) return null;
    templates[troop.troopType] = troop;
  }
  if (TROOP_TYPES.some((type) => templates[type] === undefined)) return null;
  return templates as Record<TroopType, BaseTroopGroupInput>;
}

function calculateExactBaseDamageByTroop(
  templates: Readonly<Record<TroopType, BaseTroopGroupInput>>,
  counts: TroopCounts,
): Record<TroopType, number> {
  const result = calculateBaseTotalDamage({
    troops: TROOP_TYPES.map((troopType) => ({
      ...templates[troopType],
      troopCount: counts[troopType],
    })),
  });
  return Object.fromEntries(TROOP_TYPES.map((troopType) => [
    troopType,
    result.troopResults.find((troop) => troop.troopType === troopType)?.damage ?? 0,
  ])) as Record<TroopType, number>;
}

function combinedCommonMultiplier(
  external: Readonly<Record<MultiplicativeEffectType, number>>,
  context: StaticBodyBattleContext,
  effect: CompiledBodyEffect,
  roundIndex: number,
  troopIndex: number,
  troopType: TroopType,
): number {
  let product = 1;
  for (const zone of [...COMMON_MULTIPLIER_ORDER, TROOP_DAMAGE_EFFECT_BY_TROOP[troopType]]) {
    const bodyZone = canonicalBodyZone(zone);
    const body = bodyZone === null
      ? 0
      : bodyContribution(context, effect, roundIndex, troopIndex, bodyZone);
    product *= external[zone] + body;
  }
  return product;
}

function createIdentityMultiplierRecord(): Record<MultiplicativeEffectType, number> {
  return Object.fromEntries([
    ...COMMON_MULTIPLIER_ORDER,
    "normalAttackDamageIncrease",
    "skillDamageIncrease",
    "damageIncrease",
    "normalAttackDamage",
    "skillDamage",
    "shieldDamage",
    "lancerDamage",
    "marksmanDamage",
  ].map((type) => [type, 1])) as Record<MultiplicativeEffectType, number>;
}

function troopCountScale(
  referenceTroopCounts: TroopCounts,
  targetTroopCounts: TroopCounts,
  troopType: TroopType,
): number {
  const referenceCount = referenceTroopCounts[troopType];
  if (referenceCount === 0) {
    if (targetTroopCounts[troopType] === 0) return 0;
    throw new Error(`编译评分参考阵容缺少${troopType}，不能外推其伤害系数。`);
  }
  return Math.sqrt(targetTroopCounts[troopType] / referenceCount);
}

function bodyContribution(
  context: StaticBodyBattleContext,
  effect: CompiledBodyEffect,
  roundIndex: number,
  troopIndex: number,
  zone: BodyZone,
): number {
  const index = vectorIndex(roundIndex, troopIndex, zone);
  return context.replacementMask[index] === 1 ? 0 : effect.expectedContributionVector[index]!;
}

function createBreakdown(normalDamage: number, extraDamage: number) {
  return { normalDamage, extraDamage, totalDamage: normalDamage + extraDamage };
}

function compileOptionVector(option: BodySkillOption): Float64Array {
  if (option.skill === null) return new Float64Array(VECTOR_LENGTH);
  return compileSkillVector(option.skill);
}

function compileSkillVector(skill: Skill): Float64Array {
  if (skill.effects.length !== 1) {
    throw new Error(`车身技能 ${skill.id} 必须恰好包含一个独立乘区效果。`);
  }
  const effect = skill.effects[0]!;
  const zone = canonicalBodyZone(effect.type);
  if (zone === null || effect.zoneAggregation === "replace" || effect.conditions?.length) {
    throw new Error(`车身技能 ${skill.id} 超出当前可证明的编译评分范围。`);
  }
  const activeProbabilities = expectedActiveProbabilityByRound(skill);
  const vector = new Float64Array(VECTOR_LENGTH);
  for (let roundIndex = 0; roundIndex < ROUND_COUNT; roundIndex += 1) {
    const round = roundIndex + 1;
    if (effect.activeRounds !== undefined && !effect.activeRounds.includes(round)) continue;
    const value = effect.valueByRound?.[roundIndex] ?? effect.value;
    for (let troopIndex = 0; troopIndex < TROOP_TYPES.length; troopIndex += 1) {
      const troopType = TROOP_TYPES[troopIndex]!;
      if (effect.targetTroop !== undefined && effect.targetTroop !== "all" && effect.targetTroop !== troopType) continue;
      vector[vectorIndex(roundIndex, troopIndex, zone)] = value * activeProbabilities[roundIndex]!;
    }
  }
  return vector;
}

/**
 * 把车身与固定车头中共享同一状态的实例先合并概率，再计算一次固定幅度。
 * 返回的差量向量是“全部实例期望 - 固定实例期望”，可安全叠加到无车身基线。
 */
function bindProbabilityOnlyGroups(
  context: StaticBodyBattleContext,
  effect: CompiledBodyEffect,
): CompiledBodyEffect {
  if (effect.probabilityOnlySkills.length === 0) return effect;
  const vector = effect.expectedContributionVector.slice();
  const groupIds = [...new Set(effect.probabilityOnlySkills.map((skill) =>
    getProbabilityOnlyAggregation(skill)!.groupId
  ))];
  for (const groupId of groupIds) {
    const bodySkills = effect.probabilityOnlySkills.filter(
      (skill) => getProbabilityOnlyAggregation(skill)?.groupId === groupId,
    );
    const externalSkills = context.externalProbabilityOnlySkills.filter(
      (skill) => getProbabilityOnlyAggregation(skill)?.groupId === groupId,
    );
    const combinedVector = compileCombinedProbabilityOnlyVector([
      ...externalSkills,
      ...bodySkills,
    ]);
    const externalVector = compileCombinedProbabilityOnlyVector(externalSkills);
    for (let index = 0; index < vector.length; index += 1) {
      vector[index] = (vector[index] ?? 0) + combinedVector[index]! - externalVector[index]!;
    }
  }
  return {
    ...effect,
    expectedContributionVector: vector,
    probabilityOnlySkills: [],
  };
}

function compileCombinedProbabilityOnlyVector(skills: readonly Skill[]): Float64Array {
  const vector = new Float64Array(VECTOR_LENGTH);
  for (const combined of combineProbabilityOnlySkillInstances(skills)) {
    addVector(vector, compileSkillVector(combined));
  }
  return vector;
}

function collectExternalProbabilityOnlySkills(
  input: TenRoundExpectedDamageInput,
): readonly Skill[] {
  const skills: Skill[] = [];
  for (const heroId of [
    input.headFormation?.shieldHeroId,
    input.headFormation?.lancerHeroId,
    input.headFormation?.marksmanHeroId,
  ]) {
    if (heroId === undefined) continue;
    const hero = getHeadHeroById(heroId);
    if (hero === undefined) continue;
    for (const definition of hero.headSkills) {
      if (definition.status === "supported" && definition.skill !== null) {
        skills.push(definition.skill);
      }
    }
  }
  skills.push(...resolveAutomaticTroopSkills(input.troops, input.preparation?.troopSkillLevels));
  return skills.filter((skill) => getProbabilityOnlyAggregation(skill) !== undefined);
}

function expectedActiveProbabilityByRound(skill: Skill): Float64Array {
  const result = new Float64Array(ROUND_COUNT);
  if (skill.trigger.type === "always") {
    result.fill(1);
    return result;
  }
  if (skill.trigger.type !== "probability") {
    throw new Error(`车身技能 ${skill.id} 的${skill.trigger.type}触发器尚未纳入编译评分。`);
  }
  const frequency = skill.trigger.frequency;
  if (frequency === undefined) throw new Error(`车身技能 ${skill.id} 缺少概率判定频率。`);
  const attempts = skill.trigger.attemptsPerRound ?? 1;
  const successProbability = 1 - (1 - skill.trigger.probability) ** attempts;
  const lifecycle = skill.effects[0]?.lifecycle ?? skill.lifecycle;
  const duration = lifecycle?.durationRounds ?? skill.trigger.durationRounds;
  if (duration === undefined) {
    for (let round = 1; round <= ROUND_COUNT; round += 1) {
      result[round - 1] = isTriggerRound(skill, round) ? successProbability : 0;
    }
    return result;
  }
  if (lifecycle?.refreshMode !== "refresh" && lifecycle?.refreshMode !== "replace") {
    throw new Error(`车身技能 ${skill.id} 的持续效果必须明确为refresh或replace。`);
  }

  let states = new Map<number, number>([[0, 1]]);
  const nextRound = lifecycle.activationTiming === "nextRound";
  for (let round = 1; round <= ROUND_COUNT; round += 1) {
    const triggerProbability = isTriggerRound(skill, round) ? successProbability : 0;
    const afterTrigger = new Map<number, number>();
    if (nextRound) {
      result[round - 1] = probabilityWithPositiveRemaining(states);
      for (const [remaining, probability] of states) {
        addProbability(afterTrigger, Math.max(0, remaining - 1), probability * (1 - triggerProbability));
        addProbability(afterTrigger, duration, probability * triggerProbability);
      }
    } else {
      for (const [remaining, probability] of states) {
        addProbability(afterTrigger, remaining, probability * (1 - triggerProbability));
        addProbability(afterTrigger, duration, probability * triggerProbability);
      }
      result[round - 1] = probabilityWithPositiveRemaining(afterTrigger);
      states = decrementRemaining(afterTrigger);
      continue;
    }
    states = afterTrigger;
  }
  return result;
}

function isTriggerRound(skill: Skill, round: number): boolean {
  if (skill.trigger.type !== "probability") return false;
  if (skill.trigger.frequency === "oncePerRound") return true;
  if (skill.trigger.frequency === "oncePerBattle") return round === 1;
  if (skill.trigger.frequency === "explicitSchedule") {
    return skill.trigger.triggerRounds?.includes(round) === true;
  }
  return false;
}

function isExternalSkillSetFactorizable(input: TenRoundExpectedDamageInput): boolean {
  if ((input.fireCrystal?.skillIds.length ?? 0) > 0) return false;
  const skills: Skill[] = [];
  for (const heroId of [
    input.headFormation?.shieldHeroId,
    input.headFormation?.lancerHeroId,
    input.headFormation?.marksmanHeroId,
  ]) {
    if (heroId === undefined) continue;
    const hero = getHeadHeroById(heroId);
    if (hero === undefined) return false;
    for (const definition of hero.headSkills) {
      if (definition.status === "supported") skills.push(definition.skill);
    }
  }
  skills.push(...resolveAutomaticTroopSkills(input.troops, input.preparation?.troopSkillLevels));
  return skills.every(isFactorizableDynamicSkill);
}

function isFactorizableDynamicSkill(skill: Skill): boolean {
  if (skill.trigger.type === "always") return true;
  const categories = new Set<string>();
  for (const effect of skill.effects) {
    if (effect.type === "extraAttack" || effect.conditions?.length) return false;
    categories.add(effect.type === "extraDamage" ? "extraDamage" : canonicalBodyZone(effect.type) ?? effect.type);
  }
  // 一个随机事件同时改变多个乘区会产生相关性，必须回退通用概率状态机。
  return categories.size <= 1;
}

function createDeterministicReplacementMask(
  input: TenRoundExpectedDamageInput,
): Uint8Array | null {
  const mask = new Uint8Array(VECTOR_LENGTH);
  for (const heroId of [
    input.headFormation?.shieldHeroId,
    input.headFormation?.lancerHeroId,
    input.headFormation?.marksmanHeroId,
  ]) {
    if (heroId === undefined) continue;
    const hero = getHeadHeroById(heroId);
    if (hero === undefined) return null;
    for (const definition of hero.headSkills) {
      if (definition.status !== "supported") continue;
      const skill = definition.skill;
      for (const effect of skill.effects) {
        if (effect.zoneAggregation !== "replace") continue;
        const zone = canonicalBodyZone(effect.type);
        if (zone === null) return null;
        const active = expectedActiveProbabilityByRound(skill);
        if ([...active].some((probability) => probability !== 0 && probability !== 1)) return null;
        for (let roundIndex = 0; roundIndex < ROUND_COUNT; roundIndex += 1) {
          if (active[roundIndex] !== 1) continue;
          for (let troopIndex = 0; troopIndex < TROOP_TYPES.length; troopIndex += 1) {
            const troopType = TROOP_TYPES[troopIndex]!;
            if (effect.targetTroop !== undefined && effect.targetTroop !== "all" && effect.targetTroop !== troopType) continue;
            mask[vectorIndex(roundIndex, troopIndex, zone)] = 1;
          }
        }
      }
    }
  }
  return mask;
}

function canonicalBodyZone(type: SkillEffect["type"]): BodyZone | null {
  if (type === "damageIncrease") return "baseDamageIncrease";
  if (type === "normalAttackDamage") return "normalAttackDamageIncrease";
  return BODY_ZONES.includes(type as BodyZone) ? type as BodyZone : null;
}

function vectorIndex(roundIndex: number, troopIndex: number, zone: BodyZone): number {
  return (roundIndex * TROOP_TYPES.length + troopIndex) * BODY_ZONES.length + ZONE_INDEX[zone];
}

function addVector(target: Float64Array, source: Float64Array): void {
  for (let index = 0; index < target.length; index += 1) {
    target[index] = target[index]! + source[index]!;
  }
}

function addProbability(states: Map<number, number>, remaining: number, probability: number): void {
  if (probability === 0) return;
  states.set(remaining, (states.get(remaining) ?? 0) + probability);
}

function probabilityWithPositiveRemaining(states: ReadonlyMap<number, number>): number {
  let total = 0;
  for (const [remaining, probability] of states) if (remaining > 0) total += probability;
  return total;
}

function decrementRemaining(states: ReadonlyMap<number, number>): Map<number, number> {
  const next = new Map<number, number>();
  for (const [remaining, probability] of states) {
    addProbability(next, Math.max(0, remaining - 1), probability);
  }
  return next;
}
