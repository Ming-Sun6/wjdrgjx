import { describe, expect, it } from "vitest";
import { calculateTenRoundExpectedDamage } from "../app/calculateTenRoundExpectedDamage";
import type { HeadHeroId } from "../domain/hero";
import type { ReportHeroProfileId } from "../domain/reportHero";
import {
  GENERATION_STATIC_COMBAT_STATS,
  getHeroStaticCombatStats,
  getReportHeroProfileById,
  getReportHeroProfilesByTroopType,
} from "./heroes/reportHeroProfiles";
import {
  calculateExclusiveWeaponPenetration,
  resolveBattleReportEffectiveAttributes,
} from "../systems/reportHeroAdjustment";
import { optimizeFullBattleSetup } from "../optimizer/full-setup";

describe("v0.4 战报英雄静态属性档案", () => {
  it("完整保存S1至S16标准攻击与满级专武穿透", () => {
    expect(GENERATION_STATIC_COMBAT_STATS).toEqual({
      1: { heroAttackPercent: 200.16, maxWeaponPenetrationPercent: 55 },
      2: { heroAttackPercent: 240.19, maxWeaponPenetrationPercent: 60 },
      3: { heroAttackPercent: 290.23, maxWeaponPenetrationPercent: 70 },
      4: { heroAttackPercent: 370.29, maxWeaponPenetrationPercent: 92.5 },
      5: { heroAttackPercent: 444.35, maxWeaponPenetrationPercent: 111 },
      6: { heroAttackPercent: 540.43, maxWeaponPenetrationPercent: 133.5 },
      7: { heroAttackPercent: 650.52, maxWeaponPenetrationPercent: 160.5 },
      8: { heroAttackPercent: 780.62, maxWeaponPenetrationPercent: 193 },
      9: { heroAttackPercent: 940.75, maxWeaponPenetrationPercent: 232 },
      10: { heroAttackPercent: 1110.88, maxWeaponPenetrationPercent: 277.5 },
      11: { heroAttackPercent: 1281.02, maxWeaponPenetrationPercent: 320 },
      12: { heroAttackPercent: 1451.16, maxWeaponPenetrationPercent: 362.5 },
      13: { heroAttackPercent: 1621.29, maxWeaponPenetrationPercent: 405 },
      14: { heroAttackPercent: 1791.43, maxWeaponPenetrationPercent: 447.5 },
      15: { heroAttackPercent: 1961.51, maxWeaponPenetrationPercent: 490 },
      16: { heroAttackPercent: 2131.70, maxWeaponPenetrationPercent: 532.5 },
    });
  });

  it("尼莫使用特殊S1档案，其他S1仍用标准档案", () => {
    expect(getHeroStaticCombatStats("hero.head.nimo")).toEqual({
      heroAttackPercent: 260.20,
      maxWeaponPenetrationPercent: 62.5,
    });
    expect(getHeroStaticCombatStats("hero.head.jinman")).toEqual({
      heroAttackPercent: 200.16,
      maxWeaponPenetrationPercent: 55,
    });
  });

  it("R、SR、吉娜档案无专武且数据正确", () => {
    expect(profile("report-hero.shield.r")).toMatchObject({ heroAttackPercent: 90.07, maxWeaponPenetrationPercent: 0, hasExclusiveWeapon: false });
    expect(profile("report-hero.lancer.sr")).toMatchObject({ heroAttackPercent: 140.11, maxWeaponPenetrationPercent: 0, hasExclusiveWeapon: false });
    expect(profile("report-hero.marksman.gina")).toMatchObject({ label: "吉娜（SR）", heroAttackPercent: 110.08, maxWeaponPenetrationPercent: 0, hasExclusiveWeapon: false });
  });

  it("三类下拉按规则替换代际模板并保留盾S1特殊双档案", () => {
    expect(getReportHeroProfilesByTroopType("shield").map((entry) => entry.label)).toEqual([
      "R", "SR", "S1", "尼莫（S1）", "弗林特（S2）", "S3", "S4", "赫克托（S5）",
      "S6", "S7", "S8", "S9", "S10", "S11", "S12", "S13", "S14", "S15", "S16",
    ]);
    expect(getReportHeroProfilesByTroopType("lancer").map((entry) => entry.label)).toEqual([
      "R", "SR", "S1", "S2", "米娅（S3）", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12", "S13", "S14", "S15", "S16",
    ]);
    expect(getReportHeroProfilesByTroopType("marksman").map((entry) => entry.label)).toEqual([
      "R", "SR", "吉娜（SR）", "津曼（S1）", "阿隆索（S2）", "格雷格（S3）", "琳恩（S4）", "格温（S5）", "韦恩（S6）", "布拉德利（S7）", "亨德里克（S8）", "修拉（S9）", "布兰琪（S10）", "鲁弗斯（S11）", "丽姬娅（S12）", "乌尔卡努丝（S13）", "卡拉（S14）", "维薇卡（S15）", "艾诗琳（S16）",
    ]);
  });

  it("专武等级按满级穿透的十分之一线性取值并拒绝非法等级", () => {
    expect(calculateExclusiveWeaponPenetration(160.5, 7)).toBeCloseTo(112.35, 12);
    expect(calculateExclusiveWeaponPenetration(277.5, 10)).toBeCloseTo(277.5, 12);
    expect(() => calculateExclusiveWeaponPenetration(100, 11)).toThrow(/0至10/);
  });

  it("Bradley7换Blanche10的静态差值满足golden值", () => {
    const result = resolveBattleReportEffectiveAttributes({
      troopType: "marksman",
      battleReportAttackPercent: 1000,
      battleReportPenetrationPercent: 500,
      reportHero: { profileId: "report-hero.marksman.head.buladeli", weaponLevel: 7 },
      actualHeadHeroId: "hero.head.bulanqi",
      actualWeaponLevel: 10,
    });
    expect(result.deltaAttackPercent).toBeCloseTo(460.36, 12);
    expect(result.deltaPenetrationPercent).toBeCloseTo(165.15, 12);
    expect(result.correctedAttackPercent).toBeCloseTo(1485.36, 12);
    expect(result.correctedPenetrationPercent).toBeCloseTo(665.15, 12);
  });

  it("相同英雄同专武差值为0；吉娜换Bradley7得到确认差值", () => {
    const same = adjustment("report-hero.marksman.head.buladeli", 7, "hero.head.buladeli", 7);
    expect(same.deltaAttackPercent).toBe(0);
    expect(same.deltaPenetrationPercent).toBe(0);
    const gina = adjustment("report-hero.marksman.gina", 0, "hero.head.buladeli", 7);
    expect(gina.deltaAttackPercent).toBeCloseTo(540.44, 12);
    expect(gina.deltaPenetrationPercent).toBeCloseTo(112.35, 12);
  });

  it("R/SR/吉娜非0专武等级明确报错", () => {
    expect(() => adjustment("report-hero.marksman.gina", 1, "hero.head.buladeli", 7)).toThrow(/没有专武/);
  });

  it("战报英雄身份绝不触发技能，只有实际车头技能进入伤害", () => {
    const baseInput = {
      troops: [
        { troopType: "shield" as const, troopCount: 1000, troopLevelId: "T1" as const, stats: { attackPercent: 0, penetrationPercent: 0 } },
        { troopType: "lancer" as const, troopCount: 1000, troopLevelId: "T1" as const, stats: { attackPercent: 0, penetrationPercent: 0 } },
        { troopType: "marksman" as const, troopCount: 1000, troopLevelId: "T1" as const, stats: { attackPercent: 0, penetrationPercent: 0 } },
      ],
      bodyHeroIds: [],
      battleReportHeroAdjustment: {
        reportHeroes: {
          shield: { profileId: "report-hero.shield.r" as const, weaponLevel: 0 },
          lancer: { profileId: "report-hero.lancer.r" as const, weaponLevel: 0 },
          marksman: { profileId: "report-hero.marksman.head.buladeli" as const, weaponLevel: 0 },
        },
        actualWeaponLevels: { shield: 0, lancer: 0, marksman: 0 },
      },
    };
    const noHead = calculateTenRoundExpectedDamage(baseInput);
    expect(noHead.appliedSkills.some((entry) => entry.ownerId === "hero.head.buladeli")).toBe(false);
    const actualHead = calculateTenRoundExpectedDamage({
      ...baseInput,
      headFormation: { marksmanHeroId: "hero.head.buladeli" },
    });
    expect(actualHead.appliedSkills.some((entry) => entry.ownerId === "hero.head.buladeli")).toBe(true);
  });

  it("完整车头优化候选与正式入口共享战报静态属性修正", () => {
    const input = {
      totalTroopCount: 3000,
      troopSettings: {
        shield: { troopLevelId: "T1" as const, stats: { attackPercent: 100, penetrationPercent: 100 } },
        lancer: { troopLevelId: "T1" as const, stats: { attackPercent: 100, penetrationPercent: 100 } },
        marksman: { troopLevelId: "T1" as const, stats: { attackPercent: 100, penetrationPercent: 100 } },
      },
      battleReportHeroAdjustment: {
        reportHeroes: {
          shield: { profileId: "report-hero.shield.r" as const, weaponLevel: 0 },
          lancer: { profileId: "report-hero.lancer.r" as const, weaponLevel: 0 },
          marksman: { profileId: "report-hero.marksman.head.buladeli" as const, weaponLevel: 7 },
        },
        actualWeaponLevels: { shield: 0, lancer: 0, marksman: 10 },
      },
    };
    const result = optimizeFullBattleSetup(input, {
      ratio: { mode: "fixed", ratios: { shield: 0, lancer: 0, marksman: 100 } },
      body: { mode: "fixed", heroIds: [] },
      head: {
        shield: { mode: "fixed" },
        lancer: { mode: "fixed" },
        marksman: {
          mode: "optimize",
          candidateHeroIds: ["hero.head.buladeli", "hero.head.bulanqi"],
          includeEmpty: false,
        },
      },
      fireCrystal: { mode: "fixed" },
      topK: 2,
    });
    expect(result.results).toHaveLength(2);
    for (const candidate of result.results) {
      const marksmanHeroId = candidate.headFormation.marksmanHeroId;
      if (marksmanHeroId === undefined) throw new Error("缺少射手候选");
      const direct = calculateTenRoundExpectedDamage({
        troops: [
          { troopType: "shield", troopCount: 0, troopLevelId: "T1", stats: input.troopSettings.shield.stats },
          { troopType: "lancer", troopCount: 0, troopLevelId: "T1", stats: input.troopSettings.lancer.stats },
          { troopType: "marksman", troopCount: 3000, troopLevelId: "T1", stats: input.troopSettings.marksman.stats },
        ],
        bodyHeroIds: [],
        headFormation: { marksmanHeroId },
        fireCrystal: { skillIds: [] },
        battleReportHeroAdjustment: input.battleReportHeroAdjustment,
      });
      expect(candidate.score).toBeCloseTo(direct.expectedTotalDamage, 8);
    }
  });
});

function profile(id: ReportHeroProfileId) {
  const result = getReportHeroProfileById(id);
  if (result === undefined) throw new Error(`missing ${id}`);
  return result;
}

function adjustment(
  profileId: ReportHeroProfileId,
  reportWeaponLevel: number,
  actualHeadHeroId: HeadHeroId,
  actualWeaponLevel: number,
) {
  return resolveBattleReportEffectiveAttributes({
    troopType: "marksman",
    battleReportAttackPercent: 0,
    battleReportPenetrationPercent: 0,
    reportHero: { profileId, weaponLevel: reportWeaponLevel },
    actualHeadHeroId,
    actualWeaponLevel,
  });
}
