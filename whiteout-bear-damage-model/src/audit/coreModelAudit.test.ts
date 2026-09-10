import { describe, expect, it } from "vitest";
import { calculateTenRoundExpectedDamage } from "../app/calculateTenRoundExpectedDamage";
import type { BattleDamageInput } from "../domain/battleDamage";
import type { TenRoundExpectedDamageInput } from "../domain/tenRoundExpectedDamage";
import type { UnsupportedTroopSkillDefinition } from "../domain/troopSkill";
import { collectSkillCatalog } from "../data-audit/collectSkillCatalog";
import { generatePendingSkillBlockerReport } from "../data-audit/generatePendingBlockerReport";
import { generateSkillSupportReport } from "../data-audit/generateSkillSupportReport";
import { battleStateKey } from "../engine/probability/battleStateKey";
import { probabilityMass } from "../engine/probability/probabilityMath";
import { createActiveEffect } from "../engine/rounds/activeEffects";
import { createBattleState } from "../engine/rounds/battleState";
import { resolveSupportedCatalogEffects } from "../engine/skills/resolveSupportedCatalogEffects";
import { troopDamageCoefficients } from "../game-data/troops/troopDamageCoefficients";
import { troopLevels } from "../game-data/troops/troopLevels";
import { optimizeBattleSetup } from "../optimizer/battle-setup";
import { optimizeBodyHeroes } from "../optimizer/body-heroes";
import {
  createBattleEvaluationKey,
  createOptimizerBattleEvaluator,
} from "../optimizer/evaluation";
import { optimizeFullBattleSetup } from "../optimizer/full-setup";
import {
  allocateTroopsByRatio,
  generateTroopRatioGrid,
  optimizeTroopRatio,
} from "../optimizer/troop-ratio";
import {
  calculateBaseTotalDamage,
  calculateBaseTroopDamage,
  percentageToDecimal,
  percentageToMultiplier,
} from "../rulesets/bear/base-damage";
import { BASE_DAMAGE_K } from "../rulesets/bear/base-damage/constants";
import { createBearBattleContext } from "../rulesets/bear/battle/calculateBearBattleTotalDamage";
import {
  CORE_MODEL_AUDIT_CHECK_COUNT,
  CORE_MODEL_AUDIT_CHECKS,
} from "./coreAuditManifest";

const troopSettings = {
  shield: {
    troopLevelId: "T10" as const,
    stats: { attackPercent: 400, penetrationPercent: 100 },
  },
  lancer: {
    troopLevelId: "T10" as const,
    stats: { attackPercent: 400, penetrationPercent: 100 },
  },
  marksman: {
    troopLevelId: "T10" as const,
    stats: { attackPercent: 400, penetrationPercent: 100 },
  },
};

const fixedTroops: BattleDamageInput["troops"] = [
  { troopType: "shield", troopCount: 10_000, ...troopSettings.shield },
  { troopType: "lancer", troopCount: 20_000, ...troopSettings.lancer },
  { troopType: "marksman", troopCount: 30_000, ...troopSettings.marksman },
];

const evaluatorOptions = {
  scoringMode: "tenRoundExpected" as const,
  legacyMetricId: "stage-24-audit",
  legacyScore: (singleRound: { readonly finalDamage: number }) =>
    singleRound.finalDamage,
};

