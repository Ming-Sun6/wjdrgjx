import { calculateTenRoundExpectedDamage } from "../app/calculateTenRoundExpectedDamage";
import type { HeadFormation } from "../domain/battleDamage";
import type { BodySkillOption, BodySkillOptionId } from "../domain/bodySkillOption";
import type {
  BodyOptimizationOptions,
  BodyOptimizationResult,
} from "../domain/bodyOptimization";
import type {
  BattleSetupOptimizationOptions,
  BattleSetupOptimizationResult,
} from "../domain/battleSetupOptimization";
import type {
  BodyHeroDefinition,
  BodyHeroId,
  HeadHeroDefinition,
  HeadHeroId,
  HeroId,
  HeroSkillDefinition,
} from "../domain/hero";
import type { Skill, SkillEffect, SkillTrigger } from "../domain/skill";
import type { TenRoundExpectedDamageResult } from "../domain/tenRoundExpectedDamage";
import type {
  TroopCounts,
  TroopRatioOptimizationOptions,
  TroopRatioOptimizationResult,
  TroopRatios,
  TroopRatioSettings,
} from "../domain/troopRatioOptimization";
import type { TroopLevelId, TroopType } from "../domain/troop";
import type { TroopSkillId } from "../domain/troopSkill";
import type { BattlePreparationConfig, TownBuffSize } from "../domain/preparation";
import type {
  BattleReportHeroAdjustmentConfig,
  ReportHeroProfile,
  ReportHeroProfileId,
} from "../domain/reportHero";
import type { DamageDistributionResult } from "../domain/probability";
import { getHeroById } from "../game-data/heroes/bodyHeroQueries";
import {
  getAllBodySkillOptions,
  getBodySkillOptionById,
  getBodySkillOptionForHeroId,
  resolveBodySkillOptionHeroIds,
} from "../game-data/body-skills";
import { getAllHeadHeroes, getHeadHeroById } from "../game-data/heroes/headHeroQueries";
import {
  getReportHeroProfileById,
  getReportHeroProfilesByTroopType,
} from "../game-data/heroes/reportHeroProfiles";
import { troopLevels } from "../game-data/troops/troopLevels";
import { getFireCrystalSkills, getTroopSkillById } from "../game-data/troop-skills/troopSkillQueries";
import {
  BEAR_SLAYER_CAPACITY_PER_LEVEL,
  HUNTER_HEART_RATES,
  PET_BUFF_RATES,
  PET_CAPACITY_PER_LEVEL,
} from "../game-data/systems/progression";
import { optimizeBodyHeroes } from "../optimizer/body-heroes";
import { combinationsWithReplacementLimited } from "../optimizer/combinationsWithReplacement";
import { optimizeBattleSetup } from "../optimizer/battle-setup";
import {
  allocateTroopsByRatio,
  optimizeTroopRatio,
} from "../optimizer/troop-ratio";
import { calculateBaseTroopDamage } from "../rulesets/bear/base-damage";
import {
  BEAR_PIT_ATTACK_PERCENT,
  resolveBattleReportAdjustedTroops,
} from "../systems/reportHeroAdjustment";

export { BEAR_PIT_ATTACK_PERCENT } from "../systems/reportHeroAdjustment";

export const TROOP_TYPES = ["shield", "lancer", "marksman"] as const;
export const TROOP_LABELS: Readonly<Record<TroopType, string>> = {
  shield: "盾兵",
  lancer: "矛兵",
  marksman: "射手",
};

export interface TroopFormValues {
  readonly count: string;
  readonly troopLevelId: string;
  readonly attackPercent: string;
  readonly penetrationPercent: string;
}

export type CalculatorInputMode = "battleReport" | "rally";

export interface BattleReportInputState {
  readonly troops: Readonly<Record<TroopType, TroopFormValues>>;
  /** 可选仅用于兼容旧的序列化表单；缺省时按各兵种R、专武0级处理。 */
  readonly heroSelections?: Readonly<Record<TroopType, ReportHeroSelectionFormValues>>;
}

export interface ReportHeroSelectionFormValues {
  readonly profileId: string;
  readonly weaponLevel: string;
}

export interface RallyInputState {
  readonly generalAttackPercent: string;
  readonly generalPenetrationPercent: string;
  readonly troops: Readonly<Record<TroopType, TroopFormValues>>;
}

export interface CalculatorFormState {
  readonly inputMode: CalculatorInputMode;
  readonly battleReportInputState: BattleReportInputState;
  readonly rallyInputState: RallyInputState;
  readonly bodyHeroIds: readonly string[];
  readonly headHeroIds: Readonly<Record<TroopType, string>>;
  readonly headHeroWeaponLevels: Readonly<Record<TroopType, string>>;
  readonly fireCrystalSkillIds: readonly string[];
  readonly topK: string;
  readonly ratioStepPercent: string;
  readonly optimizeHead: boolean;
  readonly optimizeFireCrystal: boolean;
  readonly preparation: {
    readonly hunterHeartLevel: string;
    readonly bearSlayerLevel: string;
    readonly town: Readonly<Record<"attack" | "penetration" | "defenseReduction" | "marchCapacity", TownBuffSize>>;
    readonly pet: Readonly<Record<"attackLevel" | "penetrationLevel" | "defenseReductionLevel" | "capacityLevel", string>>;
    readonly rallyWeaponBuff: {
      readonly attackPercent: string;
      readonly penetrationPercent: string;
    };
    readonly marksmanBlazingStarLevel: string;
    readonly lancerT12SkillLevel: string;
  };
}

export interface PercentageNormalization {
  readonly displayPercent: number;
  readonly decimal: number;
  readonly multiplier: number;
}

export interface UiSkillNotice {
  readonly source: "body" | "head" | "fireCrystal";
  readonly ownerId: string;
  readonly ownerName: string;
  readonly skillName: string;
  readonly status: "pending" | "unsupported";
  readonly reason: string;
}

export interface UiSelectOption {
  readonly value: string;
  readonly label: string;
}

export interface UiHeroSkillDetail {
  readonly ownerId: string;
  readonly ownerName: string;
  readonly skillName: string;
  readonly status: "applied" | "pending" | "notApplicable" | "information";
  readonly summary: string;
  readonly sourceSummary?: string;
  readonly totalSummary?: string;
  readonly reason?: string;
}

export interface UiCalculationResult {
  readonly totalTroopCount: number;
  readonly expectedTotalDamage: number;
  readonly baseExpectedTotalDamage: number;
  readonly improvementAbsolute: number;
  readonly improvementRatio: number | null;
  readonly averageRoundDamage: number;
  readonly lower95: number;
  readonly upper95: number;
  readonly expectedDamageByTroop: Readonly<Record<TroopType, number>>;
  /** 使用最终出征容量与整数分配后的兵数，经正式基础引擎得到的单回合 D0。 */
  readonly baseDamageByTroop: Readonly<Record<TroopType, number>>;
  readonly percentageNormalization: Readonly<
    Record<TroopType, { readonly attack: PercentageNormalization; readonly penetration: PercentageNormalization }>
  >;
  readonly appliedSkills: readonly { readonly source: string; readonly skillName: string; readonly ownerId: string }[];
  readonly skippedSkills: readonly UiSkillNotice[];
  readonly result: TenRoundExpectedDamageResult;
}

type UiBattleInput = Parameters<typeof calculateTenRoundExpectedDamage>[0] & {
  readonly preparation: BattlePreparationConfig;
};

