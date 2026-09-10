import { describe, expect, it } from "vitest";
import type {
  BaseTroopDamageInput,
  BaseTroopGroupInput,
} from "../../../domain/baseDamage";
import { troopDamageCoefficients } from "../../../game-data/troops/troopDamageCoefficients";
import { troopLevels } from "../../../game-data/troops/troopLevels";
import { calculateBaseTotalDamage } from "./calculateBaseTotalDamage";
import { calculateBaseTroopDamage } from "./calculateBaseTroopDamage";
import { BASE_DAMAGE_K } from "./constants";
import { MissingTroopLevelConstantError } from "./errors";
import { percentageToDecimal, percentageToMultiplier } from "./percent";

const commonInput: Omit<BaseTroopDamageInput, "troopType"> = {
  totalTroopCount: 100_000,
  troopCount: 20_000,
  troopLevelId: "T10",
  stats: {
    attackPercent: 0,
    penetrationPercent: 0,
  },
};

describe("兵种伤害系数配置", () => {
  it("盾兵伤害系数为 1", () => {
    expect(troopDamageCoefficients.shield).toBe(1);
  });

  it("相同输入下，矛兵伤害是盾兵的 3 倍", () => {
    const shield = calculateBaseTroopDamage({
      ...commonInput,
      troopType: "shield",
    });
    const lancer = calculateBaseTroopDamage({
      ...commonInput,
      troopType: "lancer",
    });

    expect(lancer.damage).toBeCloseTo(shield.damage * 3, 11);
  });

  it("相同输入下，射手伤害是盾兵的 4 倍", () => {
    const shield = calculateBaseTroopDamage({
      ...commonInput,
      troopType: "shield",
    });
    const marksman = calculateBaseTroopDamage({
      ...commonInput,
      troopType: "marksman",
    });

    expect(marksman.damage).toBeCloseTo(shield.damage * 4, 12);
  });
});

describe("兵种等级常数配置", () => {
  it("完整保留当前已确认的等级常数", () => {
    const expectedKnownConstants = {
      T1: 1,
      T2: 1.5,
      T3: 2.1,
      T4: 2.73,
      T5: 3.276,
      T6: 3.8657,
      T7: 4.5615,
      T8: 5.3826,
      T9: 6.3514,
      T10: 7.4947,
      "T10-FC1": 7.7945,
      "T10-FC2": 8.1842,
      "T10-FC3": 8.5934,
      "T10-FC4": 9.0231,
      "T10-FC5": 9.4742,
      "T10-FC6": 9.8532,
      "T10-FC7": 10.3459,
      "T10-FC8": 10.8632,
      "T10-FC9": 11.4063,
      "T10-FC10": 11.9766,
      T11: 8.8437,
      "T11-FC1": 9.1975,
      "T11-FC2": 9.6574,
      "T11-FC3": 10.1402,
      "T11-FC4": 10.6472,
      "T11-FC5": 11.1796,
      "T11-FC6": 11.6268,
      "T11-FC7": 12.2081,
      "T11-FC8": 12.8185,
      "T11-FC9": 13.4595,
      "T11-FC10": 14.1324,
      "T12-FC6": 13.7196,
      "T12-FC7": 14.4056,
      "T12-FC8": 15.1259,
      "T12-FC9": 15.8822,
      "T12-FC10": 16.6763,
    } as const;

    for (const [levelId, expectedConstant] of Object.entries(
      expectedKnownConstants,
    )) {
      expect(troopLevels[levelId as keyof typeof troopLevels].constant).toBe(
        expectedConstant,
      );
    }
  });

  it("未提供的 T12 数据保持显式缺失", () => {
    const missingIds = [
      "T12",
      "T12-FC1",
      "T12-FC2",
      "T12-FC3",
      "T12-FC4",
      "T12-FC5",
    ] as const;

    for (const levelId of missingIds) {
      expect(troopLevels[levelId]).toMatchObject({
        status: "missing",
        constant: null,
      });
    }
  });
});

