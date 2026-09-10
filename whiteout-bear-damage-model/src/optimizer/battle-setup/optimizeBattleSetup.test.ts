import { beforeAll, describe, expect, it } from "vitest";
import { calculateBattleDamage } from "../../app/calculateBattleDamage";
import type { BattleDamageInput } from "../../domain/battleDamage";
import type {
  BattleSetupOptimizationInput,
  BattleSetupOptimizationResult,
} from "../../domain/battleSetupOptimization";
import type { BodyHeroId } from "../../domain/hero";
import { getSupportedBodyHeroes } from "../../game-data/heroes/bodyHeroQueries";
import { UnavailableOptimizerHeroError } from "../body-heroes/errors";
import {
  createBattleSetupOptimizer,
  currentBearBattleTotalDamageScorer,
  optimizeBattleSetup,
} from "./optimizeBattleSetup";

const jiexi = "hero.body.jiexi" as const;
const jiesaier = "hero.body.jiesaier" as const;
const shuyun = "hero.body.shuyun" as const;
const suoniya = "hero.body.suoniya" as const;
const gewen = "hero.body.gewen" as const;

const testInput: BattleSetupOptimizationInput = {
  totalTroopCount: 100_000,
  troopSettings: {
    shield: {
      troopLevelId: "T6",
      stats: { attackPercent: 400, penetrationPercent: 100 },
    },
    lancer: {
      troopLevelId: "T6",
      stats: { attackPercent: 400, penetrationPercent: 100 },
    },
    marksman: {
      troopLevelId: "T6",
      stats: { attackPercent: 400, penetrationPercent: 100 },
    },
  },
};