export type UiOptimizationKind = "body" | "ratio" | "full";

export interface UiOptimizationRow {
  readonly rank: number;
  readonly expectedTenRoundDamage: number;
  readonly improvementRatio: number | null;
  readonly troopCounts: TroopCounts;
  readonly ratios: TroopRatios;
  readonly bodyHeroIds: readonly string[];
  readonly bodyHeroNames: readonly string[];
  readonly headFormation: HeadFormation;
  readonly headHeroNames: readonly string[];
  readonly fireCrystalSkillIds: readonly string[];
  readonly fireCrystalNames: readonly string[];
}

export interface UiOptimizationResult {
  readonly kind: UiOptimizationKind;
  readonly title: string;
  readonly rows: readonly UiOptimizationRow[];
  readonly candidateCount: number;
  readonly evaluatedCount: number;
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly elapsedMs: number;
  readonly performanceWarning: string | null;
  /** 排名完成后仅为第1名生成，不参与候选评分。 */
  readonly topDamageInterval?: Pick<DamageDistributionResult, "lower95" | "upper95" | "method">;
}

export type UiOptimizationCoreRequest =
  | {
      readonly kind: "body";
      readonly input: Parameters<typeof optimizeBodyHeroes>[0];
      readonly options: BodyOptimizationOptions;
    }
  | {
      readonly kind: "ratio";
      readonly input: Parameters<typeof optimizeTroopRatio>[0];
      readonly options: TroopRatioOptimizationOptions;
    }
  | {
      readonly kind: "full";
      readonly input: Parameters<typeof optimizeBattleSetup>[0];
      readonly options: BattleSetupOptimizationOptions;
    };

export type UiOptimizationCoreResult =
  | { readonly kind: "body"; readonly result: BodyOptimizationResult; readonly topDamageInterval?: UiOptimizationResult["topDamageInterval"] }
  | { readonly kind: "ratio"; readonly result: TroopRatioOptimizationResult; readonly topDamageInterval?: UiOptimizationResult["topDamageInterval"] }
  | { readonly kind: "full"; readonly result: BattleSetupOptimizationResult; readonly topDamageInterval?: UiOptimizationResult["topDamageInterval"] };

export class UiInputError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "UiInputError";
  }
}

const UI_TROOP_LEVEL_IDS = [
  ...Array.from({ length: 10 }, (_, index) => `T${index + 1}`),
  ...Array.from({ length: 10 }, (_, index) => `T10-FC${index + 1}`),
  ...Array.from({ length: 6 }, (_, index) => `T11-FC${index + 5}`),
  "T12-FC10",
] as const;

export const knownTroopLevelOptions = UI_TROOP_LEVEL_IDS.map((id) => {
  const level = troopLevels[id as keyof typeof troopLevels];
  return { id: level.id, label: level.id, constant: level.constant };
});

export const missingTroopLevelOptions = Object.values(troopLevels)
  .filter((level) => level.status === "missing")
  .map((level) => level.id);

/** 普通 UI 选择技能效果；英雄身份只作为来源说明。 */
export const bodySkillOptions = getAllBodySkillOptions();
// UI允许选择仍有有效英雄/专武数据但尚无可计算远征技能的英雄；
// optimizableForBear 只约束自动优化候选，不得用来隐藏手动选择。
export const headHeroOptions = getAllHeadHeroes();
export const reportHeroOptionsByTroop: Readonly<Record<TroopType, readonly ReportHeroProfile[]>> = {
  shield: getReportHeroProfilesByTroopType("shield"),
  lancer: getReportHeroProfilesByTroopType("lancer"),
  marksman: getReportHeroProfilesByTroopType("marksman"),
};
export const weaponLevelOptions = Array.from({ length: 11 }, (_, level) =>
  levelOption(level),
);
// 自动解锁的燃晶火药、火焰冲击与炽火燧星不再作为手动复选项，避免重复计入。
export const fireCrystalSkillOptions = getFireCrystalSkills().filter(() => false);

export const hunterHeartLevelOptions = HUNTER_HEART_RATES.map((rate, level) =>
  levelOption(level, `${formatPercent(rate)} 对熊增伤`),
);
export const bearSlayerLevelOptions = Array.from({ length: 11 }, (_, level) =>
  levelOption(level, `+${(level * BEAR_SLAYER_CAPACITY_PER_LEVEL).toLocaleString("zh-CN")} 容量`),
);
export const petBuffLevelOptions = PET_BUFF_RATES.map((rate, level) =>
  levelOption(level, formatPercent(rate)),
);
export const petCapacityLevelOptions = Array.from({ length: 11 }, (_, level) =>
  levelOption(level, `+${(level * PET_CAPACITY_PER_LEVEL).toLocaleString("zh-CN")} 容量`),
);
export const troopSkillLevelOptions = Array.from({ length: 25 }, (_, level) =>
  levelOption(level),
);
export const topKOptions = Array.from({ length: 100 }, (_, index) => ({
  value: String(index + 1),
  label: String(index + 1),
}));

export const visiblePendingSkillDetails: readonly UiHeroSkillDetail[] = [
  ...headHeroOptions.flatMap((hero) =>
    hero.headSkills.flatMap((definition) =>
      definition.status === "pending" ? [toPendingDetail(hero, definition)] : [],
    ),
  ),
];

export function formatBodySkillOptionLabel(option: BodySkillOption): string {
  return option.label;
}

export function formatHeadHeroOptionLabel(hero: HeadHeroDefinition): string {
  return hero.generation === null ? hero.name : `${hero.name}（S${hero.generation}）`;
}

export function getSelectedHeroSkillDetails(form: CalculatorFormState): readonly UiHeroSkillDetail[] {
  const appliedEffects: AppliedEffectForUi[] = [];
  const details: UiHeroSkillDetail[] = [];
  const selectedBodyOptions = new Map<BodySkillOptionId, number>();
  for (const optionId of form.bodyHeroIds.filter(Boolean) as BodySkillOptionId[]) {
    selectedBodyOptions.set(optionId, (selectedBodyOptions.get(optionId) ?? 0) + 1);
  }
  for (const [optionId, count] of selectedBodyOptions) {
    const option = getBodySkillOptionById(optionId);
    if (option === undefined) continue;
    if (option.skill === null) {
      details.push({
        ownerId: option.id,
        ownerName: option.label,
        skillName: option.label,
        status: "notApplicable",
        summary: `当前选择数量：${count}；当前打熊输出不增加伤害。`,
        sourceSummary: option.sourceHeroNames.join("、") || "来源英雄资料待补充",
      });
      continue;
    }
    const effect = option.skill.effects[0]!;
    details.push({
      ownerId: option.id,
      ownerName: option.label,
      skillName: option.label,
      status: "applied",
      summary: [`当前选择数量：${count}`, summarizeEffectSchedule(option.skill, effect)].filter(Boolean).join("；"),
      sourceSummary: option.sourceHeroNames.join("、") || "来源英雄资料待补充",
      totalSummary: `${effectTotalLabel(effect)} ${formatContribution(effect, effect.value * count, true)}`,
    });
  }
  for (const troopType of TROOP_TYPES) {
    const heroId = form.headHeroIds[troopType];
    if (!heroId) continue;
    const hero = getHeadHeroById(heroId as HeadHeroId);
    if (hero === undefined) continue;
    for (const definition of hero.headSkills) {
      if (definition.status === "supported") {
        details.push(toSupportedHeadSkillDetail(hero, definition));
      } else {
        collectSkillDefinitionEffects(hero, definition, appliedEffects, details);
      }
    }
    for (const definition of hero.notApplicableToBearOutgoingDamage ?? []) {
      details.push({
        ownerId: hero.id,
        ownerName: hero.name,
        skillName: definition.name,
        status: "notApplicable",
        summary: definition.rawDescription,
        sourceSummary: hero.name,
      });
    }
    if (hero.headSkills.length === 0) {
      const explorationNames = (hero.explorationSkills ?? []).map((skill) => skill.name).join("、");
      details.push({
        ownerId: hero.id,
        ownerName: hero.name,
        skillName: "打熊远征技能",
        status: "information",
        summary: `当前数据源未提供可计算的打熊远征技能${explorationNames ? `；${explorationNames}已确认为探险技能，不参与计算` : ""}。${describeExclusiveWeapon(hero) || "未记录专武增益类型"}仍按数据配置处理。`,
        sourceSummary: hero.name,
      });
    }
  }
  return [...mergeAppliedSkillEffects(appliedEffects), ...details];
}