describe("calculateBaseTroopDamage", () => {
  it("N > 5000 时，第一个根号使用 sqrt(5000)，判断不依赖 n", () => {
    const result = calculateBaseTroopDamage({
      ...commonInput,
      troopType: "shield",
      troopCount: 4_999,
    });
    const expected =
      BASE_DAMAGE_K *
      Math.sqrt(5_000) *
      Math.sqrt(4_999) *
      1 *
      7.4947;

    expect(result.branch).toBe("at-or-above-5000");
    expect(result.factors.totalCountFactor).toBe(Math.sqrt(5_000));
    expect(result.damage).toBeCloseTo(expected, 12);
  });

  it("N < 5000 时，第一个根号使用 sqrt(N)", () => {
    const result = calculateBaseTroopDamage({
      ...commonInput,
      totalTroopCount: 3_000,
      troopType: "shield",
      troopCount: 3_000,
    });
    const expected =
      BASE_DAMAGE_K *
      Math.sqrt(3_000) *
      Math.sqrt(3_000) *
      1 *
      7.4947;

    expect(result.branch).toBe("below-5000");
    expect(result.factors.totalCountFactor).toBe(Math.sqrt(3_000));
    expect(result.damage).toBeCloseTo(expected, 12);
  });

  it("sqrt(n) 始终使用实际兵种数，不做 5000 截断", () => {
    const atFiveThousand = calculateBaseTroopDamage({
      ...commonInput,
      troopType: "shield",
      troopCount: 5_000,
    });
    const atTwentyThousand = calculateBaseTroopDamage({
      ...commonInput,
      troopType: "shield",
      troopCount: 20_000,
    });

    expect(atTwentyThousand.factors.troopCountFactor).toBe(Math.sqrt(20_000));
    expect(atTwentyThousand.damage).toBeCloseTo(atFiveThousand.damage * 2, 12);
  });

  it("真实预设扩容后的射手基础伤害约为 518 万/回合", () => {
    const result = calculateBaseTroopDamage({
      totalTroopCount: 227_370,
      troopCount: 222_823,
      troopType: "marksman",
      troopLevelId: "T12-FC10",
      stats: { attackPercent: 1_765, penetrationPercent: 1_551.9 },
    });
    const expected =
      BASE_DAMAGE_K *
      Math.sqrt(5_000) *
      Math.sqrt(222_823) *
      4 *
      16.6763 *
      18.65 *
      16.519;

    expect(result.factors.totalCountFactor).toBe(Math.sqrt(5_000));
    expect(result.factors.troopCountFactor).toBe(Math.sqrt(222_823));
    expect(result.damage).toBeCloseTo(expected, 8);
    expect(result.damage).toBeGreaterThan(5_100_000);
    expect(result.damage).toBeLessThan(5_300_000);
  });

  it("将战报百分数转换为小数和倍率", () => {
    expect(percentageToDecimal(444.35)).toBeCloseTo(4.4435, 12);
    expect(percentageToMultiplier(444.35)).toBeCloseTo(5.4435, 12);

    const result = calculateBaseTroopDamage({
      ...commonInput,
      troopType: "shield",
      stats: {
        attackPercent: 444.35,
        penetrationPercent: 123.45,
      },
    });

    expect(result.factors.attackMultiplier).toBeCloseTo(5.4435, 12);
    expect(result.factors.penetrationMultiplier).toBeCloseTo(2.2345, 12);
  });

  it("防御和生命字段不会改变当前基础伤害", () => {
    const withoutReservedStats = calculateBaseTroopDamage({
      ...commonInput,
      troopType: "shield",
    });
    const withReservedStats = calculateBaseTroopDamage({
      ...commonInput,
      troopType: "shield",
      stats: {
        ...commonInput.stats,
        defensePercent: 999,
        healthPercent: 999,
      },
    });

    expect(withReservedStats.damage).toBe(withoutReservedStats.damage);
  });

  it("等级常数显式缺失时抛出可识别错误", () => {
    expect(() =>
      calculateBaseTroopDamage({
        ...commonInput,
        troopType: "shield",
        troopLevelId: "T12-FC1",
      }),
    ).toThrow(MissingTroopLevelConstantError);
  });
});

describe("calculateBaseTotalDamage", () => {
  it("分别计算三兵种，并将未取整结果直接相加", () => {
    const troops: readonly BaseTroopGroupInput[] = [
      {
        troopType: "shield",
        troopLevelId: "T10",
        troopCount: 10_000,
        stats: { attackPercent: 100, penetrationPercent: 50 },
      },
      {
        troopType: "lancer",
        troopLevelId: "T9",
        troopCount: 20_000,
        stats: { attackPercent: 200, penetrationPercent: 60 },
      },
      {
        troopType: "marksman",
        troopLevelId: "T11",
        troopCount: 30_000,
        stats: { attackPercent: 300, penetrationPercent: 70 },
      },
    ];

    const result = calculateBaseTotalDamage({ troops });

    expect(result.totalTroopCount).toBe(60_000);
    expect(result.troopResults).toHaveLength(3);
    expect(result.troopResults.every((item) => item.totalTroopCount === 60_000))
      .toBe(true);
    expect(result.totalDamage).toBeCloseTo(
      result.troopResults[0]!.damage +
        result.troopResults[1]!.damage +
        result.troopResults[2]!.damage,
      12,
    );
  });
});