describe("optimizeBattleSetup", () => {
  let oneHeroDefaultGrid: BattleSetupOptimizationResult;

  beforeAll(() => {
    oneHeroDefaultGrid = optimizeBattleSetup(testInput, {
      candidateHeroIds: [shuyun, suoniya],
    });
  }, 30_000);

  it("默认 0.01% exact比例、四车身、topK=20 均正常生效", () => {
    expect(oneHeroDefaultGrid.ratioStepPercent).toBe(0.01);
    expect(oneHeroDefaultGrid.bodyCount).toBe(4);
    expect(oneHeroDefaultGrid.topK).toBe(20);
    expect(oneHeroDefaultGrid.ratioCandidateCount).toBe(50_015_001);
    expect(oneHeroDefaultGrid.bodyCombinationCount).toBe(1);
    expect(oneHeroDefaultGrid.evaluatedSetupCount).toBeLessThan(50_015_001);
    expect(oneHeroDefaultGrid.results).toHaveLength(20);
  });

  it("每个完整方案均通过现有 calculateBattleDamage 计算", () => {
    const receivedInputs: BattleDamageInput[] = [];
    const optimizer = createBattleSetupOptimizer({
      calculateSingleRoundDamage(input) {
        receivedInputs.push(input);
        return calculateBattleDamage(input);
      },
      scorer: currentBearBattleTotalDamageScorer,
      now: () => 0,
    });
    const result = optimizer(testInput, {
      ratioStepPercent: 50,
      bodyCount: 4,
      topK: 30,
      candidateHeroIds: [jiexi, shuyun],
    });

    expect(result.ratioCandidateCount).toBe(6);
    expect(result.bodyCombinationCount).toBe(5);
    expect(result.evaluatedSetupCount).toBe(30);
    expect(result.skippedCount).toBe(0);
    // 每个比例另计算一次相同比例的无车身基准。
    expect(receivedInputs).toHaveLength(30 + 6);
    expect(
      receivedInputs.filter((input) => input.bodyHeroIds.length === 4),
    ).toHaveLength(30);
  });

  it("每个BodyEffect直接求exact最优比例，不评估完整笛卡尔积", () => {
    const result = optimizeBattleSetup(testInput, {
      ratioStepPercent: 25,
      bodyCount: 3,
      topK: 100,
      candidateHeroIds: [shuyun, suoniya],
    });

    expect(result.evaluatedSetupCount).toBeLessThanOrEqual(
      result.ratioCandidateCount * result.bodyCombinationCount,
    );
    expect(result.skippedCount).toBe(
      result.cartesianCandidateCount - result.evaluatedSetupCount,
    );
  });

  it("完整九类车身只构建一次正式基准，并为每个BodyEffect调用轻量exact比例求解器", () => {
    const result = optimizeBattleSetup(testInput, { bodyCount: 4, topK: 3 });
    expect(result.bodyCombinationCount).toBe(414);
    expect(result.bodyEffectCount).toBe(414);
    expect(result.ratioSolverCallCount).toBeGreaterThanOrEqual(414);
    expect(result.ratioSolverCallCount).toBeLessThanOrEqual(417);
    expect(result.formalSimulationCount).toBe(1);
    expect(result.detailedSimulationCount).toBe(3);
    expect(result.compiledFastPath).toBe(true);
    expect(result.ratioSolverElapsedMs).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it("所有结果兵数严格守恒且车身全部来自 supported 数据", () => {
    const supportedIds = new Set(
      getSupportedBodyHeroes().map((hero) => hero.id),
    );

    for (const result of oneHeroDefaultGrid.results) {
      expect(
        result.troopCounts.shield +
          result.troopCounts.lancer +
          result.troopCounts.marksman,
      ).toBe(testInput.totalTroopCount);
      expect(result.heroes.every((hero) => hero.status === "supported")).toBe(
        true,
      );
      expect(result.heroIds.every((heroId) => supportedIds.has(heroId))).toBe(
        true,
      );
    }
  });

  it("自动联合优化同一技能最多两份", () => {
    expect(
      oneHeroDefaultGrid.results.every((result) =>
        result.heroIds.filter((heroId) => heroId === shuyun).length <= 2 &&
        result.heroIds.filter((heroId) => heroId === suoniya).length <= 2,
      ),
    ).toBe(true);
    expect(oneHeroDefaultGrid.results[0]!.heroIds).toEqual([
      shuyun,
      shuyun,
      suoniya,
      suoniya,
    ] satisfies BodyHeroId[]);
  });

  it("A+B+C+D 与 D+C+B+A 只生成一个无序车身组合", () => {
    const result = optimizeBattleSetup(testInput, {
      ratioStepPercent: 100,
      bodyCount: 4,
      topK: 105,
      candidateHeroIds: [shuyun, suoniya, gewen, "hero.body.hengdelike"],
    });
    const allMarksman = result.results.filter(
      (candidate) => candidate.ratios.marksman === 100,
    );

    expect(result.bodyCombinationCount).toBe(19);
    expect(
      allMarksman.filter(
        (candidate) =>
          candidate.heroIds.join("+") ===
          [shuyun, suoniya, gewen, "hero.body.hengdelike"].join("+"),
      ),
    ).toHaveLength(1);
    expect(
      allMarksman.some(
        (candidate) =>
          candidate.heroIds.join("+") ===
          ["hero.body.hengdelike", gewen, suoniya, shuyun].join("+"),
      ),
    ).toBe(false);
  });

  it("技能相同但英雄不同不会重复扩大联合搜索空间", () => {
    const result = optimizeBattleSetup(testInput, {
      ratioStepPercent: 100,
      bodyCount: 1,
      topK: 6,
      candidateHeroIds: [shuyun, "hero.body.heluonimo"],
    });
    const keys = result.results.map(
      (candidate) =>
        `${candidate.ratios.shield}/${candidate.ratios.lancer}/${candidate.ratios.marksman}:${candidate.heroIds.join("+")}`,
    );

    expect(result.bodyCombinationCount).toBe(1);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(result.results.map((candidate) => candidate.heroIds[0])).size).toBe(1);
  });

  it("结果按十回合 totalDamage 降序且 topK 生效", () => {
    const result = optimizeBattleSetup(testInput, {
      ratioStepPercent: 25,
      bodyCount: 2,
      topK: 7,
      candidateHeroIds: [shuyun, suoniya],
    });

    expect(result.results).toHaveLength(7);
    for (let index = 1; index < result.results.length; index += 1) {
      expect(
        result.results[index - 1]!.totalDamage,
      ).toBeGreaterThanOrEqual(result.results[index]!.totalDamage);
    }
  });

  it("十回合评分和结果均为现有单回合引擎结果的 10 倍", () => {
    const result = optimizeBattleSetup(testInput, {
      ratioStepPercent: 50,
      bodyCount: 1,
      topK: 6,
      candidateHeroIds: [shuyun],
    });

    for (const candidate of result.results) {
      const direct = calculateBattleDamage({
        troops: [
          {
            troopType: "shield",
            troopCount: candidate.troopCounts.shield,
            ...testInput.troopSettings.shield,
          },
          {
            troopType: "lancer",
            troopCount: candidate.troopCounts.lancer,
            ...testInput.troopSettings.lancer,
          },
          {
            troopType: "marksman",
            troopCount: candidate.troopCounts.marksman,
            ...testInput.troopSettings.marksman,
          },
        ],
        bodyHeroIds: [shuyun],
      });

      expect(candidate.singleRoundDamage).toBe(direct.finalDamage);
      expect(candidate.totalDamage).toBeCloseTo(
        candidate.expectedDamageByRound.reduce(
          (sum, round) => sum + round.expectedTotalDamage,
          0,
        ),
        8,
      );
      expect(candidate.score).toBe(candidate.totalDamage);
    }
  });

  it("minimumRatios 和 maximumRatios 能限制联合比例候选", () => {
    const result = optimizeBattleSetup(testInput, {
      ratioStepPercent: 10,
      bodyCount: 1,
      topK: 1_000,
      candidateHeroIds: [shuyun],
      minimumRatios: { shield: 20, lancer: 10 },
      maximumRatios: { shield: 50, marksman: 50 },
    });

    expect(result.ratioCandidateCount).toBeGreaterThan(0);
    expect(result.results).toHaveLength(result.evaluatedSetupCount);
    for (const candidate of result.results) {
      expect(candidate.ratios.shield).toBeGreaterThanOrEqual(20);
      expect(candidate.ratios.shield).toBeLessThanOrEqual(50);
      expect(candidate.ratios.lancer).toBeGreaterThanOrEqual(10);
      expect(candidate.ratios.marksman).toBeLessThanOrEqual(50);
    }
  });

  it("专家、Buff和容量配置作为固定输入传入联合优化", () => {
    const result = optimizeBattleSetup({
      ...testInput,
      preparation: {
        baseMarchCapacity: 100_000,
        expert: { hunterHeartLevel: 0, bearSlayerLevel: 10 },
        town: { attack: "none", penetration: "none", defenseReduction: "none", marchCapacity: "small" },
        pet: { attackLevel: 0, penetrationLevel: 0, defenseReductionLevel: 0, capacityLevel: 10 },
      },
    }, { ratioStepPercent: 100, bodyCount: 0, topK: 1 });
    expect(Object.values(result.results[0]!.troopCounts).reduce((sum, value) => sum + value, 0)).toBe(159_500);
  });

  it("优化器把统一 N 原样交给 calculateBattleDamage 的截断公式", () => {
    const result = optimizeBattleSetup(
      { ...testInput, totalTroopCount: 9_999 },
      {
        ratioStepPercent: 50,
        bodyCount: 0,
        topK: 6,
        candidateHeroIds: [],
      },
    );
    const candidate = result.results.find(
      (item) => item.ratios.shield === 50 && item.ratios.lancer === 50,
    );

    expect(candidate?.troopCounts).toEqual({
      shield: 5_000,
      lancer: 4_999,
      marksman: 0,
    });
    expect(
      candidate?.singleRoundResult.troopDamages.shield?.sourceResults[0]?.branch,
    ).toBe("at-or-above-5000");
    expect(
      candidate?.singleRoundResult.troopDamages.lancer?.sourceResults[0]?.branch,
    ).toBe("at-or-above-5000");
    expect(
      candidate?.singleRoundResult.troopDamages.shield?.sourceResults[0]?.factors.totalCountFactor,
    ).toBe(Math.sqrt(5_000));
    expect(
      candidate?.singleRoundResult.troopDamages.lancer?.sourceResults[0]?.factors.totalCountFactor,
    ).toBe(Math.sqrt(5_000));
  });

  it("pending/unsupported 英雄不能进入联合候选池", () => {
    for (const heroId of ["hero.body.liyala", "hero.body.aisidila"] as const) {
      expect(() =>
        optimizeBattleSetup(testInput, {
          ratioStepPercent: 100,
          candidateHeroIds: [heroId],
        }),
      ).toThrow(UnavailableOptimizerHeroError);
    }
  });

  it("相同输入重复运行得到完全相同的方案与顺序", () => {
    const options = {
      ratioStepPercent: 25,
      bodyCount: 3,
      topK: 20,
      candidateHeroIds: [shuyun, suoniya],
    } as const;
    const first = optimizeBattleSetup(testInput, options);
    const second = optimizeBattleSetup(testInput, options);

    expect(first.results).toEqual(second.results);
    expect(first.evaluatedSetupCount).toBe(second.evaluatedSetupCount);
  });
});