export function formatRatioPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function createDefaultFormState(): CalculatorFormState {
  const createNeutralTroops = (): Readonly<Record<TroopType, TroopFormValues>> => ({
    shield: { count: "0", troopLevelId: "T1", attackPercent: "0", penetrationPercent: "0" },
    lancer: { count: "0", troopLevelId: "T1", attackPercent: "0", penetrationPercent: "0" },
    marksman: { count: "0", troopLevelId: "T1", attackPercent: "0", penetrationPercent: "0" },
  });
  return {
    inputMode: "battleReport",
    battleReportInputState: {
      troops: createNeutralTroops(),
      heroSelections: {
        shield: { profileId: "report-hero.shield.r", weaponLevel: "0" },
        lancer: { profileId: "report-hero.lancer.r", weaponLevel: "0" },
        marksman: { profileId: "report-hero.marksman.r", weaponLevel: "0" },
      },
    },
    rallyInputState: {
      generalAttackPercent: "0",
      generalPenetrationPercent: "0",
      troops: createNeutralTroops(),
    },
    bodyHeroIds: ["", "", "", ""],
    headHeroIds: { shield: "", lancer: "", marksman: "" },
    headHeroWeaponLevels: { shield: "0", lancer: "0", marksman: "0" },
    fireCrystalSkillIds: [],
    topK: "10",
    ratioStepPercent: "0.01",
    optimizeHead: false,
    optimizeFireCrystal: false,
    preparation: {
      hunterHeartLevel: "0",
      bearSlayerLevel: "0",
      town: { attack: "none", penetration: "none", defenseReduction: "none", marchCapacity: "none" },
      pet: { attackLevel: "0", penetrationLevel: "0", defenseReductionLevel: "0", capacityLevel: "0" },
      rallyWeaponBuff: { attackPercent: "0", penetrationPercent: "0" },
      marksmanBlazingStarLevel: "0",
      lancerT12SkillLevel: "0",
    },
  };
}

export function displayPercentToDecimal(value: string | number): number {
  const percentage = readFiniteNumber(String(value), "百分比");
  return percentage / 100;
}

export function calculateDisplayedTotalTroops(form: CalculatorFormState): number {
  const troops = activeTroopFormValues(form);
  return TROOP_TYPES.reduce((sum, troopType) => {
    const raw = troops[troopType].count.trim();
    if (!raw) return sum;
    const count = Number(raw);
    return Number.isSafeInteger(count) && count >= 0 ? sum + count : sum;
  }, 0);
}

/**
 * 基础出征容量的唯一 UI 数据源：玩家填写的盾、矛、射原始兵数之和。
 * 与扩容后的最终兵数分离，避免把 finalMarchCapacity 再作为下一次计算的基础容量。
 */
export function calculateInputTroopTotal(form: CalculatorFormState): number {
  const counts = parseTroopCounts(form);
  return counts.shield + counts.lancer + counts.marksman;
}

export function calculateUiDamage(
  form: CalculatorFormState,
  options: { readonly includeDamageInterval?: boolean } = {},
): UiCalculationResult {
  const built = buildBattleInput(form);
  const includeDamageInterval = options.includeDamageInterval ?? true;
  const result = calculateTenRoundExpectedDamage(built.input, {
    includeDamageDistribution: includeDamageInterval,
  });
  const baseline = calculateTenRoundExpectedDamage({
    troops: built.effectiveTroops,
    bodyHeroIds: [],
    headFormation: {},
    fireCrystal: { skillIds: [] },
    preparation: {
      ...built.input.preparation,
      exclusiveWeapons: { levelsByHeroId: {} },
    },
  });
  const improvementAbsolute = result.expectedTotalDamage - baseline.expectedTotalDamage;
  const improvementRatio = baseline.expectedTotalDamage === 0
    ? null
    : result.expectedTotalDamage / baseline.expectedTotalDamage - 1;
  const interval = result.damageDistribution ?? {
    lower95: result.expectedTotalDamage,
    upper95: result.expectedTotalDamage,
  };
  const finalTotalTroopCount = result.preparation?.capacity.finalMarchCapacity
    ?? built.input.troops.reduce((sum, troop) => sum + troop.troopCount, 0);
  const finalTroopCounts = result.preparation?.troopCounts;
  const baseDamageByTroop = Object.fromEntries(
    built.effectiveTroops.map((troop) => [
      troop.troopType,
      calculateBaseTroopDamage({
        ...troop,
        totalTroopCount: finalTotalTroopCount,
        troopCount: finalTroopCounts?.[troop.troopType] ?? troop.troopCount,
      }).damage,
    ]),
  ) as Readonly<Record<TroopType, number>>;

  const coreSkipped: UiSkillNotice[] = [
    ...result.skippedPendingSkills,
    ...result.unsupportedSkills,
  ].map((skill) => ({
    source: skill.source,
    ownerId: skill.ownerId,
    ownerName: resolveOwnerName(skill.source, skill.ownerId),
    skillName: skill.skillName,
    status: skill.status,
    reason: skill.reason,
  }));

  return {
    totalTroopCount: finalTotalTroopCount,
    expectedTotalDamage: result.expectedTotalDamage,
    baseExpectedTotalDamage: baseline.expectedTotalDamage,
    improvementAbsolute,
    improvementRatio,
    averageRoundDamage: result.expectedTotalDamage / result.context.totalRounds,
    lower95: interval.lower95,
    upper95: interval.upper95,
    expectedDamageByTroop: result.expectedDamageByTroop,
    baseDamageByTroop,
    percentageNormalization: built.percentageNormalization,
    appliedSkills: result.appliedSkills.map((skill) => ({
      source: skill.source,
      skillName: skill.skillName,
      ownerId: skill.ownerId,
    })),
    skippedSkills: [...built.localSkippedSkills, ...coreSkipped],
    result,
  };
}

