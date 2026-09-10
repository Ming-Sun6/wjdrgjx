import { describe, expect, it } from "vitest";
import { calculateBattleDamage } from "../app/calculateBattleDamage";
import {
  calculateTenRoundExpectedDamage,
  createTenRoundExpectedDamageCalculator,
} from "../app/calculateTenRoundExpectedDamage";
import type { BattleDamageInput } from "../domain/battleDamage";
import type { BodyOptimizationInput } from "../domain/bodyOptimization";
import type { BodyHeroId } from "../domain/hero";
import type { TroopSkillDefinition } from "../domain/troopSkill";
import { bodyHeroCatalog } from "../game-data/heroes/bodyHeroCatalog";
import { headHeroCatalog } from "../game-data/heroes/headHeroCatalog";
import { getTroopSkillById } from "../game-data/troop-skills/troopSkillQueries";
import { combinationsWithReplacement } from "./combinationsWithReplacement";
import {
  BattleEvaluationCache,
  createBattleEvaluationKey,
} from "./evaluation/BattleEvaluationCache";
import { createBodyHeroOptimizer, optimizeBodyHeroes } from "./body-heroes";
import { optimizeBattleSetup } from "./battle-setup";
import {
  allocateTroopsByRatio,
  generateTroopRatioGrid,
  optimizeTroopRatio,
} from "./troop-ratio";

const shuyun = "hero.body.shuyun" as const;
const suoniya = "hero.body.suoniya" as const;

const fixedTroops: BattleDamageInput["troops"] = [
  {
    troopType: "shield",
    troopLevelId: "T6",
    troopCount: 10_000,
    stats: { attackPercent: 400, penetrationPercent: 100 },
  },
  {
    troopType: "lancer",
    troopLevelId: "T6",
    troopCount: 20_000,
    stats: { attackPercent: 400, penetrationPercent: 100 },
  },
  {
    troopType: "marksman",
    troopLevelId: "T6",
    troopCount: 30_000,
    stats: { attackPercent: 400, penetrationPercent: 100 },
  },
];

const troopSettings = {
  shield: {
    troopLevelId: "T6" as const,
    stats: { attackPercent: 400, penetrationPercent: 100 },
  },
  lancer: {
    troopLevelId: "T6" as const,
    stats: { attackPercent: 400, penetrationPercent: 100 },
  },
  marksman: {
    troopLevelId: "T6" as const,
    stats: { attackPercent: 400, penetrationPercent: 100 },
  },
};

function periodicAttackSkill(): TroopSkillDefinition {
  const trigger = {
    type: "everyNRounds" as const,
    interval: 1,
    firstTriggerRound: 1,
    triggerPhase: "roundStart" as const,
  };
  const lifecycle = {
    refreshMode: "stack" as const,
    maxStacks: 10,
    activationTiming: "immediate" as const,
    atMaxStacks: "keep" as const,
  };
  return {
    id: "troop-skill.synthetic.periodic-attack",
    name: "合成周期攻击叠层",
    troopType: "marksman",
    level: 1,
    status: "supported",
    trigger,
    effects: [
      {
        id: "effect.synthetic.periodic-attack",
        status: "supported",
        type: "attack",
        value: 0.5,
        valuePerStack: 0.5,
        targetTroop: "all",
        trigger,
        lifecycle,
        rawDescription: "测试：每回合开始攻击叠加50%。",
      },
    ],
    rawDescription: "测试专用周期技能。",
    notes: ["测试专用；不代表真实游戏机制。"],
    source: "synthetic-test",
  };
}

