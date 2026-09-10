import { describe, expect, it } from "vitest";
import { calculateBattleDamage } from "../../app/calculateBattleDamage";
import { getHeadHeroById } from "../heroes/headHeroQueries";
import { getTroopSkillById } from "../troop-skills/troopSkillQueries";
import {
  getAllSkillDataCatalogEntries,
  getPendingSkillDataCatalogEntries,
  getSupportedSkillDataCatalogEntries,
  getUnsupportedSkillDataCatalogEntries,
} from "./skillDataCatalog";

const battleInput = {
  troops: [{ troopType: "marksman" as const, troopLevelId: "T10" as const, troopCount: 10_000, stats: { attackPercent: 0, penetrationPercent: 0 } }],
  bodyHeroIds: [],
};

describe("统一真实技能目录", () => {
  it("统一查询四类来源并保持稳定记录ID唯一", () => {
    const entries = getAllSkillDataCatalogEntries();
    expect(entries).toHaveLength(82);
    expect(getSupportedSkillDataCatalogEntries()).toHaveLength(78);
    expect(getPendingSkillDataCatalogEntries()).toHaveLength(4);
    expect(getUnsupportedSkillDataCatalogEntries()).toHaveLength(0);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
    expect(new Set(entries.map((entry) => entry.skillType))).toEqual(new Set(["body", "head", "fireCrystal", "troopTierSkill"]));
  });

  it("真实常驻增伤车身继续通过原伤害引擎结算", () => {
    const baseline = calculateBattleDamage(battleInput);
    const withSonia = calculateBattleDamage({ ...battleInput, bodyHeroIds: ["hero.body.suoniya"] });
    expect(withSonia.finalDamage).toBeCloseTo(baseline.finalDamage * 1.2, 11);
  });

  it("燃晶火药保存FC5的30%概率与50%extraDamage完整字段", () => {
    const powder = getTroopSkillById("troop-skill.marksman.crystal-powder")!;
    expect(powder.status).toBe("supported");
    expect(powder.trigger).toMatchObject({ type: "probability", probability: .3, frequency: "oncePerRound" });
    expect(powder.effects[0]).toMatchObject({ type: "extraDamage", value: .5, status: "supported", basis: "postMultiplierDamage" });
  });

  it("火焰冲击配置保存普通攻击乘区，联动额外伤害由自动技能解析器组合", () => {
    const flameImpact = getTroopSkillById("troop-skill.marksman.flame-impact")!;
    expect(flameImpact.status).toBe("supported");
    expect(flameImpact.effects).toEqual([expect.objectContaining({ type: "normalAttackDamageIncrease", value: .06 })]);
  });

  it("尼莫远征与探险技能严格分开，只有远征技能进入打熊目录", () => {
    const nimo = getHeadHeroById("hero.head.nimo")!;
    expect(nimo.headSkills.map((definition) => definition.name)).toEqual(["战前宣言", "剑术指导", "精湛剑术"]);
    expect(nimo.explorationSkills?.map((skill) => skill.name)).toEqual(["三断斩", "剑气", "孤傲"]);
    const catalogNames = getAllSkillDataCatalogEntries().map((entry) => entry.skillName);
    for (const name of ["战前宣言", "剑术指导", "精湛剑术"]) expect(catalogNames).toContain(name);
    for (const name of ["三断斩", "剑气", "孤傲"]) expect(catalogNames).not.toContain(name);
  });
});
