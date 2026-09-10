import { describe, expect, it } from "vitest";
import type { TroopRatios } from "../../domain/troopRatioOptimization";
import { allocateTroopsByRatio } from "./allocateTroopsByRatio";
import { generateTroopRatioGrid } from "./generateTroopRatioGrid";
import {
  optimizeSeparableRatioGrid,
  referenceExactRatioSolver,
  solveExactRatioFromCoefficients,
} from "./optimizeSeparableRatioGrid";

const coefficients = { shield: 11, lancer: 29, marksman: 47 } as const;

describe("可分离凹目标的比例exact优化", () => {
  it.each([1, 0.1])("与 %s%% naive完整网格的Top1完全一致", (stepPercent) => {
    const totalTroopCount = 12_345;
    const exact = optimizeSeparableRatioGrid({
      totalTroopCount,
      coefficients,
      stepPercent,
      topK: 10,
    });
    const naive = generateTroopRatioGrid(stepPercent)
      .map((ratios) => scoreCandidate(totalTroopCount, ratios))
      .sort(compare)[0]!;
    expect(exact.results[0]!.ratios).toEqual(naive.ratios);
    expect(exact.results[0]!.troopCounts).toEqual(naive.troopCounts);
    expect(exact.results[0]!.score).toBeCloseTo(naive.score, 12);
  }, 15_000);

  it("在受限0.01%网格上仍与逐项穷举一致", () => {
    const totalTroopCount = 50_000;
    const bounds = {
      minimumRatios: { shield: 4.98, lancer: 27.98 },
      maximumRatios: { shield: 5.02, lancer: 28.02 },
    } as const;
    const exact = optimizeSeparableRatioGrid({
      totalTroopCount,
      coefficients,
      stepPercent: 0.01,
      topK: 3,
      ...bounds,
    });
    const constrainedRatios: TroopRatios[] = [];
    for (let shield = 498; shield <= 502; shield += 1) {
      for (let lancer = 2798; lancer <= 2802; lancer += 1) {
        constrainedRatios.push({
          shield: shield / 100,
          lancer: lancer / 100,
          marksman: (10_000 - shield - lancer) / 100,
        });
      }
    }
    const naive = constrainedRatios
      .map((ratios) => scoreCandidate(totalTroopCount, ratios))
      .sort(compare)
      .slice(0, 3);
    expect(exact.results).toEqual(naive);
  });

  it("0.01%完整理论空间为50015001，但不会逐点评分", () => {
    const result = optimizeSeparableRatioGrid({
      totalTroopCount: 227_370,
      coefficients,
      stepPercent: 0.01,
      topK: 10,
    });
    expect(result.theoreticalRatioCount).toBe(50_015_001);
    expect(result.ratioScale).toBe(10_000);
    expect(result.fastScoreCount).toBeLessThan(100_000);
  });

  it("1000组随机系数/容量下fast exact与reference exact完全一致", () => {
    const random = seededRandom(0x5eeda11);
    for (let index = 0; index < 1_000; index += 1) {
      const randomizedInput = {
        totalTroopCount: 20_000 + Math.floor(random() * 480_001),
        coefficients: {
          shield: 0.01 + random() * 100,
          lancer: 0.01 + random() * 100,
          marksman: 0.01 + random() * 100,
        },
        stepPercent: 0.01,
        topK: 1,
      } as const;
      const fast = solveExactRatioFromCoefficients(randomizedInput).results[0]!;
      const reference = referenceExactRatioSolver(randomizedInput).results[0]!;
      expect(fast.ratios, `第${index + 1}组比例`).toEqual(reference.ratios);
      expect(fast.troopCounts, `第${index + 1}组兵数`).toEqual(reference.troopCounts);
      expect(fast.score, `第${index + 1}组伤害`).toBeCloseTo(reference.score, 10);
    }
  }, 30_000);
});

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function scoreCandidate(totalTroopCount: number, ratios: TroopRatios) {
  const troopCounts = allocateTroopsByRatio(totalTroopCount, ratios);
  const score = coefficients.shield * Math.sqrt(troopCounts.shield)
    + coefficients.lancer * Math.sqrt(troopCounts.lancer)
    + coefficients.marksman * Math.sqrt(troopCounts.marksman);
  return { ratios, troopCounts, score };
}

function compare(left: ReturnType<typeof scoreCandidate>, right: ReturnType<typeof scoreCandidate>): number {
  const scoreOrder = right.score - left.score;
  if (scoreOrder !== 0) return scoreOrder;
  const marksmanOrder = right.ratios.marksman - left.ratios.marksman;
  if (marksmanOrder !== 0) return marksmanOrder;
  const lancerOrder = right.ratios.lancer - left.ratios.lancer;
  if (lancerOrder !== 0) return lancerOrder;
  return right.ratios.shield - left.ratios.shield;
}