describe("Stage 24 stable core audit", () => {
  it("审计清单包含43个唯一核心不变量", () => {
    expect(CORE_MODEL_AUDIT_CHECK_COUNT).toBe(43);
    expect(new Set(CORE_MODEL_AUDIT_CHECKS.map((check) => check.id)).size).toBe(43);
    expect(CORE_MODEL_AUDIT_CHECKS.every((check) => check.evidence.length > 0)).toBe(true);
  });

  it("基础公式按 N 使用 sqrt(min(N,5000))，sqrt(n) 不截断", () => {
    const calculate = (totalTroopCount: number, troopCount: number) => calculateBaseTroopDamage({
      totalTroopCount,
      troopCount,
      troopType: "shield",
      troopLevelId: "T10",
      stats: { attackPercent: 0, penetrationPercent: 0 },
    });
    const smallTotal = calculate(3_000, 3_000);
    const cappedSmallTroop = calculate(100_000, 4_999);
    const cappedLargeTroop = calculate(100_000, 20_000);
    const formula = (N: number, n: number) =>
      BASE_DAMAGE_K * Math.sqrt(Math.min(N, 5_000)) * Math.sqrt(n) * 7.4947;

    expect(BASE_DAMAGE_K).toBe(0.0075577);
    expect(smallTotal.branch).toBe("below-5000");
    expect(cappedSmallTroop.branch).toBe("at-or-above-5000");
    expect(cappedLargeTroop.branch).toBe("at-or-above-5000");
    expect(smallTotal.damage).toBeCloseTo(formula(3_000, 3_000), 12);
    expect(cappedSmallTroop.damage).toBeCloseTo(formula(100_000, 4_999), 12);
    expect(cappedLargeTroop.damage).toBeCloseTo(formula(100_000, 20_000), 12);
    expect(cappedLargeTroop.damage / cappedSmallTroop.damage).toBeCloseTo(
      Math.sqrt(20_000 / 4_999),
      12,
    );
    expect(calculateBaseTroopDamage.toString()).not.toMatch(/Math\.sqrt\([^)]*\/\s*2/);
  });

  it("系数、等级目录、百分比与统一N保持数据驱动且不取整", () => {
    expect(troopDamageCoefficients).toEqual({ shield: 1, lancer: 3, marksman: 4 });
    for (const level of Object.values(troopLevels)) {
      if (level.status === "known") {
        expect(Number.isFinite(level.constant)).toBe(true);
        expect(level.constant).toBeGreaterThan(0);
      } else {
        expect(level.constant).toBeNull();
      }
    }
    for (const [percent, decimal, multiplier] of [
      [0, 0, 1],
      [100, 1, 2],
      [444.35, 4.4435, 5.4435],
    ] as const) {
      expect(percentageToDecimal(percent)).toBeCloseTo(decimal, 12);
      expect(percentageToMultiplier(percent)).toBeCloseTo(multiplier, 12);
    }

    const result = calculateBaseTotalDamage({
      troops: [
        { troopType: "shield", troopLevelId: "T10", troopCount: 4_999, stats: { attackPercent: 12.34, penetrationPercent: 56.78 } },
        { troopType: "lancer", troopLevelId: "T11", troopCount: 5_000, stats: { attackPercent: 23.45, penetrationPercent: 67.89 } },
        { troopType: "marksman", troopLevelId: "T12-FC6", troopCount: 5_001, stats: { attackPercent: 34.56, penetrationPercent: 78.91 } },
      ],
    });
    expect(result.totalTroopCount).toBe(15_000);
    expect(result.troopResults.map((troop) => troop.totalTroopCount)).toEqual([
      15_000, 15_000, 15_000,
    ]);
    expect(result.totalDamage).toBe(
      result.troopResults.reduce((sum, troop) => sum + troop.damage, 0),
    );
    expect(Number.isInteger(result.totalDamage)).toBe(false);
  });

  it("正式熊环境固定10回合、全盾、无限血，且无技能概率质量逐回合守恒", () => {
    const result = calculateTenRoundExpectedDamage({
      troops: fixedTroops,
      bodyHeroIds: [],
    });
    expect(result.context).toMatchObject({
      totalRounds: 10,
      enemyTroopType: "shield",
      enemyInfiniteHp: true,
      enemyBaseDefense: null,
    });
    expect(result.expectedDamageByRound).toHaveLength(10);
    expect(result.expectedTotalDamage).toBeCloseTo(
      result.expectedDamageByRound[0]!.expectedTotalDamage * 10,
      9,
    );
    expect(
      result.expectedDamageByRound.every(
        (round) => Math.abs(round.probabilityMass - 1) < 1e-12,
      ),
    ).toBe(true);
    expect(Math.abs(probabilityMass(result.finalStates) - 1)).toBeLessThan(1e-12);
  });

  it("canonical state key区分所有当前可持久化的未来相关状态", () => {
    const active = createActiveEffect({
      id: "audit-effect",
      sourceSkillId: "skill.audit",
      identity: {
        sourceId: "source.audit",
        sourceSkillId: "skill.audit",
        effectId: "effect.audit",
      },
      effect: { type: "damageIncrease", value: 0.1 },
      durationRounds: 3,
      remainingRounds: 2,
      maxStacks: 3,
      maxApplications: 5,
      stackCount: 1,
      applicationCount: 1,
    });
    const base = createBattleState(createBearBattleContext(), [active]);
    const keys = [
      battleStateKey(base),
      battleStateKey({ ...base, currentRound: 2 }),
      battleStateKey({ ...base, activeEffects: [{ ...active, remainingRounds: 1 }] }),
      battleStateKey({ ...base, activeEffects: [{ ...active, stackCount: 2 }] }),
      battleStateKey({ ...base, activeEffects: [{ ...active, applicationCount: 2 }] }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("格温全部真实技能计分且无pending，unsupported保持独立跳过状态", () => {
    const baseline = calculateTenRoundExpectedDamage({
      troops: fixedTroops,
      bodyHeroIds: [],
    });
    const withGwen = calculateTenRoundExpectedDamage({
      troops: fixedTroops,
      bodyHeroIds: [],
      headFormation: { marksmanHeroId: "hero.head.gewen" },
      fireCrystal: { skillIds: ["troop-skill.marksman.remote-strike"] },
    });
    expect(withGwen.expectedTotalDamage).toBeGreaterThan(baseline.expectedTotalDamage);
    expect(withGwen.skippedPendingSkills.some((skill) => skill.source === "head")).toBe(false);
    expect(withGwen.skippedPendingSkills.some((skill) => skill.source === "fireCrystal")).toBe(false);

    const unsupported: UnsupportedTroopSkillDefinition = {
      id: "troop-skill.synthetic.unsupported-audit",
      name: "审计用unsupported效果",
      troopType: "marksman",
      level: 1,
      status: "unsupported",
      unsupportedReason: "审计用：当前不支持。",
      trigger: { type: "always" },
      effects: [{
        id: "effect.synthetic.unsupported-audit",
        status: "unsupported",
        unsupportedReason: "审计用：当前不支持。",
        type: "damageIncrease",
        value: 100,
        targetTroop: "all",
        trigger: { type: "always" },
        rawDescription: "审计用unsupported效果。",
      }],
      rawDescription: "审计用unsupported效果。",
      notes: ["synthetic audit"],
      source: "synthetic-audit",
    };
    const resolution = resolveSupportedCatalogEffects(unsupported);
    expect(resolution.skills).toEqual([]);
    expect(resolution.skippedEffects).toEqual([
      expect.objectContaining({ status: "unsupported" }),
    ]);
  });

  it("真实技能统计稳定且剩余阻塞严格区分RULE_UNKNOWN与DATA_SOURCE_UNCERTAIN", () => {
    const support = generateSkillSupportReport();
    const blockers = generatePendingSkillBlockerReport();
    expect(collectSkillCatalog()).toHaveLength(82);
    expect(support.totals.skills).toEqual({ supported: 78, pending: 4, unsupported: 0 });
    expect(support.totals.effects).toEqual({ supported: 82, pending: 0, unsupported: 0 });
    expect(blockers.engineCapability).toHaveLength(0);
    expect(blockers.gameRuleInformation).toHaveLength(0);
    expect(blockers.dataSourceUncertain).toHaveLength(4);
  });

  it("四个优化器在小搜索空间的top1等于直接全量评分", () => {
    const heroIds = ["hero.body.shuyun", "hero.body.suoniya"] as const;
    const body = optimizeBodyHeroes(
      { troops: fixedTroops },
      { bodyCount: 1, candidateHeroIds: heroIds, topK: 2 },
    );
    const directBody = heroIds.map((heroId) => ({
      heroId,
      score: calculateTenRoundExpectedDamage({ troops: fixedTroops, bodyHeroIds: [heroId] }).expectedTotalDamage,
    })).sort((left, right) => right.score - left.score || left.heroId.localeCompare(right.heroId));
    expect(body.results[0]?.heroIds).toEqual([directBody[0]!.heroId]);
    expect(body.results[0]?.score).toBe(directBody[0]!.score);

    const ratioInput = { totalTroopCount: 20_000, troopSettings, bodyHeroIds: [] } as const;
    const ratio = optimizeTroopRatio(ratioInput, { stepPercent: 100, topK: 3 });
    const directRatios = generateTroopRatioGrid(100).map((ratios) => ({
      ratios,
      score: scoreSetup(20_000, ratios, []),
    })).sort(compareSetup);
    expect(ratio.results[0]?.ratios).toEqual(directRatios[0]!.ratios);
    expect(ratio.results[0]?.score).toBe(directRatios[0]!.score);

    const joint = optimizeBattleSetup(
      { totalTroopCount: 20_000, troopSettings },
      { ratioStepPercent: 100, bodyCount: 1, candidateHeroIds: heroIds, topK: 6 },
    );
    const directJoint = generateTroopRatioGrid(100).flatMap((ratios) =>
      heroIds.map((heroId) => ({ ratios, heroIds: [heroId] as const, score: scoreSetup(20_000, ratios, [heroId]) })),
    ).sort(compareSetup);
    expect(joint.results[0]).toMatchObject({
      ratios: directJoint[0]!.ratios,
      heroIds: directJoint[0]!.heroIds,
      score: directJoint[0]!.score,
    });

    const allowedRatios = [
      { shield: 100, lancer: 0, marksman: 0 },
      { shield: 0, lancer: 0, marksman: 100 },
    ] as const;
    const full = optimizeFullBattleSetup(
      { totalTroopCount: 20_000, troopSettings },
      {
        ratio: { mode: "optimize", allowedRatios },
        body: { mode: "optimize", bodyCount: 1, candidateHeroIds: heroIds },
        head: {},
        fireCrystal: { mode: "fixed" },
        topK: 4,
      },
    );
    const directFull = allowedRatios.flatMap((ratios) =>
      heroIds.map((heroId) => ({ ratios, heroIds: [heroId] as const, score: scoreSetup(20_000, ratios, [heroId]) })),
    ).sort(compareSetup);
    expect(full.results[0]).toMatchObject({
      ratios: directFull[0]!.ratios,
      bodyHeroIds: directFull[0]!.heroIds,
      score: directFull[0]!.score,
    });
  });

  it("同一输入重复运行的topK身份与数值完全一致", () => {
    const run = () => optimizeFullBattleSetup(
      { totalTroopCount: 20_000, troopSettings },
      {
        ratio: { mode: "optimize", stepPercent: 50 },
        body: { mode: "optimize", bodyCount: 1, candidateHeroIds: ["hero.body.shuyun", "hero.body.heluonimo"] },
        head: {},
        fireCrystal: { mode: "fixed" },
        topK: 8,
      },
    ).results;
    expect(run()).toEqual(run());
  });

  it("largest remainder在不可整除总兵数下严格守恒", () => {
    const counts = allocateTroopsByRatio(100_003, {
      shield: 33,
      lancer: 33,
      marksman: 34,
    });
    expect(counts).toEqual({ shield: 33_001, lancer: 33_001, marksman: 34_001 });
    expect(counts.shield + counts.lancer + counts.marksman).toBe(100_003);
    expect(Object.values(counts).every(Number.isSafeInteger)).toBe(true);
  });

  it("共享evaluation cache与逐次新建评价器得到完全相同的分数", () => {
    const candidates: TenRoundExpectedDamageInput[] = [
      { troops: fixedTroops, bodyHeroIds: ["hero.body.jiexi"] },
      { troops: fixedTroops, bodyHeroIds: ["hero.body.suoniya"] },
    ];
    const cachedEvaluator = createOptimizerBattleEvaluator();
    const cachedScores = candidates.map((candidate) => cachedEvaluator.evaluate(candidate, evaluatorOptions).score);
    const secondPass = candidates.map((candidate) => cachedEvaluator.evaluate(candidate, evaluatorOptions).score);
    const uncachedScores = candidates.map((candidate) =>
      createOptimizerBattleEvaluator().evaluate(candidate, evaluatorOptions).score,
    );
    expect(secondPass).toEqual(cachedScores);
    expect(uncachedScores).toEqual(cachedScores);
    expect(cachedEvaluator.cache.statistics()).toMatchObject({ cacheHits: 2, cacheMisses: 2 });
  });

  it("evaluation key区分兵数、车头和火晶，避免关键输入碰撞", () => {
    const base: TenRoundExpectedDamageInput = { troops: fixedTroops, bodyHeroIds: [] };
    const countChanged: TenRoundExpectedDamageInput = {
      ...base,
      troops: fixedTroops.map((troop, index) => index === 2
        ? { ...troop, troopCount: troop.troopCount + 1 }
        : troop),
    };
    const headChanged: TenRoundExpectedDamageInput = {
      ...base,
      headFormation: { shieldHeroId: "hero.head.heketuo" },
    };
    const fireChanged: TenRoundExpectedDamageInput = {
      ...base,
      fireCrystal: { skillIds: ["troop-skill.marksman.remote-strike"] },
    };
    const keys = [base, countChanged, headChanged, fireChanged].map((candidate) =>
      createBattleEvaluationKey(candidate, "tenRoundExpected", "audit", undefined),
    );
    expect(new Set(keys).size).toBe(4);
  });

  it("小/常规/高量级合法输入均为有限数，非法非有限输入与兵数冲突明确拒绝", () => {
    const results = [
      calculateBaseTroopDamage({ totalTroopCount: 1, troopCount: 1, troopType: "shield", troopLevelId: "T1", stats: { attackPercent: -99, penetrationPercent: -99 } }),
      calculateBaseTroopDamage({ totalTroopCount: 100_000, troopCount: 33_333, troopType: "lancer", troopLevelId: "T10", stats: { attackPercent: 444.35, penetrationPercent: 123.45 } }),
      calculateBaseTroopDamage({ totalTroopCount: 1_000_000_000_000, troopCount: 900_000_000_000, troopType: "marksman", troopLevelId: "T12-FC10", stats: { attackPercent: 1_000_000, penetrationPercent: 1_000_000 } }),
    ];
    expect(results.every((result) => Number.isFinite(result.damage))).toBe(true);
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => calculateBaseTroopDamage({
        totalTroopCount: 10_000,
        troopCount: 5_000,
        troopType: "shield",
        troopLevelId: "T10",
        stats: { attackPercent: invalid, penetrationPercent: 0 },
      })).toThrow();
    }
    expect(() => calculateBaseTroopDamage({
      totalTroopCount: 4_999,
      troopCount: 5_000,
      troopType: "shield",
      troopLevelId: "T10",
      stats: { attackPercent: 0, penetrationPercent: 0 },
    })).toThrow();
  });
});

function scoreSetup(
  totalTroopCount: number,
  ratios: { readonly shield: number; readonly lancer: number; readonly marksman: number },
  bodyHeroIds: TenRoundExpectedDamageInput["bodyHeroIds"],
): number {
  const counts = allocateTroopsByRatio(totalTroopCount, ratios);
  return calculateTenRoundExpectedDamage({
    troops: (["shield", "lancer", "marksman"] as const).map((troopType) => ({
      troopType,
      troopCount: counts[troopType],
      ...troopSettings[troopType],
    })),
    bodyHeroIds,
  }).expectedTotalDamage;
}

function compareSetup(
  left: { readonly ratios: { readonly shield: number; readonly lancer: number; readonly marksman: number }; readonly score: number; readonly heroIds?: readonly string[] },
  right: { readonly ratios: { readonly shield: number; readonly lancer: number; readonly marksman: number }; readonly score: number; readonly heroIds?: readonly string[] },
): number {
  return (
    right.score - left.score ||
    right.ratios.marksman - left.ratios.marksman ||
    right.ratios.lancer - left.ratios.lancer ||
    right.ratios.shield - left.ratios.shield ||
    (left.heroIds?.join("|") ?? "").localeCompare(right.heroIds?.join("|") ?? "")
  );
}