describe("第二十二步统一十回合期望评分", () => {
  it("三个优化器默认均使用expectedTenRoundTotalDamage", () => {
    const body = optimizeBodyHeroes(
      { troops: fixedTroops },
      { bodyCount: 1, topK: 1, candidateHeroIds: [shuyun] },
    );
    const ratio = optimizeTroopRatio(
      { totalTroopCount: 60_000, troopSettings, bodyHeroIds: [shuyun] },
      { stepPercent: 100, topK: 1 },
    );
    const joint = optimizeBattleSetup(
      { totalTroopCount: 60_000, troopSettings },
      { ratioStepPercent: 100, bodyCount: 1, topK: 1, candidateHeroIds: [shuyun] },
    );

    for (const result of [body, ratio, joint]) {
      expect(result.scoringMode).toBe("tenRoundExpected");
      expect(result.scoreMetric).toBe("expectedTenRoundTotalDamage");
      expect(result.results[0]?.expectedTenRoundDamage).toBeTypeOf("number");
      expect(result.results[0]?.expectedDamageByRound).toHaveLength(10);
    }
  });

  it("纯静态技能下legacy与tenRoundExpected排名一致且期望值为单回合10倍", () => {
    const input: BodyOptimizationInput = { troops: fixedTroops };
    const options = {
      bodyCount: 2,
      topK: 6,
      candidateHeroIds: [shuyun, suoniya],
    } as const;
    const legacy = optimizeBodyHeroes(input, { ...options, scoringMode: "legacy" });
    const expected = optimizeBodyHeroes(input, {
      ...options,
      scoringMode: "tenRoundExpected",
    });

    expect(expected.results.map((entry) => entry.heroIds)).toEqual(
      legacy.results.map((entry) => entry.heroIds),
    );
    for (const candidate of expected.results) {
      expect(candidate.expectedTenRoundDamage).toBeCloseTo(
        candidate.expectedDamageByRound[0]!.expectedTotalDamage * 10,
        8,
      );
    }
  });

  it("周期技能可令十回合排名与legacy不同，证明默认评分不是单回合代理", () => {
    const periodic = periodicAttackSkill();
    const expectedCalculator = createTenRoundExpectedDamageCalculator({
      heroCatalog: bodyHeroCatalog,
      headHeroCatalog,
      getTroopSkillById: (skillId) =>
        skillId === periodic.id ? periodic : getTroopSkillById(skillId),
    });
    const optimizer = createBodyHeroOptimizer({
      calculateTenRoundExpectedDamage: expectedCalculator,
    });
    const input: BodyOptimizationInput = {
      troops: fixedTroops,
      fireCrystal: { skillIds: [periodic.id] },
    };
    const legacy = optimizer(input, {
      bodyCount: 1,
      topK: 2,
      candidateHeroIds: [shuyun, suoniya],
      scoringMode: "legacy",
    });
    const expected = optimizer(input, {
      bodyCount: 1,
      topK: 2,
      candidateHeroIds: [shuyun, suoniya],
    });

    expect(legacy.results[0]?.heroIds).toEqual([shuyun]);
    expect(expected.results[0]?.heroIds).toEqual([suoniya]);
    expect(expected.stats.probabilityStateCount).toBeGreaterThan(0);
  });

  it("比例优化top1严格等于对全部网格点直接调用十回合引擎的最大值", () => {
    const input = {
      totalTroopCount: 20_000,
      troopSettings,
      bodyHeroIds: [shuyun],
    } as const;
    const result = optimizeTroopRatio(input, { stepPercent: 50, topK: 6 });
    const direct = generateTroopRatioGrid(50).map((ratios) => {
      const counts = allocateTroopsByRatio(input.totalTroopCount, ratios);
      const expected = calculateTenRoundExpectedDamage({
        troops: (["shield", "lancer", "marksman"] as const).map((troopType) => ({
          troopType,
          troopCount: counts[troopType],
          ...troopSettings[troopType],
        })),
        bodyHeroIds: [shuyun],
      });
      return { ratios, score: expected.expectedTotalDamage };
    }).sort(compareRatioScore);

    expect(result.results[0]?.ratios).toEqual(direct[0]?.ratios);
    expect(result.results[0]?.score).toBeCloseTo(direct[0]!.score, 10);
  });

  it("联合优化top1严格等于小规模ratio×body手工全量穷举", () => {
    const input = { totalTroopCount: 20_000, troopSettings } as const;
    const result = optimizeBattleSetup(input, {
      ratioStepPercent: 50,
      bodyCount: 1,
      topK: 12,
      candidateHeroIds: [shuyun, suoniya],
    });
    const direct = generateTroopRatioGrid(50).flatMap((ratios) => {
      const counts = allocateTroopsByRatio(input.totalTroopCount, ratios);
      return combinationsWithReplacement([shuyun, suoniya], 1).map((heroIds) => ({
        ratios,
        heroIds,
        score: calculateTenRoundExpectedDamage({
          troops: (["shield", "lancer", "marksman"] as const).map((troopType) => ({
            troopType,
            troopCount: counts[troopType],
            ...troopSettings[troopType],
          })),
          bodyHeroIds: heroIds,
        }).expectedTotalDamage,
      }));
    }).sort(compareJointScore);

    expect(result.cartesianCandidateCount).toBe(12);
    expect(result.evaluatedSetupCount).toBe(12);
    expect(result.results[0]?.ratios).toEqual(direct[0]?.ratios);
    expect(result.results[0]?.heroIds).toEqual(direct[0]?.heroIds);
    expect(result.results[0]?.score).toBeCloseTo(direct[0]!.score, 10);
  });

  it("固定格温车头和fireCrystal进入评分，已补全技能不再被跳过", () => {
    const result = optimizeBodyHeroes(
      {
        troops: fixedTroops,
        headFormation: { marksmanHeroId: "hero.head.gewen" },
        fireCrystal: { skillIds: ["troop-skill.marksman.remote-strike"] },
      },
      { bodyCount: 0, topK: 1, candidateHeroIds: [] },
    );
    const skipped = result.results[0]!.skippedPendingSkills;

    expect(skipped.some((entry) => entry.source === "head")).toBe(false);
    expect(skipped.some((entry) => entry.source === "fireCrystal")).toBe(false);
    expect(result.stats.cacheHits).toBe(1);
    expect(result.stats.cacheMisses).toBe(1);
  });

  it("缓存key规范化无序body组合但保留完整战斗输入", () => {
    const left = {
      troops: fixedTroops,
      bodyHeroIds: [shuyun, suoniya],
    };
    const right = {
      troops: fixedTroops,
      bodyHeroIds: [suoniya, shuyun],
    };
    const leftKey = createBattleEvaluationKey(
      left,
      "tenRoundExpected",
      "expectedTenRoundTotalDamage",
      undefined,
    );
    const rightKey = createBattleEvaluationKey(
      right,
      "tenRoundExpected",
      "expectedTenRoundTotalDamage",
      undefined,
    );
    const cache = new BattleEvaluationCache<number>(2);

    expect(leftKey).toBe(rightKey);
    expect(cache.getOrCompute(leftKey, () => 1)).toEqual({ value: 1, hit: false });
    expect(cache.getOrCompute(rightKey, () => 2)).toEqual({ value: 1, hit: true });
    expect(cache.statistics()).toMatchObject({ cacheHits: 1, cacheMisses: 1 });
  });

  it("零伤害基准不会产生Infinity或NaN", () => {
    const result = optimizeBodyHeroes(
      {
        troops: fixedTroops.map((troop) => ({ ...troop, troopCount: 0 })),
      },
      { bodyCount: 0, topK: 1, candidateHeroIds: [] },
    );
    expect(result.results[0]?.improvementAbsolute).toBe(0);
    expect(result.results[0]?.improvementRatio).toBeNull();
    expect(result.results[0]?.improvementOverNoBody).toBeNull();
  });

  it("N 截断公式与defenseReduction=1+sum(r)在期望评分中保持不变", () => {
    const ratio = optimizeTroopRatio(
      { totalTroopCount: 9_999, troopSettings, bodyHeroIds: [] },
      { stepPercent: 50, topK: 6 },
    );
    const split = ratio.results.find(
      (candidate) => candidate.ratios.shield === 50 && candidate.ratios.lancer === 50,
    )!;
    expect(split.troopCounts).toEqual({ shield: 5_000, lancer: 4_999, marksman: 0 });
    expect(split.battleResult.troopDamages.shield?.sourceResults[0]?.branch).toBe("at-or-above-5000");
    expect(split.battleResult.troopDamages.lancer?.sourceResults[0]?.branch).toBe("at-or-above-5000");
    expect(split.battleResult.troopDamages.shield?.sourceResults[0]?.factors.totalCountFactor).toBe(Math.sqrt(5_000));
    expect(split.battleResult.troopDamages.lancer?.sourceResults[0]?.factors.totalCountFactor).toBe(Math.sqrt(5_000));

    const one = optimizeBodyHeroes(
      { troops: fixedTroops },
      { bodyCount: 1, topK: 1, candidateHeroIds: ["hero.body.hengdelike"] },
    );
    const two = optimizeBodyHeroes(
      { troops: fixedTroops },
      { bodyCount: 2, topK: 1, candidateHeroIds: ["hero.body.hengdelike"] },
    );
    expect(
      one.results[0]?.expectedDamageByRound[0]?.expectedMultipliersByTroop.shield
        ?.byEffectType.defenseReduction,
    ).toBe(1.25);
    expect(
      two.results[0]?.expectedDamageByRound[0]?.expectedMultipliersByTroop.shield
        ?.byEffectType.defenseReduction,
    ).toBe(1.5);
  });
});

function compareRatioScore(
  left: { readonly ratios: { readonly shield: number; readonly lancer: number; readonly marksman: number }; readonly score: number },
  right: { readonly ratios: { readonly shield: number; readonly lancer: number; readonly marksman: number }; readonly score: number },
): number {
  return (
    right.score - left.score ||
    right.ratios.marksman - left.ratios.marksman ||
    right.ratios.lancer - left.ratios.lancer ||
    right.ratios.shield - left.ratios.shield
  );
}

function compareJointScore(
  left: { readonly ratios: { readonly shield: number; readonly lancer: number; readonly marksman: number }; readonly heroIds: readonly BodyHeroId[]; readonly score: number },
  right: { readonly ratios: { readonly shield: number; readonly lancer: number; readonly marksman: number }; readonly heroIds: readonly BodyHeroId[]; readonly score: number },
): number {
  return (
    compareRatioScore(left, right) ||
    left.heroIds.join("|").localeCompare(right.heroIds.join("|"))
  );
}
