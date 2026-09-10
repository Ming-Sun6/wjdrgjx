import { beforeAll, describe, expect, it } from "vitest";
import { calculateBattleDamage } from "../../app/calculateBattleDamage";
import type { BattleDamageInput } from "../../domain/battleDamage";
import type { BodyHeroId } from "../../domain/hero";
import type {
  TroopRatioOptimizationInput,
  TroopRatioOptimizationResult,
} from "../../domain/troopRatioOptimization";
import { UnsupportedBodyHeroError } from "../../engine/battle/errors";
import { allocateTroopsByRatio, TROOP_RATIO_SUM_EPSILON } from "./allocateTroopsByRatio";
import { generateTroopRatioGrid } from "./generateTroopRatioGrid";
import {
  createTroopRatioOptimizer,
  optimizeTroopRatio,
} from "./optimizeTroopRatio";

const fixedBodyHeroes = [
  "hero.body.jiexi",
  "hero.body.shuyun",
  "hero.body.hengdelike",
  "hero.body.suoniya",
] as const satisfies readonly BodyHeroId[];

const testInput: TroopRatioOptimizationInput = {
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
  bodyHeroIds: fixedBodyHeroes,
};

describe("generateTroopRatioGrid", () => {
  it("stepPercent=1 时生成 5151 个比例点且每组比例和为 100%", () => {
    const grid = generateTroopRatioGrid(1);

    expect(grid).toHaveLength(5_151);
    for (const ratios of grid) {
      expect(ratios.shield + ratios.lancer + ratios.marksman).toBe(100);
    }
  });

  it("使用整数格点支持小数步长，不产生浮点累加比例", () => {
    const grid = generateTroopRatioGrid(0.5);

    expect(grid).toHaveLength((201 * 202) / 2);
    expect(grid).toContainEqual({ shield: 0.5, lancer: 0.5, marksman: 99 });
    expect(
      grid.every(
        (ratios) =>
          ratios.shield + ratios.lancer + ratios.marksman === 100,
      ),
    ).toBe(true);
  });
});

describe("allocateTroopsByRatio", () => {
  it("所有兵数均为非负整数且总兵数严格守恒", () => {
    const grid = generateTroopRatioGrid(1);

    for (const totalTroopCount of [0, 1, 2, 9_999, 100_003]) {
      for (const ratios of grid) {
        const counts = allocateTroopsByRatio(totalTroopCount, ratios);
        const values = [counts.shield, counts.lancer, counts.marksman];

        expect(values.every(Number.isSafeInteger)).toBe(true);
        expect(values.every((value) => value >= 0)).toBe(true);
        expect(values.reduce((sum, value) => sum + value, 0)).toBe(
          totalTroopCount,
        );
      }
    }
  });

  it("按最大余数法稳定分配，余数相同时使用固定兵种顺序", () => {
    expect(
      allocateTroopsByRatio(9_999, {
        shield: 50,
        lancer: 50,
        marksman: 0,
      }),
    ).toEqual({ shield: 5_000, lancer: 4_999, marksman: 0 });
  });

  it("容忍0.01%显示精度内的浮点噪声并继续严格守恒", () => {
    const counts = allocateTroopsByRatio(100_003, {
      shield: 0,
      lancer: 7.000000000000001,
      marksman: 93,
    });
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(100_003);
    expect(TROOP_RATIO_SUM_EPSILON).toBe(.005);
    expect(() => allocateTroopsByRatio(100, { shield: 0, lancer: 7, marksman: 92.98 }))
      .toThrow("盾/矛/射比例之和必须为 100.00%，当前为 99.98%。");
  });
});

