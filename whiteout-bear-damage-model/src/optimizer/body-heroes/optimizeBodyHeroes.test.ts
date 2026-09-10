import { beforeAll, describe, expect, it } from "vitest";
import { calculateBattleDamage } from "../../app/calculateBattleDamage";
import { calculateTenRoundExpectedDamage } from "../../app/calculateTenRoundExpectedDamage";
import type {
  BodyOptimizationInput,
  BodyOptimizationResult,
} from "../../domain/bodyOptimization";
import type { BodyHeroId } from "../../domain/hero";
import {
  getPendingBodyHeroes,
  getSupportedBodyHeroes,
  getUnsupportedBodyHeroes,
} from "../../game-data/heroes/bodyHeroQueries";
import { combinationsWithReplacement, combinationsWithReplacementLimited } from "../combinationsWithReplacement";
import {
  UnavailableOptimizerHeroError,
} from "./errors";
import { optimizeBodyHeroes } from "./optimizeBodyHeroes";

const testInput: BodyOptimizationInput = {
  troops: [
    {
      troopType: "shield",
      troopLevelId: "T10",
      troopCount: 10_000,
      stats: { attackPercent: 400, penetrationPercent: 100 },
    },
    {
      troopType: "lancer",
      troopLevelId: "T10",
      troopCount: 20_000,
      stats: { attackPercent: 400, penetrationPercent: 100 },
    },
    {
      troopType: "marksman",
      troopLevelId: "T10",
      troopCount: 30_000,
      stats: { attackPercent: 400, penetrationPercent: 100 },
    },
  ],
};

const shuyun = "hero.body.shuyun" as const;
const hendrick = "hero.body.hengdelike" as const;
const jessie = "hero.body.jiexi" as const;

describe("combinationsWithReplacement", () => {
  it("允许四个相同元素", () => {
    const combinations = combinationsWithReplacement(["A", "B"], 4);

    expect(combinations).toContainEqual(["A", "A", "A", "A"]);
    expect(combinations).toContainEqual(["B", "B", "B", "B"]);
  });

  it("自动搜索限制同一技能最多2份", () => {
    const combinations = combinationsWithReplacementLimited(["A", "B", "C", "D"], 4, 2);
    expect(combinations).toContainEqual(["A", "A", "B", "B"]);
    expect(combinations).toContainEqual(["A", "A", "B", "C"]);
    expect(combinations).toContainEqual(["A", "B", "C", "D"]);
    expect(combinations).not.toContainEqual(["A", "A", "A", "B"]);
    expect(combinations).not.toContainEqual(["A", "A", "A", "A"]);
  });

  it("忽略排列顺序，不重复生成 A+B+C+D 与 D+C+B+A", () => {
    const combinations = combinationsWithReplacement(["A", "B", "C", "D"], 4);
    const keys = combinations.map((combination) => combination.join("+"));

    expect(combinations).toHaveLength(35);
    expect(new Set(keys).size).toBe(combinations.length);
    expect(keys.filter((key) => key === "A+B+C+D")).toHaveLength(1);
    expect(keys).not.toContain("D+C+B+A");
  });
});