export function createOptimizationRequest(
  form: CalculatorFormState,
  kind: UiOptimizationKind,
): UiOptimizationCoreRequest {
  const built = buildBattleInput(form);
  const topK = readPositiveSafeInteger(form.topK, "Top K");
  const ratioStepPercent = readFiniteNumber(form.ratioStepPercent, "比例步长");
  if (ratioStepPercent <= 0 || ratioStepPercent > 100) {
    throw new UiInputError("比例步长必须大于0且不超过100%。");
  }
  const totalTroopCount = built.input.preparation.baseMarchCapacity;
  if (totalTroopCount <= 0) throw new UiInputError("执行优化前，总兵量必须大于0。");
  const troopSettings = Object.fromEntries(
    built.input.troops.map((troop) => [
      troop.troopType,
      { troopLevelId: troop.troopLevelId, stats: troop.stats },
    ]),
  ) as Readonly<Record<TroopType, TroopRatioSettings>>;

  if (kind === "body") {
    return {
      kind,
      input: {
        troops: built.input.troops,
        ...(built.input.headFormation ? { headFormation: built.input.headFormation } : {}),
        ...(built.input.fireCrystal ? { fireCrystal: built.input.fireCrystal } : {}),
        preparation: built.input.preparation,
        ...(built.input.battleReportHeroAdjustment === undefined
          ? {}
          : { battleReportHeroAdjustment: built.input.battleReportHeroAdjustment }),
      },
      options: { bodyCount: 4, topK },
    };
  }

  if (kind === "ratio") {
    return {
      kind,
      input: {
        totalTroopCount,
        troopSettings,
        bodyHeroIds: built.input.bodyHeroIds,
        ...(built.input.headFormation ? { headFormation: built.input.headFormation } : {}),
        ...(built.input.fireCrystal ? { fireCrystal: built.input.fireCrystal } : {}),
        preparation: built.input.preparation,
        ...(built.input.battleReportHeroAdjustment === undefined
          ? {}
          : { battleReportHeroAdjustment: built.input.battleReportHeroAdjustment }),
        baselineRatios: countsToRatios(toTroopCounts(built.input.troops)),
      },
      options: { stepPercent: ratioStepPercent, topK },
    };
  }

  return {
    kind,
    input: {
      totalTroopCount,
      troopSettings,
      preparation: built.input.preparation,
      ...(built.input.battleReportHeroAdjustment === undefined
        ? {}
        : { battleReportHeroAdjustment: built.input.battleReportHeroAdjustment }),
      ...(built.input.headFormation ? { headFormation: built.input.headFormation } : {}),
      ...(built.input.fireCrystal ? { fireCrystal: built.input.fireCrystal } : {}),
    },
    options: {
      ratioStepPercent,
      bodyCount: 4,
      topK,
    },
  };
}

export function runOptimizationCore(
  request: UiOptimizationCoreRequest,
  options: { readonly includeTopDamageInterval?: boolean } = {},
): UiOptimizationCoreResult {
  let core: UiOptimizationCoreResult;
  if (request.kind === "body") {
    core = { kind: request.kind, result: optimizeBodyHeroes(request.input, request.options) };
  } else if (request.kind === "ratio") {
    core = { kind: request.kind, result: optimizeTroopRatio(request.input, request.options) };
  } else {
    core = { kind: request.kind, result: optimizeBattleSetup(request.input, request.options) };
  }
  if (options.includeTopDamageInterval !== true) return core;
  const topDamageInterval = calculateTopOptimizationDamageInterval(request, core);
  return topDamageInterval === undefined ? core : { ...core, topDamageInterval };
}

export function toUiOptimizationResult(
  core: UiOptimizationCoreResult,
  form: CalculatorFormState,
): UiOptimizationResult {
  const currentCounts = parseTroopCounts(form);
  const currentRatios = countsToRatios(currentCounts);
  const currentHead = formToHeadFormation(form);
  const currentFire = form.fireCrystalSkillIds;

  if (core.kind === "body") {
    return {
      kind: core.kind,
      title: "四车身优化",
      candidateCount: core.result.combinationCount,
      evaluatedCount: core.result.evaluatedCombinationCount,
      cacheHits: core.result.stats.cacheHits,
      cacheMisses: core.result.stats.cacheMisses,
      elapsedMs: core.result.stats.elapsedMs,
      performanceWarning: null,
      ...(core.topDamageInterval === undefined ? {} : { topDamageInterval: core.topDamageInterval }),
      rows: core.result.results.map((candidate) => createOptimizationRow({
        rank: candidate.rank,
        score: candidate.score,
        improvementRatio: candidate.improvementRatio,
        troopCounts: currentCounts,
        ratios: currentRatios,
        bodyHeroIds: candidate.bodySkillOptionIds,
        headFormation: currentHead,
        fireCrystalSkillIds: currentFire,
      })),
    };
  }

  if (core.kind === "ratio") {
    return {
      kind: core.kind,
      title: "兵种比例优化",
      candidateCount: core.result.evaluatedRatioCount,
      evaluatedCount: core.result.stats.evaluatedCount,
      cacheHits: core.result.stats.cacheHits,
      cacheMisses: core.result.stats.cacheMisses,
      elapsedMs: core.result.stats.elapsedMs,
      performanceWarning: null,
      ...(core.topDamageInterval === undefined ? {} : { topDamageInterval: core.topDamageInterval }),
      rows: core.result.results.map((candidate) => createOptimizationRow({
        rank: candidate.rank,
        score: candidate.score,
        improvementRatio: candidate.improvementRatio ?? null,
        troopCounts: candidate.troopCounts,
        ratios: candidate.ratios,
        bodyHeroIds: form.bodyHeroIds.filter(Boolean),
        headFormation: currentHead,
        fireCrystalSkillIds: currentFire,
      })),
    };
  }

  return {
    kind: core.kind,
    title: "完整联合优化",
    candidateCount: core.result.cartesianCandidateCount,
    evaluatedCount: core.result.evaluatedSetupCount,
    cacheHits: core.result.stats.cacheHits,
    cacheMisses: core.result.stats.cacheMisses,
    elapsedMs: core.result.stats.elapsedMs,
    performanceWarning: null,
    ...(core.topDamageInterval === undefined ? {} : { topDamageInterval: core.topDamageInterval }),
    rows: core.result.results.map((candidate) => createOptimizationRow({
      rank: candidate.rank,
      score: candidate.score,
      improvementRatio: candidate.improvementRatio,
      troopCounts: candidate.troopCounts,
      ratios: candidate.ratios,
      bodyHeroIds: candidate.heroIds,
      headFormation: currentHead,
      fireCrystalSkillIds: currentFire,
    })),
  };
}

function calculateTopOptimizationDamageInterval(
  request: UiOptimizationCoreRequest,
  core: UiOptimizationCoreResult,
): UiOptimizationResult["topDamageInterval"] {
  const top = core.result.results[0];
  if (top === undefined) return undefined;

  if (request.kind === "body" && core.kind === "body") {
    const { enemyBaseDefense, ...input } = request.input;
    return intervalForInput(
      { ...input, bodyHeroIds: core.result.results[0]!.heroIds },
      enemyBaseDefense,
    );
  }

  if (request.kind === "ratio" && core.kind === "ratio") {
    const candidate = core.result.results[0]!;
    return intervalForInput({
      troops: troopsForOptimization(request.input.troopSettings, candidate.troopCounts),
      bodyHeroIds: request.input.bodyHeroIds,
      ...(request.input.headFormation === undefined ? {} : { headFormation: request.input.headFormation }),
      ...(request.input.fireCrystal === undefined ? {} : { fireCrystal: request.input.fireCrystal }),
      ...(request.input.preparation === undefined ? {} : { preparation: request.input.preparation }),
      ...(request.input.damageChannel === undefined ? {} : { damageChannel: request.input.damageChannel }),
      ...(request.input.battleReportHeroAdjustment === undefined
        ? {}
        : { battleReportHeroAdjustment: request.input.battleReportHeroAdjustment }),
    }, request.input.enemyBaseDefense);
  }

  if (request.kind === "full" && core.kind === "full") {
    const candidate = core.result.results[0]!;
    return intervalForInput({
      troops: troopsForOptimization(request.input.troopSettings, candidate.troopCounts),
      bodyHeroIds: candidate.heroIds,
      ...(request.input.headFormation === undefined ? {} : { headFormation: request.input.headFormation }),
      ...(request.input.fireCrystal === undefined ? {} : { fireCrystal: request.input.fireCrystal }),
      ...(request.input.preparation === undefined ? {} : { preparation: request.input.preparation }),
      ...(request.input.damageChannel === undefined ? {} : { damageChannel: request.input.damageChannel }),
      ...(request.input.battleReportHeroAdjustment === undefined
        ? {}
        : { battleReportHeroAdjustment: request.input.battleReportHeroAdjustment }),
    }, request.input.enemyBaseDefense);
  }
  return undefined;
}

