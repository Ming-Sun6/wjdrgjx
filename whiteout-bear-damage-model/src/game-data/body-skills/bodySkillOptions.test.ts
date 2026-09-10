import { describe, expect, it } from "vitest";
import { calculateBattleDamage } from "../../app/calculateBattleDamage";
import { calculateTenRoundExpectedDamage } from "../../app/calculateTenRoundExpectedDamage";
import { getAllBodySkillOptions, getBodySkillOptionById } from "./bodySkillOptions";

describe("v0.1车身技能选项", () => {
  it("普通UI/自动优化共用指定九类技能，来源英雄不重复形成选项", () => {
    const options = getAllBodySkillOptions();
    expect(options).toHaveLength(9);
    expect(options.map((option) => option.label)).toEqual([
      "全军攻击 +25%",
      "全军穿透 +25%",
      "敌军防御 -25%",
      "全军伤害 +20%",
      "易伤 +25%",
      "40%概率全军穿透 +50%",
      "50%概率易伤 +50%",
      "20%概率增伤 +40%（持续3回合）",
      "普攻伤害 +30%",
    ]);
    expect(getBodySkillOptionById("body-skill.attack-25")?.sourceHeroNames).toEqual([
      "书允", "赫罗尼莫", "马格努斯", "维薇卡", "鲁弗斯",
    ]);
    expect(getBodySkillOptionById("body-skill.penetration-25")?.sourceHeroNames).toEqual([
      "杰西", "杰塞尔", "布兰琪", "赫尔薇尔", "汉克", "贝尔莎",
    ]);
    expect(getBodySkillOptionById("body-skill.defense-reduction-25")?.sourceHeroNames).toEqual(["亨德里克"]);
    expect(getBodySkillOptionById("body-skill.damage-20")?.sourceHeroNames).toEqual(["索尼娅", "多米尼克", "艾诗琳"]);
    expect(getBodySkillOptionById("body-skill.vulnerable-25")?.sourceHeroNames).toEqual(["格温"]);
    expect(getBodySkillOptionById("body-skill.probability-penetration-50")?.sourceHeroNames).toEqual(["阿隆索", "琳恩"]);
    expect(getBodySkillOptionById("body-skill.probability-vulnerable-50")?.sourceHeroNames).toEqual(["米娅"]);
    expect(getBodySkillOptionById("body-skill.greg-damage-40")?.sourceHeroNames).toEqual(["格雷格"]);
    expect(getBodySkillOptionById("body-skill.normal-attack-30")?.sourceHeroNames).toEqual(["玲奈"]);
  });

  it("常驻穿透+25%与40%概率穿透+50%是两个独立选项", () => {
    const constant = getBodySkillOptionById("body-skill.penetration-25")!;
    const probability = getBodySkillOptionById("body-skill.probability-penetration-50")!;
    expect(constant.skill?.trigger).toEqual({ type: "always" });
    expect(constant.skill?.effects).toMatchObject([
      { type: "penetration", value: 0.25, targetTroop: "all" },
    ]);
    expect(probability.skill?.trigger).toMatchObject({ type: "probability", probability: 0.4 });
    expect(probability.id).not.toBe(constant.id);
  });

  it("两个常驻穿透选项在同一skill小区加算为+50%", () => {
    const result = calculateBattleDamage({
      troops: [{
        troopType: "shield",
        troopLevelId: "T6",
        troopCount: 10_000,
        stats: { attackPercent: 0, penetrationPercent: 0 },
      }],
      bodyHeroIds: ["hero.body.jiexi", "hero.body.jiexi"],
    });
    expect(result.troopDamages.shield?.multipliers.byEffectType.penetration).toBe(1.5);
  });

  it("玲奈只放大普通部分，不放大韦恩extraDamage", () => {
    const troops = [{
      troopType: "shield" as const,
      troopLevelId: "T6" as const,
      troopCount: 10_000,
      stats: { attackPercent: 0, penetrationPercent: 0 },
    }];
    const base = calculateTenRoundExpectedDamage({ troops, bodyHeroIds: [] });
    const combined = calculateTenRoundExpectedDamage({
      troops,
      bodyHeroIds: ["hero.body.lingnai", "hero.body.weien"],
    });
    const d = base.expectedDamageByRound[0]!.expectedTotalDamage;
    expect(combined.expectedDamageByRound[0]!.expectedTotalDamage).toBeCloseTo(1.3 * d, 10);
    expect(combined.expectedDamageByRound[4]!.expectedTotalDamage).toBeCloseTo(2.3 * d, 10);
    expect(combined.expectedDamageByRound[4]!.expectedTotalDamage).not.toBeCloseTo(2.6 * d, 10);
  });
});