describe("optimizeTroopRatio", () => {
  let defaultResult: TroopRatioOptimizationResult;

  beforeAll(() => {
    defaultResult = optimizeTroopRatio(testInput);
  });

  it("默认以0.01% exact搜索约5000万理论网格且只详细计算Top10", () => {
    expect(defaultResult.stepPercent).toBe(0.01);
    expect(defaultResult.optimizationMethod).toBe("separableExact");
    expect(defaultResult.theoreticalRatioCount).toBe(50_015_001);
    expect(defaultResult.evaluatedRatioCount).toBeLessThan(50_015_001);
    expect(defaultResult.detailedEvaluationCount).toBeLessThan(20);
    expect(defaultResult.topK).toBe(10);
    expect(defaultResult.results).toHaveLength(10);
    expect(defaultResult.results.map((result) => result.rank)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("结果按照 totalDamage 从高到低排序", () => {
    for (let index = 1; index < defaultResult.results.length; index += 1) {
      expect(
        defaultResult.results[index - 1]!.totalDamage,
      ).toBeGreaterThanOrEqual(defaultResult.results[index]!.totalDamage);
    }
  });

  it("每个候选比例都调用当前 calculateBattleDamage", () => {
    const receivedInputs: BattleDamageInput[] = [];
    const trackedOptimizer = createTroopRatioOptimizer({
      calculateBattleDamage(input) {
        receivedInputs.push(input);
        return calculateBattleDamage(input);
      },
      now: () => 0,
    });
    const result = trackedOptimizer(testInput, { stepPercent: 10 });

    expect(result.evaluatedRatioCount).toBe(66);
    expect(receivedInputs).toHaveLength(66);
    for (const input of receivedInputs) {
      expect(input.bodyHeroIds).toEqual(fixedBodyHeroes);
      expect(
        input.troops.reduce((sum, troop) => sum + troop.troopCount, 0),
      ).toBe(testInput.totalTroopCount);
    }
  });

  it("返回候选与 calculateBattleDamage 直接计算完全一致", () => {
    for (const candidate of defaultResult.results) {
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
        bodyHeroIds: fixedBodyHeroes,
      });

      expect(candidate.singleRoundDamage).toBe(direct.finalDamage);
      expect(candidate.battleResult).toEqual(direct);
      expect(candidate.totalDamage).toBe(candidate.expectedTenRoundDamage);
      expect(candidate.troopDamages).toEqual(candidate.expectedTroopDamages);
    }
  });

  it("同一 N 下 4999 和 5000 兵共享 N 截断分支，sqrt(n) 仍不同", () => {
    const result = optimizeTroopRatio(
      { ...testInput, totalTroopCount: 9_999, bodyHeroIds: [] },
      { stepPercent: 50, topK: 6 },
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
      candidate?.battleResult.troopDamages.shield?.sourceResults[0]?.branch,
    ).toBe("at-or-above-5000");
    expect(
      candidate?.battleResult.troopDamages.lancer?.sourceResults[0]?.branch,
    ).toBe("at-or-above-5000");
    expect(
      candidate?.battleResult.troopDamages.shield?.sourceResults[0]?.factors.totalCountFactor,
    ).toBe(Math.sqrt(5_000));
    expect(
      candidate?.battleResult.troopDamages.lancer?.sourceResults[0]?.factors.totalCountFactor,
    ).toBe(Math.sqrt(5_000));
  });

  it("兵种比例为 0 时由现有伤害引擎返回 0 伤害", () => {
    const result = optimizeTroopRatio(testInput, {
      stepPercent: 100,
      topK: 3,
    });
    const allMarksman = result.results.find(
      (candidate) => candidate.ratios.marksman === 100,
    );

    expect(allMarksman?.troopCounts.shield).toBe(0);
    expect(allMarksman?.troopCounts.lancer).toBe(0);
    expect(allMarksman?.troopDamages.shield).toBe(0);
    expect(allMarksman?.troopDamages.lancer).toBe(0);
  });

  it("minimumRatios 和 maximumRatios 会过滤候选", () => {
    const result = optimizeTroopRatio(testInput, {
      stepPercent: 10,
      topK: 1_000,
      minimumRatios: { shield: 20, lancer: 10 },
      maximumRatios: { shield: 50, marksman: 50 },
    });

    expect(result.evaluatedRatioCount).toBeGreaterThan(0);
    for (const candidate of result.results) {
      expect(candidate.ratios.shield).toBeGreaterThanOrEqual(20);
      expect(candidate.ratios.shield).toBeLessThanOrEqual(50);
      expect(candidate.ratios.lancer).toBeGreaterThanOrEqual(10);
      expect(candidate.ratios.marksman).toBeLessThanOrEqual(50);
    }
  });

  it("固定车身包含 unsupported 英雄时由当前战斗引擎明确报错", () => {
    expect(() =>
      optimizeTroopRatio(
        {
          ...testInput,
          bodyHeroIds: ["hero.body.liyala"],
        },
        { stepPercent: 100 },
      ),
    ).toThrow(UnsupportedBodyHeroError);
  });

  it("相同输入重复运行得到完全相同的候选顺序与数值", () => {
    const first = optimizeTroopRatio(testInput, {
      stepPercent: 10,
      topK: 66,
    });
    const second = optimizeTroopRatio(testInput, {
      stepPercent: 10,
      topK: 66,
    });

    expect(first.results).toEqual(second.results);
    expect(first.evaluatedRatioCount).toBe(second.evaluatedRatioCount);
  });

  it("有基准比例时计算 improvementOverBaseline", () => {
    const result = optimizeTroopRatio(
      {
        ...testInput,
        baselineRatios: { shield: 10, lancer: 20, marksman: 70 },
      },
      { stepPercent: 10, topK: 1 },
    );
    const candidate = result.results[0]!;

    expect(result.baselineDamage).toBeTypeOf("number");
    expect(candidate.improvementOverBaseline).toBeCloseTo(
      candidate.totalDamage / result.baselineDamage! - 1,
      12,
    );
  });

  it("总伤害并列时按射手、矛兵、盾兵比例确定性排序", () => {
    const result = optimizeTroopRatio(
      { ...testInput, totalTroopCount: 0, bodyHeroIds: [] },
      { stepPercent: 50, topK: 6 },
    );

    expect(result.results.map((candidate) => candidate.ratios)).toEqual([
      { shield: 0, lancer: 0, marksman: 100 },
      { shield: 0, lancer: 50, marksman: 50 },
      { shield: 50, lancer: 0, marksman: 50 },
      { shield: 0, lancer: 100, marksman: 0 },
      { shield: 50, lancer: 50, marksman: 0 },
      { shield: 100, lancer: 0, marksman: 0 },
    ]);
  });
});