function intervalForInput(
  input: Parameters<typeof calculateTenRoundExpectedDamage>[0],
  enemyBaseDefense: number | undefined,
): NonNullable<UiOptimizationResult["topDamageInterval"]> {
  const result = calculateTenRoundExpectedDamage(input, {
    includeDamageDistribution: true,
    ...(enemyBaseDefense === undefined ? {} : { enemyBaseDefense }),
  });
  const distribution = result.damageDistribution;
  if (distribution === undefined) {
    return {
      lower95: result.expectedTotalDamage,
      upper95: result.expectedTotalDamage,
      method: "exactStateDistribution",
    };
  }
  return {
    lower95: distribution.lower95,
    upper95: distribution.upper95,
    method: distribution.method,
  };
}

function troopsForOptimization(
  settings: Readonly<Record<TroopType, TroopRatioSettings>>,
  counts: TroopCounts,
): Parameters<typeof calculateTenRoundExpectedDamage>[0]["troops"] {
  return TROOP_TYPES.map((troopType) => ({
    troopType,
    troopCount: counts[troopType],
    troopLevelId: settings[troopType].troopLevelId,
    stats: settings[troopType].stats,
  }));
}

export function estimateFullCandidateCount(form: CalculatorFormState): number {
  const step = readFiniteNumber(form.ratioStepPercent, "比例步长");
  const tickCount = 100 / step;
  if (!Number.isSafeInteger(tickCount)) throw new UiInputError("比例步长必须能整除 100%。");
  const ratioCount = ((tickCount + 1) * (tickCount + 2)) / 2;
  const bodyCount = combinationsWithReplacementLimited(bodySkillOptions, 4, 2).length;
  return ratioCount * bodyCount;
}

export function applyOptimizationRow(
  form: CalculatorFormState,
  row: UiOptimizationRow,
): CalculatorFormState {
  const bodyHeroIds = [...row.bodyHeroIds.slice(0, 4)];
  while (bodyHeroIds.length < 4) bodyHeroIds.push("");
  // 优化结果中的 troopCounts 可能已经是扩容后的最终兵数。写回表单时只写比例，
  // 并按玩家原始三兵种总数重新分配，防止再次计算时发生二次扩容。
  const inputTroopCounts = allocateTroopsByRatio(
    calculateInputTroopTotal(form),
    row.ratios,
  );
  const updatedTroops = Object.fromEntries(TROOP_TYPES.map((troopType) => [
    troopType,
    { ...activeTroopFormValues(form)[troopType], count: String(inputTroopCounts[troopType]) },
  ])) as Readonly<Record<TroopType, TroopFormValues>>;
  return {
    ...form,
    ...(form.inputMode === "battleReport"
      ? { battleReportInputState: { ...form.battleReportInputState, troops: updatedTroops } }
      : { rallyInputState: { ...form.rallyInputState, troops: updatedTroops } }),
    bodyHeroIds,
    headHeroIds: {
      shield: row.headFormation.shieldHeroId ?? "",
      lancer: row.headFormation.lancerHeroId ?? "",
      marksman: row.headFormation.marksmanHeroId ?? "",
    },
    fireCrystalSkillIds: [...row.fireCrystalSkillIds],
  };
}

function buildBattleInput(form: CalculatorFormState): {
  readonly input: UiBattleInput;
  readonly effectiveTroops: UiBattleInput["troops"];
  readonly percentageNormalization: UiCalculationResult["percentageNormalization"];
  readonly localSkippedSkills: readonly UiSkillNotice[];
} {
  const percentageNormalization = {} as Record<
    TroopType,
    { attack: PercentageNormalization; penetration: PercentageNormalization }
  >;
  const activeTroops = activeTroopFormValues(form);
  const rallyGeneralAttack = form.inputMode === "rally"
    ? readFiniteNumber(form.rallyInputState.generalAttackPercent, "部队攻击")
    : 0;
  const rallyGeneralPenetration = form.inputMode === "rally"
    ? readFiniteNumber(form.rallyInputState.generalPenetrationPercent, "部队穿透")
    : 0;
  const troops = TROOP_TYPES.map((troopType) => {
    const values = activeTroops[troopType];
    const troopCount = readNonNegativeSafeInteger(values.count, `${TROOP_LABELS[troopType]}数量`);
    const level = troopLevels[values.troopLevelId as keyof typeof troopLevels];
    if (level === undefined) throw new UiInputError(`${TROOP_LABELS[troopType]}等级不存在。`);
    if (level.status !== "known") throw new UiInputError(`${values.troopLevelId} 的等级常数尚未提供，不能计算。`);
    const attackPercent = readFiniteNumber(values.attackPercent, `${TROOP_LABELS[troopType]}攻击加成`)
      + (form.inputMode === "rally" ? rallyGeneralAttack + BEAR_PIT_ATTACK_PERCENT : 0);
    const penetrationPercent = readFiniteNumber(values.penetrationPercent, `${TROOP_LABELS[troopType]}穿透加成`)
      + rallyGeneralPenetration;
    return {
      troopType,
      troopCount,
      troopLevelId: level.id as TroopLevelId,
      // Stage 24 API契约使用百分数点；decimal已在UI适配层验证并用于解释。
      stats: { attackPercent, penetrationPercent },
    };
  });

  const selectedBodyOptionIds: BodySkillOptionId[] = [];
  const localSkippedSkills: UiSkillNotice[] = [];
  for (const rawOptionId of form.bodyHeroIds.filter(Boolean)) {
    const option = getBodySkillOptionById(rawOptionId as BodySkillOptionId);
    if (option === undefined) throw new UiInputError(`找不到车身技能：${rawOptionId}。`);
    selectedBodyOptionIds.push(option.id);
  }
  const bodyHeroIds = [...resolveBodySkillOptionHeroIds(selectedBodyOptionIds)];

  const headFormation = formToHeadFormation(form);
  const fireCrystalSkillIds = form.fireCrystalSkillIds.map((skillId) => {
    if (getTroopSkillById(skillId as TroopSkillId) === undefined) {
      throw new UiInputError(`找不到火晶技能：${skillId}。`);
    }
    return skillId as TroopSkillId;
  });
  const preparation = buildPreparationConfig(form);
  const battleReportHeroAdjustment = form.inputMode === "battleReport"
    ? buildBattleReportHeroAdjustment(form)
    : undefined;
  const effectiveTroops = battleReportHeroAdjustment === undefined
    ? troops
    : resolveBattleReportAdjustedTroops(
        troops,
        headFormation,
        battleReportHeroAdjustment,
      ).troops;
  for (const troop of effectiveTroops) {
    const attackDecimal = displayPercentToDecimal(troop.stats.attackPercent);
    const penetrationDecimal = displayPercentToDecimal(troop.stats.penetrationPercent);
    percentageNormalization[troop.troopType] = {
      attack: { displayPercent: troop.stats.attackPercent, decimal: attackDecimal, multiplier: 1 + attackDecimal },
      penetration: { displayPercent: troop.stats.penetrationPercent, decimal: penetrationDecimal, multiplier: 1 + penetrationDecimal },
    };
  }

  return {
    input: {
      troops,
      bodyHeroIds,
      headFormation,
      fireCrystal: { skillIds: fireCrystalSkillIds },
      preparation,
      ...(battleReportHeroAdjustment === undefined ? {} : { battleReportHeroAdjustment }),
    },
    effectiveTroops,
    percentageNormalization,
    localSkippedSkills,
  };
}