describe("optimizeBodyHeroes", () => {
  let defaultResult: BodyOptimizationResult;

  beforeAll(() => {
    defaultResult = optimizeBodyHeroes(testInput, { bodyCount: 0 });
  });

  it("默认候选池聚合为9个BodySkillOption，四车身受每类最多2份约束", () => {
    expect(getSupportedBodyHeroes()).toHaveLength(25);
    expect(defaultResult.candidateHeroCount).toBe(9);
    expect(defaultResult.bodySkillOptionCount).toBe(9);
    expect(defaultResult.combinationCount).toBe(1);
    expect(defaultResult.evaluatedCombinationCount).toBe(1);
    expect(combinationsWithReplacement(getSupportedBodyHeroes(), 4)).toHaveLength(20_475);
    expect(combinationsWithReplacementLimited(Array.from({ length: 9 }, (_, index) => index), 4, 2)).toHaveLength(414);

    for (const result of defaultResult.results) {
      expect(result.heroes).toHaveLength(0);
      expect(result.heroes.every((hero) => hero.status === "supported")).toBe(
        true,
      );
    }
  });

  it("pending 和 unsupported 英雄不进入默认候选池", () => {
    const excludedIds = new Set([
      ...getPendingBodyHeroes().map((hero) => hero.id),
      ...getUnsupportedBodyHeroes().map((hero) => hero.id),
    ]);

    for (const result of defaultResult.results) {
      expect(result.heroIds.some((heroId) => excludedIds.has(heroId))).toBe(
        false,
      );
    }
  });

  it("九类技能生成414个唯一效果，热循环不为每个候选运行正式十回合状态机", () => {
    const result = optimizeBodyHeroes(testInput, { bodyCount: 4, topK: 3 });
    expect(result.combinationCount).toBe(414);
    expect(result.effectSignatureCount).toBe(414);
    expect(result.fastScoreCount).toBe(414);
    expect(result.formalSimulationCount).toBe(1);
    expect(result.detailedSimulationCount).toBe(3);
    expect(result.compiledFastPath).toBe(true);
  });

  it("米娅车头加两个米娅车身的fast scorer与正式概率语义一致", () => {
    const input = {
      ...testInput,
      headFormation: { lancerHeroId: "hero.head.miya" as const },
    };
    const optimized = optimizeBodyHeroes(input, {
      bodyCount: 2,
      topK: 1,
      candidateHeroIds: ["hero.body.miya"],
    });
    const direct = calculateTenRoundExpectedDamage({
      ...input,
      bodyHeroIds: ["hero.body.miya", "hero.body.miya"],
    });
    expect(optimized.compiledFastPath).toBe(true);
    expect(optimized.results[0]!.score).toBeCloseTo(direct.expectedTotalDamage, 8);
    expect(
      optimized.results[0]!.expectedDamageByRound[1]!
        .expectedMultipliersByTroop.shield?.byEffectType.vulnerable,
    ).toBeCloseTo(1.4990234375, 12);
  });

  it("手动候选池包含 pending 或 unsupported 英雄时明确报错", () => {
    for (const heroId of [
      "hero.body.liyala",
      "hero.body.aisidila",
    ] as const) {
      expect(() =>
        optimizeBodyHeroes(testInput, {
          candidateHeroIds: [heroId],
        }),
      ).toThrow(UnavailableOptimizerHeroError);
    }
  });

  it("每个返回候选的伤害都与 calculateBattleDamage 直接计算一致", () => {
    for (const result of defaultResult.results) {
      const directResult = calculateBattleDamage({
        ...testInput,
        bodyHeroIds: result.heroIds,
      });

      expect(result.totalDamage).toBe(directResult.finalDamage);
      expect(result.troopDamages.shield).toBe(
        directResult.troopDamages.shield?.finalDamage ?? 0,
      );
      expect(result.troopDamages.lancer).toBe(
        directResult.troopDamages.lancer?.finalDamage ?? 0,
      );
      expect(result.troopDamages.marksman).toBe(
        directResult.troopDamages.marksman?.finalDamage ?? 0,
      );
    }
  });

  it("结果按照 totalDamage 从高到低排序", () => {
    for (let index = 1; index < defaultResult.results.length; index += 1) {
      expect(defaultResult.results[index - 1]!.totalDamage).toBeGreaterThanOrEqual(
        defaultResult.results[index]!.totalDamage,
      );
    }
  });

  it("默认 topK=10，结果不会超过候选数", () => {
    expect(defaultResult.topK).toBe(10);
    expect(defaultResult.results).toHaveLength(1);
    expect(defaultResult.results.map((result) => result.rank)).toEqual([1]);
  });

  it.each([1, 2, 3, 4])("bodyCount=%i 能正常工作", (bodyCount) => {
    const result = optimizeBodyHeroes(testInput, {
      bodyCount,
      topK: 100,
      candidateHeroIds: [shuyun, hendrick],
    });

    const expected = [0, 2, 3, 2, 1][bodyCount]!;
    expect(result.combinationCount).toBe(expected);
    expect(result.evaluatedCombinationCount).toBe(expected);
    expect(
      result.results.every((candidate) => candidate.bodySkillOptionIds.length === bodyCount),
    ).toBe(true);
  });

  it("improvementOverNoBody 严格按组合伤害/无车身伤害-1计算", () => {
    const result = optimizeBodyHeroes(testInput, {
      bodyCount: 1,
      topK: 1,
      candidateHeroIds: [shuyun],
    });
    const noBody = calculateBattleDamage({ ...testInput, bodyHeroIds: [] });
    const candidate = result.results[0]!;

    expect(candidate.improvementOverNoBody).toBeCloseTo(
      candidate.totalDamage / noBody.finalDamage - 1,
      12,
    );
  });

  it("同效果来源英雄不会重复扩大自动搜索空间", () => {
    const result = optimizeBodyHeroes(testInput, {
      bodyCount: 1,
      topK: 10,
      candidateHeroIds: [shuyun, "hero.body.heluonimo"],
    });

    expect(result.candidateHeroCount).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.bodySkillOptionIds).toEqual(["body-skill.attack-25"]);
  });

  it("手动damage pipeline仍允许四个完全相同技能", () => {
    const result = calculateBattleDamage({
      ...testInput,
      bodyHeroIds: [shuyun, shuyun, shuyun, shuyun] satisfies BodyHeroId[],
    });
    expect(result.troopDamages.shield?.multipliers.byEffectType.attack).toBe(2);
  });

  it("手动damage pipeline允许四个相同常驻穿透技能", () => {
    const result = calculateBattleDamage({
      ...testInput,
      bodyHeroIds: [jessie, jessie, jessie, jessie] satisfies BodyHeroId[],
    });
    expect(result.troopDamages.shield?.multipliers.byEffectType.penetration).toBe(2);
  });
});