function buildBattleReportHeroAdjustment(
  form: CalculatorFormState,
): BattleReportHeroAdjustmentConfig {
  const reportHeroes = {} as Record<TroopType, {
    profileId: ReportHeroProfileId;
    weaponLevel: number;
  }>;
  const actualWeaponLevels = {} as Record<TroopType, number>;
  for (const troopType of TROOP_TYPES) {
    const selection = form.battleReportInputState.heroSelections?.[troopType] ?? {
      profileId: `report-hero.${troopType}.r`,
      weaponLevel: "0",
    };
    const profile = getReportHeroProfileById(selection.profileId as ReportHeroProfileId);
    if (profile === undefined) throw new UiInputError(`找不到${TROOP_LABELS[troopType]}战报英雄档案。`);
    if (profile.troopType !== troopType) {
      throw new UiInputError(`${profile.label}不能作为${TROOP_LABELS[troopType]}战报英雄。`);
    }
    const reportWeaponLevel = readIntegerInRange(
      selection.weaponLevel,
      `${TROOP_LABELS[troopType]}战报英雄专武等级`,
      0,
      10,
    );
    if (!profile.hasExclusiveWeapon && reportWeaponLevel !== 0) {
      throw new UiInputError(`${profile.label}没有专武，专武等级必须为0。`);
    }
    reportHeroes[troopType] = { profileId: profile.id, weaponLevel: reportWeaponLevel };
    const actualLevel = readIntegerInRange(
      form.headHeroWeaponLevels[troopType],
      `${TROOP_LABELS[troopType]}实际车头专武等级`,
      0,
      10,
    );
    actualWeaponLevels[troopType] = form.headHeroIds[troopType] ? actualLevel : 0;
  }
  return { reportHeroes, actualWeaponLevels };
}

function buildPreparationConfig(form: CalculatorFormState): BattlePreparationConfig {
  const rallyWeaponAttackRate = displayPercentToDecimal(readFiniteNumber(
    form.preparation.rallyWeaponBuff.attackPercent,
    "集结专武攻击加成",
  ));
  const rallyWeaponPenetrationRate = displayPercentToDecimal(readFiniteNumber(
    form.preparation.rallyWeaponBuff.penetrationPercent,
    "集结专武穿透加成",
  ));
  return {
    baseMarchCapacity: calculateInputTroopTotal(form),
    capacityMode: form.inputMode === "rally" ? "useFinalTroops" : "expandBaseTroops",
    otherFixedCapacity: 0,
    expert: {
      hunterHeartLevel: readIntegerInRange(form.preparation.hunterHeartLevel, "猎手之心等级", 0, 11),
      bearSlayerLevel: readIntegerInRange(form.preparation.bearSlayerLevel, "巨熊克星等级", 0, 10),
    },
    town: form.preparation.town,
    pet: {
      attackLevel: readIntegerInRange(form.preparation.pet.attackLevel, "宠物攻击等级", 0, 10),
      penetrationLevel: readIntegerInRange(form.preparation.pet.penetrationLevel, "宠物穿透等级", 0, 10),
      defenseReductionLevel: readIntegerInRange(form.preparation.pet.defenseReductionLevel, "宠物减防等级", 0, 10),
      capacityLevel: readIntegerInRange(form.preparation.pet.capacityLevel, "宠物出征等级", 0, 10),
    },
    additionalDamageBuffs: {
      attackRate: rallyWeaponAttackRate,
      penetrationRate: rallyWeaponPenetrationRate,
    },
    troopSkillLevels: {
      marksmanBlazingStarLevel: readIntegerInRange(form.preparation.marksmanBlazingStarLevel, "炽火燧星（射T12技能）等级", 0, 24),
      lancerT12SkillLevel: readIntegerInRange(form.preparation.lancerT12SkillLevel, "烈辉战阵（矛T12技能）等级", 0, 24),
    },
  };
}

function formToHeadFormation(form: CalculatorFormState): HeadFormation {
  const formation: {
    shieldHeroId?: HeadHeroId;
    lancerHeroId?: HeadHeroId;
    marksmanHeroId?: HeadHeroId;
  } = {};
  for (const troopType of TROOP_TYPES) {
    const rawHeroId = form.headHeroIds[troopType];
    if (!rawHeroId) continue;
    const hero = getHeadHeroById(rawHeroId as HeadHeroId);
    if (hero === undefined) throw new UiInputError(`找不到车头英雄：${rawHeroId}。`);
    if (hero.troopType !== troopType) {
      throw new UiInputError(`${hero.name}不能放入${TROOP_LABELS[troopType]}车头槽。`);
    }
    formation[`${troopType}HeroId`] = hero.id;
  }
  return formation;
}

function parseTroopCounts(form: CalculatorFormState): TroopCounts {
  const troops = activeTroopFormValues(form);
  return {
    shield: readNonNegativeSafeInteger(troops.shield.count, "盾兵数量"),
    lancer: readNonNegativeSafeInteger(troops.lancer.count, "矛兵数量"),
    marksman: readNonNegativeSafeInteger(troops.marksman.count, "射手数量"),
  };
}

export function activeTroopFormValues(
  form: CalculatorFormState,
): Readonly<Record<TroopType, TroopFormValues>> {
  return form.inputMode === "battleReport"
    ? form.battleReportInputState.troops
    : form.rallyInputState.troops;
}

function toTroopCounts(troops: Parameters<typeof calculateTenRoundExpectedDamage>[0]["troops"]): TroopCounts {
  const counts: TroopCounts = { shield: 0, lancer: 0, marksman: 0 };
  for (const troop of troops) {
    (counts as Record<TroopType, number>)[troop.troopType] += troop.troopCount;
  }
  return counts;
}

function countsToRatios(counts: TroopCounts): TroopRatios {
  const total = counts.shield + counts.lancer + counts.marksman;
  if (total <= 0) return { shield: 0, lancer: 0, marksman: 0 };
  return {
    shield: counts.shield / total * 100,
    lancer: counts.lancer / total * 100,
    marksman: counts.marksman / total * 100,
  };
}

function createOptimizationRow(input: {
  readonly rank: number;
  readonly score: number;
  readonly improvementRatio: number | null;
  readonly troopCounts: TroopCounts;
  readonly ratios: TroopRatios;
  readonly bodyHeroIds: readonly string[];
  readonly headFormation: HeadFormation;
  readonly fireCrystalSkillIds: readonly string[];
}): UiOptimizationRow {
  const normalizedBodyOptionIds = input.bodyHeroIds.map((optionOrHeroId) => {
    const direct = getBodySkillOptionById(optionOrHeroId as BodySkillOptionId);
    if (direct !== undefined) return direct.id;
    return getBodySkillOptionForHeroId(optionOrHeroId as BodyHeroId)?.id ?? optionOrHeroId;
  });
  const bodyHeroNames = normalizedBodyOptionIds.map((optionOrHeroId) =>
    getBodySkillOptionById(optionOrHeroId as BodySkillOptionId)?.label
      ?? getHeroById(optionOrHeroId as HeroId)?.name
      ?? optionOrHeroId,
  );
  const headHeroIds = [
    input.headFormation.shieldHeroId,
    input.headFormation.lancerHeroId,
    input.headFormation.marksmanHeroId,
  ].filter((value): value is HeadHeroId => value !== undefined);
  return {
    rank: input.rank,
    expectedTenRoundDamage: input.score,
    improvementRatio: input.improvementRatio,
    troopCounts: input.troopCounts,
    ratios: input.ratios,
    bodyHeroIds: normalizedBodyOptionIds,
    bodyHeroNames,
    headFormation: input.headFormation,
    headHeroNames: headHeroIds.map((heroId) => getHeadHeroById(heroId)?.name ?? heroId),
    fireCrystalSkillIds: input.fireCrystalSkillIds,
    fireCrystalNames: input.fireCrystalSkillIds.map((skillId) =>
      getTroopSkillById(skillId as TroopSkillId)?.name ?? skillId,
    ),
  };
}

function resolveOwnerName(source: "head" | "fireCrystal", ownerId: string): string {
  return source === "head"
    ? getHeadHeroById(ownerId as HeadHeroId)?.name ?? ownerId
    : TROOP_LABELS[ownerId as TroopType] ?? ownerId;
}

function levelOption(level: number, detail?: string): UiSelectOption {
  return {
    value: String(level),
    label: `${level}级${detail === undefined ? "" : `（${detail}）`}`,
  };
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value * 100)}%`;
}

function cleanSkillName(name: string): string {
  return name
    .replace(/[（(]车身?5级[）)]/g, "")
    .replace(/[（(]5级[）)]/g, "")
    .trim();
}

function describeExclusiveWeapon(hero: HeadHeroDefinition): string {
  if (hero.exclusiveWeaponBuffType === "attack") return "专武提供攻击增益";
  if (hero.exclusiveWeaponBuffType === "penetration") return "专武提供穿透增益";
  return "";
}

function summarizeSkill(skill: Skill): string {
  const effectText = skill.effects.map((effect) => summarizeEffect(effect)).join("；");
  const triggerText = summarizeTrigger(skill.trigger);
  return `${triggerText}${effectText || cleanSkillName(skill.name)}`;
}

function summarizeTrigger(trigger: SkillTrigger): string {
  if (trigger.type === "probability") return `${formatPercent(trigger.probability)}概率`;
  if (trigger.type === "everyNRounds") {
    return trigger.firstTriggerRound === undefined
      ? `每${trigger.interval}回合`
      : `第${trigger.firstTriggerRound}回合起每${trigger.interval}回合`;
  }
  return "";
}

function summarizeEffect(effect: SkillEffect): string {
  const value = effect.valueByEnemyTroop?.shield ?? effect.value;
  const percentage = formatPercent(value);
  const target = effect.targetTroop === "shield"
    ? "盾兵"
    : effect.targetTroop === "lancer"
      ? "矛兵"
      : effect.targetTroop === "marksman"
        ? "射手"
        : "全军";
  switch (effect.type) {
    case "attack": return `${target}攻击 +${percentage}`;
    case "penetration": return `${target}穿透 +${percentage}`;
    case "defenseReduction": return `敌军防御 -${percentage}`;
    case "baseDamageIncrease": return `${target}伤害 +${percentage}`;
    case "normalAttackDamageIncrease": return `${target}普通攻击伤害 +${percentage}`;
    case "skillDamageIncrease": return `${target}技能伤害 +${percentage}`;
    case "damageIncrease": return `${target}伤害 +${percentage}`;
    case "vulnerable": return `目标受到伤害 +${percentage}`;
    case "normalAttackDamage": return `${target}普通攻击伤害 +${percentage}`;
    case "skillDamage": return `${target}技能伤害 +${percentage}`;
    case "shieldDamage": return `盾兵伤害 +${percentage}`;
    case "lancerDamage": return `矛兵伤害 +${percentage}`;
    case "marksmanDamage": return `射手伤害 +${percentage}`;
    case "troopVsTroopDamage": return `对盾目标伤害 +${percentage}`;
    case "extraDamage": return `${target}额外伤害 +${percentage}`;
    case "extraAttack": return `${target}额外攻击 +${effect.count ?? effect.value}次`;
    case "buffAttack": return `Buff攻击 +${percentage}`;
    case "buffPenetration": return `Buff穿透 +${percentage}`;
    case "buffDefenseReduction": return `Buff减防 +${percentage}`;
    case "expertBearDamage": return `对熊伤害 +${percentage}`;
  }
}

interface AppliedEffectForUi {
  readonly hero: BodyHeroDefinition | HeadHeroDefinition;
  readonly skill: Skill;
  readonly effect: SkillEffect;
}

function toSupportedHeadSkillDetail(
  hero: HeadHeroDefinition,
  definition: Extract<HeroSkillDefinition, { readonly status: "supported" }>,
): UiHeroSkillDetail {
  const schedule = definition.skill.effects
    .map((effect) => summarizeEffectSchedule(definition.skill, effect))
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join("；");
  const metadata = [
    definition.skill.critMultiplier === undefined
      ? ""
      : `暴击倍率 ×${definition.skill.critMultiplier}，仅作用普通攻击`,
    definition.skill.normalAttackCounter === undefined
      ? ""
      : `${definition.skill.normalAttackCounter.troopType === "allIndependent" ? "各兵种" : TROOP_LABELS[definition.skill.normalAttackCounter.troopType]}普通攻击独立计数`,
  ].filter(Boolean).join("；");
  return {
    ownerId: hero.id,
    ownerName: hero.name,
    skillName: cleanSkillName(definition.name),
    status: "applied",
    summary: [summarizeSkill(definition.skill), schedule, metadata].filter(Boolean).join("；"),
    sourceSummary: hero.name,
  };
}

function collectSkillDefinitionEffects(
  hero: BodyHeroDefinition | HeadHeroDefinition,
  definition: HeroSkillDefinition,
  appliedEffects: AppliedEffectForUi[],
  details: UiHeroSkillDetail[],
): void {
  if (definition.status === "pending") {
    details.push(toPendingDetail(hero, definition));
    return;
  }
  if (definition.status === "unsupported") {
    details.push({
      ownerId: hero.id,
      ownerName: hero.name,
      skillName: cleanSkillName(definition.name),
      status: "pending",
      summary: definition.rawDescription,
      sourceSummary: hero.name,
      reason: definition.unsupportedReason,
    });
    return;
  }
  for (const effect of definition.skill.effects) {
    appliedEffects.push({ hero, skill: definition.skill, effect });
  }
}

function mergeAppliedSkillEffects(
  entries: readonly AppliedEffectForUi[],
): readonly UiHeroSkillDetail[] {
  const groups = new Map<string, AppliedEffectForUi[]>();
  for (const entry of entries) {
    const key = appliedEffectSemanticKey(entry);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.values()].map((group) => {
    const first = group[0]!;
    const values = group.map(({ effect }) => effect.valueByEnemyTroop?.shield ?? effect.value);
    const sameValue = values.every((value) => value === values[0]);
    const total = values.reduce((sum, value) => sum + value, 0);
    const sourceSummary = summarizeMergedSources(group, sameValue);
    const schedule = summarizeEffectSchedule(first.skill, first.effect);
    return {
      ownerId: group.map(({ hero }) => hero.id).join("+"),
      ownerName: sourceSummary,
      skillName: effectHeading(first.effect, sameValue ? values[0]! : undefined),
      status: "applied" as const,
      summary: schedule,
      sourceSummary,
      totalSummary: `${effectTotalLabel(first.effect)} ${formatContribution(first.effect, total, true)}`,
    };
  });
}

function appliedEffectSemanticKey(entry: AppliedEffectForUi): string {
  const effect = entry.effect;
  return JSON.stringify({
    type: canonicalUiEffectType(effect.type),
    sourceRole: entry.hero.role,
    targetTroop: effect.targetTroop ?? "all",
    trigger: entry.skill.trigger,
    lifecycle: effect.lifecycle ?? entry.skill.lifecycle ?? null,
    activeRounds: effect.activeRounds ?? null,
    valueByRound: effect.valueByRound ?? null,
    valueByEnemyTroop: effect.valueByEnemyTroop ?? null,
    zoneAggregation: effect.zoneAggregation ?? "additive",
    basis: effect.type === "extraDamage" ? "formalBearCommonDamage" : null,
  });
}

function summarizeMergedSources(
  entries: readonly AppliedEffectForUi[],
  sameValue: boolean,
): string {
  const counts = new Map<string, { name: string; value: number; count: number; effect: SkillEffect }>();
  for (const entry of entries) {
    const value = entry.effect.valueByEnemyTroop?.shield ?? entry.effect.value;
    const key = `${entry.hero.role}\u0000${entry.hero.name}\u0000${value}`;
    const current = counts.get(key);
    counts.set(key, current === undefined
      ? { name: entry.hero.name, value, count: 1, effect: entry.effect }
      : { ...current, count: current.count + 1 });
  }
  return [...counts.values()].map((source) => {
    const count = source.count > 1 ? ` ×${source.count}` : "";
    const value = sameValue ? "" : ` ${formatContribution(source.effect, source.value, false)}`;
    return `${source.name}${count}${value}`;
  }).join("、");
}

function summarizeEffectSchedule(skill: Skill, effect: SkillEffect): string {
  const parts: string[] = [];
  const trigger = summarizeTrigger(skill.trigger);
  if (trigger) parts.push(trigger);
  if (effect.activeRounds?.length) {
    parts.push(`第 ${effect.activeRounds.join("、")} 回合生效`);
  }
  if (effect.valueByRound) parts.push("数值按回合变化");
  const lifecycle = effect.lifecycle ?? skill.lifecycle;
  if (lifecycle?.durationRounds !== undefined) {
    parts.push(`持续 ${lifecycle.durationRounds} 回合`);
  }
  if (lifecycle?.refreshMode === "refresh") parts.push("重复触发刷新持续时间");
  if (lifecycle?.refreshMode === "replace") parts.push("重复触发覆盖旧效果");
  if (lifecycle?.refreshMode === "stack") {
    parts.push(`可叠加${lifecycle.maxStacks === undefined ? "" : `，最多 ${lifecycle.maxStacks} 层`}`);
  }
  if (lifecycle?.activationTiming === "nextRound") {
    parts.push("本回合施加，下一回合生效");
  }
  return parts.join("；");
}

function canonicalUiEffectType(type: SkillEffect["type"]): SkillEffect["type"] {
  if (type === "damageIncrease") return "baseDamageIncrease";
  if (type === "normalAttackDamage") return "normalAttackDamageIncrease";
  if (type === "skillDamage") return "skillDamageIncrease";
  return type;
}

function effectHeading(effect: SkillEffect, value?: number): string {
  const target = effect.targetTroop === "shield"
    ? "盾兵"
    : effect.targetTroop === "lancer"
      ? "矛兵"
      : effect.targetTroop === "marksman"
        ? "射手"
        : "全军";
  const label = (() => {
    switch (canonicalUiEffectType(effect.type)) {
      case "attack": return `${target}攻击`;
      case "penetration": return `${target}穿透`;
      case "defenseReduction": return "敌军防御";
      case "baseDamageIncrease": return `${target}伤害`;
      case "normalAttackDamageIncrease": return `${target}普通攻击伤害`;
      case "skillDamageIncrease": return `${target}技能伤害`;
      case "vulnerable": return "目标受到伤害";
      case "troopVsTroopDamage": return "对盾目标伤害";
      case "extraDamage": return `${target}额外伤害`;
      default: return summarizeEffect({ ...effect, value: 0 }).replace(/\s[+-]0%$/, "");
    }
  })();
  return value === undefined ? `${label}提升` : `${label} ${formatContribution(effect, value, false)}`;
}

function effectTotalLabel(effect: SkillEffect): string {
  switch (canonicalUiEffectType(effect.type)) {
    case "attack": return "攻击";
    case "penetration": return "穿透";
    case "defenseReduction": return "减防";
    case "baseDamageIncrease": return "基础增伤";
    case "normalAttackDamageIncrease": return "普攻增伤";
    case "skillDamageIncrease": return "技能增伤";
    case "vulnerable": return "易伤";
    case "troopVsTroopDamage": return "兵种伤害";
    case "extraDamage": return "额外伤害";
    default: return "效果";
  }
}

function formatContribution(effect: SkillEffect, value: number, total: boolean): string {
  const prefix = effect.type === "defenseReduction" && !total ? "-" : "+";
  return `${prefix}${formatPercent(value)}`;
}

function toPendingDetail(
  hero: BodyHeroDefinition | HeadHeroDefinition,
  definition: Extract<HeroSkillDefinition, { readonly status: "pending" }>,
): UiHeroSkillDetail {
  return {
    ownerId: hero.id,
    ownerName: hero.name,
    skillName: cleanSkillName(definition.name),
    status: "pending",
    summary: definition.rawDescription,
    sourceSummary: hero.name,
    reason: definition.pendingReason,
  };
}

function readFiniteNumber(value: string, label: string): number {
  if (!value.trim()) throw new UiInputError(`${label}不能为空。`);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new UiInputError(`${label}必须是有限数字。`);
  return number;
}

function readNonNegativeSafeInteger(value: string, label: string): number {
  const number = readFiniteNumber(value, label);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new UiInputError(`${label}必须是非负整数。`);
  }
  return number;
}

function readPositiveSafeInteger(value: string, label: string): number {
  const number = readFiniteNumber(value, label);
  if (!Number.isSafeInteger(number) || number <= 0 || number > 100) {
    throw new UiInputError(`${label}必须是1～100之间的整数。`);
  }
  return number;
}

function readIntegerInRange(value: string, label: string, minimum: number, maximum: number): number {
  const number = readFiniteNumber(value, label);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new UiInputError(`${label}必须是${minimum}～${maximum}之间的整数。`);
  }
  return number;
}
