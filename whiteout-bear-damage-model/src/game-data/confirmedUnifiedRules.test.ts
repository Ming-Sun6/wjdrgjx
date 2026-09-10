import { describe, expect, it } from "vitest";
import { calculateTenRoundExpectedDamage } from "../app/calculateTenRoundExpectedDamage";
import { getAllHeadHeroes, getHeadHeroById } from "./heroes/headHeroQueries";
import { getAllBodyHeroes, getHeroById } from "./heroes/bodyHeroQueries";
import { resolveAutomaticTroopSkills } from "./troop-skills/automaticTroopSkills";
import { getFireCrystalSkills, getTroopTierSkills } from "./troop-skills/troopSkillQueries";
import type { BattlePreparationConfig } from "../domain/preparation";
import type { TenRoundExpectedDamageInput } from "../domain/tenRoundExpectedDamage";

const noBuffs: BattlePreparationConfig = {
  baseMarchCapacity: 30_000,
  expert: { hunterHeartLevel: 0, bearSlayerLevel: 0 },
  town: { attack: "none", penetration: "none", defenseReduction: "none", marchCapacity: "none" },
  pet: { attackLevel: 0, penetrationLevel: 0, defenseReductionLevel: 0, capacityLevel: 0 },
  troopSkillLevels: { marksmanBlazingStarLevel: 0, lancerT12SkillLevel: 0 },
};
const baseTroops: TenRoundExpectedDamageInput["troops"] = [
  { troopType: "shield", troopCount: 10_000, troopLevelId: "T6", stats: { attackPercent: 0, penetrationPercent: 0 } },
  { troopType: "lancer", troopCount: 10_000, troopLevelId: "T6", stats: { attackPercent: 0, penetrationPercent: 0 } },
  { troopType: "marksman", troopCount: 10_000, troopLevelId: "T6", stats: { attackPercent: 0, penetrationPercent: 0 } },
];
const calculate = (extra: Partial<TenRoundExpectedDamageInput> = {}) => calculateTenRoundExpectedDamage({ troops: baseTroops, bodyHeroIds: [], ...extra });

describe("确认后的真实英雄规则", () => {
  it("英雄车身与车头的可执行技能统一使用5级数据", () => {
    for (const hero of getAllBodyHeroes()) {
      if (hero.bodySkill !== null) expect(hero.bodySkill.level).toBe(5);
    }
    for (const hero of getAllHeadHeroes()) {
      for (const definition of hero.headSkills) {
        if (definition.skill !== null) expect(definition.skill.level).toBe(5);
      }
    }
  });
  it("尼莫探险技能与远征技能严格分离；米娅为矛车头；鲁弗斯资料统一", () => {
    const nimo = getHeadHeroById("hero.head.nimo")!;
    expect(nimo.headSkills.map((definition) => definition.name)).toEqual(["战前宣言", "剑术指导", "精湛剑术"]);
    expect(nimo.headSkills.every((definition) => definition.status === "supported")).toBe(true);
    expect(nimo.explorationSkills?.map((skill) => skill.name)).toEqual(["三断斩", "剑气", "孤傲"]);
    expect(getHeadHeroById("hero.head.miya")?.troopType).toBe("lancer");
    expect(getHeadHeroById("hero.head.lufusi")).toMatchObject({ name: "鲁弗斯", generation: 11, troopType: "marksman" });
  });

  it("尼莫三个5级远征技能全部进入正式打熊并按5/6/9/10回合生效", () => {
    const nimo = getHeadHeroById("hero.head.nimo")!;
    const runtimeSkills = nimo.headSkills.flatMap((definition) => definition.skill ? [definition.skill] : []);
    expect(runtimeSkills[0]?.effects[0]).toMatchObject({ type: "penetration", value: .25, targetTroop: "all" });
    expect(runtimeSkills[1]?.effects[0]).toMatchObject({ type: "attack", value: .25, targetTroop: "all" });
    expect(runtimeSkills[2]?.effects[0]).toMatchObject({ type: "baseDamageIncrease", value: .30, targetTroop: "all", activeRounds: [5,6,9,10] });
    expect(nimo.headSkills.some((definition) => definition.status === "pending")).toBe(false);

    const baseline = calculate();
    const withNimo = calculate({ headFormation: { shieldHeroId: "hero.head.nimo" } });
    const activeRounds = new Set([5,6,9,10]);
    for (const round of withNimo.expectedDamageByRound) {
      const baselineRound = baseline.expectedDamageByRound[round.round - 1]!.expectedTotalDamage;
      const expectedMultiplier = 1.25 * 1.25 * (activeRounds.has(round.round) ? 1.30 : 1);
      expect(round.expectedTotalDamage).toBeCloseTo(baselineRound * expectedMultiplier, 8);
    }
    const applied = withNimo.appliedSkills.map((skill) => skill.skillName);
    expect(applied).toEqual(expect.arrayContaining(["战前宣言（5级）", "剑术指导（5级）", "精湛剑术（5级）"]));
    for (const name of ["三断斩", "剑气", "孤傲"]) expect(applied).not.toContain(name);
  });

  it("射手车头代际为2/5/7/8/10/11", () => {
    expect(["hero.head.alongsuo","hero.head.gewen","hero.head.buladeli","hero.head.hengdelike","hero.head.bulanqi","hero.head.lufusi"].map((id) => getHeadHeroById(id as `hero.head.${string}`)?.generation)).toEqual([2,5,7,8,10,11]);
  });

  it("赫克托雷霆出击按回合衰减；疾风猛击仅产生+100%D额外伤害期望", () => {
    const baseline = calculate();
    const result = calculate({ headFormation: { shieldHeroId: "hero.head.heketuo" } });
    const shieldBase = baseline.expectedDamageByRound[0]!.expectedShieldDamage;
    const lancerBase = baseline.expectedDamageByRound[0]!.expectedLancerDamage;
    const marksmanBase = baseline.expectedDamageByRound[0]!.expectedMarksmanDamage;
    for (const [index, round] of result.expectedDamageByRound.entries()) {
      const decay = .85 ** index;
      const primary = shieldBase * (1 + 2 * decay) + lancerBase + marksmanBase * (1 + decay);
      expect(round.expectedNormalDamage).toBeCloseTo(primary, 8);
      expect(round.expectedExtraDamage).toBeCloseTo(primary * .25, 8);
      expect(round.expectedExtraAttackDamage).toBe(0);
      expect(round.expectedTotalDamage).toBeCloseTo(primary * 1.25, 8);
    }
  });

  it("米娅三次独立50%使下一回合易伤存在概率0.875且同回合不叠加", () => {
    const baseline = calculate();
    const result = calculate({ headFormation: { lancerHeroId: "hero.head.miya" } });
    expect(result.expectedDamageByRound[0]!.expectedTotalDamage).toBeCloseTo(baseline.expectedDamageByRound[0]!.expectedTotalDamage * 1.25, 10);
    expect(result.expectedDamageByRound[1]!.expectedTotalDamage).toBeCloseTo(baseline.expectedDamageByRound[1]!.expectedTotalDamage * 1.25 * (1 + .875 * .5), 8);
    const effect = result.expectedDamageByRound[1]!.expectedActiveEffects.find((active) => active.sourceSkillId === "skill.head.miya.doom-entanglement");
    expect(effect?.activeProbability).toBeCloseTo(.875, 12);
    expect(effect?.expectedStackCount).toBeCloseTo(.875, 12);
  });

  it("格温第6次攻击造成100% extraDamage，第7次攻击用15%易伤覆盖后恢复", () => {
    const gwen = getHeadHeroById("hero.head.gewen")!;
    const specialDamage = gwen.headSkills.find(
      (definition) => definition.id === "head-skill.gewen.special-damage",
    );
    const override = gwen.headSkills.find(
      (definition) => definition.id === "head-skill.gewen.override",
    );
    expect(specialDamage).toMatchObject({ status: "supported" });
    expect(specialDamage?.skill?.effects).toEqual([
      expect.objectContaining({
        type: "extraDamage",
        value: 1,
        basis: "postMultiplierDamage",
        activeRounds: [6],
      }),
    ]);
    expect(specialDamage?.skill?.effects.some((effect) => effect.type === "extraAttack")).toBe(false);
    expect(override?.skill?.trigger).toMatchObject({ triggerRounds: [7] });
    expect(override?.skill?.effects).toEqual([
      expect.objectContaining({
        type: "vulnerable",
        value: .15,
        zoneAggregation: "replace",
      }),
    ]);

    const baseline = calculate();
    const result = calculate({ headFormation: { marksmanHeroId: "hero.head.gewen" } });
    const base = baseline.expectedDamageByRound[0]!.expectedTotalDamage;
    expect(result.expectedDamageByRound[0]!.expectedTotalDamage).toBeCloseTo(base, 10);
    expect(result.expectedDamageByRound[1]!.expectedTotalDamage).toBeCloseTo(base * 1.25, 10);
    expect(result.expectedDamageByRound[5]!.expectedNormalDamage).toBeCloseTo(base * 1.25, 10);
    expect(result.expectedDamageByRound[5]!.expectedExtraDamage).toBeCloseTo(base * 1.25, 10);
    expect(result.expectedDamageByRound[5]!.expectedTotalDamage).toBeCloseTo(base * 2.5, 10);
    expect(result.expectedDamageByRound[5]!.expectedExtraAttackDamage).toBe(0);
    expect(result.expectedDamageByRound[5]!.expectedAttackCount).toBe(0);
    expect(result.expectedDamageByRound[6]!.expectedTotalDamage).toBeCloseTo(base * 1.15, 10);
    expect(result.expectedDamageByRound[6]!.expectedMultipliersByTroop.marksman?.byEffectType.vulnerable).toBeCloseTo(1.15, 12);
    expect(result.expectedDamageByRound[7]!.expectedTotalDamage).toBeCloseTo(base * 1.25, 10);
    expect(result.expectedDamageByRound[8]!.expectedTotalDamage).toBeCloseTo(base * 1.25, 10);
    expect(result.skippedPendingSkills.some((skill) => skill.ownerId === "hero.head.gewen")).toBe(false);
  });

  it("布拉德利对盾25%与远程打击10%在troopVsTroopDamage内加算为1.35", () => {
    const result = calculate({ headFormation: { marksmanHeroId: "hero.head.buladeli" }, preparation: noBuffs });
    expect(result.expectedDamageByRound[0]!.expectedMultipliersByTroop.marksman?.byEffectType.troopVsTroopDamage).toBeCloseTo(1.35, 12);
  });

  it("8弓减防为1.25；10弓穿透和75%extraDamage；11弓攻击与60%extraDamage", () => {
    const hendrick = calculate({ headFormation: { marksmanHeroId: "hero.head.hengdelike" } });
    expect(hendrick.expectedDamageByRound[0]!.expectedMultipliersByTroop.shield?.byEffectType.defenseReduction).toBe(1.25);
    const blanche = calculate({ headFormation: { marksmanHeroId: "hero.head.bulanqi" } });
    expect(blanche.expectedDamageByRound[0]!.expectedMultipliersByTroop.shield?.byEffectType.penetration).toBe(1.25);
    for (const round of blanche.expectedDamageByRound) {
      expect(round.expectedExtraDamage).toBeCloseTo(
        [3, 6, 9].includes(round.round) ? round.expectedNormalDamage * .75 : 0,
        8,
      );
    }
    const rufus = calculate({ headFormation: { marksmanHeroId: "hero.head.lufusi" } });
    expect(rufus.expectedDamageByRound[0]!.expectedMultipliersByTroop.shield?.byEffectType.attack).toBe(1.25);
    expect(rufus.expectedExtraDamage).toBeCloseTo(rufus.expectedNormalDamage * .60, 8);
  });

  it("格雷格、阿隆索、琳恩、米娅和韦恩车身均按确认规则supported", () => {
    for (const id of ["hero.body.geleige","hero.body.alongsuo","hero.body.linnen","hero.body.miya","hero.body.weien"] as const) expect(getHeroById(id)?.status).toBe("supported");
  });
});

describe("兵种技能与火晶技能", () => {
  it("连射保留原始extraAttack语义，正式T7+熊模型映射为10%期望extraDamage", () => {
    expect(getTroopTierSkills().map((skill) => skill.name)).toContain("连射");
    expect(getFireCrystalSkills().map((skill) => skill.name)).not.toContain("连射");
    const troops = (level: "T6" | "T7" | "T10") => [{ ...baseTroops[2]!, troopLevelId: level }];
    expect(resolveAutomaticTroopSkills(troops("T6")).some((skill) => skill.id.includes("rapid-fire"))).toBe(false);
    for (const level of ["T7", "T10"] as const) {
      const skill = resolveAutomaticTroopSkills(troops(level)).find((entry) => entry.id.includes("rapid-fire"))!;
      expect(skill).toMatchObject({
        trigger: { type: "always" },
        rawMechanicType: "extraAttack",
        bearModelType: "extraDamageExpected",
      });
      expect(skill.effects[0]).toMatchObject({ type: "extraDamage", value: .10 });
    }
    expect(getTroopTierSkills()[0]?.effects[0]?.type).toBe("extraAttack");
  });

  it("燃晶火药与火焰冲击按FC3/5/8/10自动升级且联动不合并为全局倍率", () => {
    const skillsAt = (level: "T10-FC3"|"T10-FC5"|"T10-FC8"|"T10-FC10") => resolveAutomaticTroopSkills([{ ...baseTroops[2]!, troopLevelId: level }]);
    expect(skillsAt("T10-FC3").find((skill) => skill.name === "燃晶火药")?.trigger).toMatchObject({ probability: .2 });
    expect(skillsAt("T10-FC5").find((skill) => skill.name === "燃晶火药")?.trigger).toMatchObject({ probability: .3 });
    expect(skillsAt("T10-FC8").find((skill) => skill.name === "火焰冲击")?.effects[0]?.value).toBe(.04);
    expect(skillsAt("T10-FC8").find((skill) => skill.name === "燃晶火药")?.effects.map((effect) => effect.value)).toEqual([.5,.25]);
    expect(skillsAt("T10-FC10").find((skill) => skill.name === "火焰冲击")?.effects[0]?.value).toBe(.06);
    expect(skillsAt("T10-FC10").find((skill) => skill.name === "燃晶火药")?.effects.map((effect) => effect.value)).toEqual([.5,.375]);
  });

  it("炽火燧星按等级直接在round6-10生效，不在战斗中叠层", () => {
    for (const [level, value] of [[1,.005],[10,.05],[24,.12]] as const) {
      const skill = resolveAutomaticTroopSkills(baseTroops, { marksmanBlazingStarLevel: level }).find((entry) => entry.name.includes("炽火燧星"))!;
      expect(skill.effects[0]).toMatchObject({ value, activeRounds: [6,7,8,9,10] });
      expect(skill.lifecycle).toBeUndefined();
    }
  });

  it("烈辉战阵L24仅round1-5；炎晶战矛FC3/FC5概率为10%/15%且不是额外攻击", () => {
    const t12 = resolveAutomaticTroopSkills([{ ...baseTroops[1]!, troopLevelId: "T12-FC10" }], { lancerT12SkillLevel: 24 });
    expect(t12.find((skill) => skill.name === "烈辉战阵（矛T12技能）")?.effects[0]).toMatchObject({ type: "baseDamageIncrease", value: .24, activeRounds: [1,2,3,4,5] });
    for (const [level, probability] of [["T10-FC3",.10],["T10-FC5",.15]] as const) {
      const skill = resolveAutomaticTroopSkills([{ ...baseTroops[1]!, troopLevelId: level }]).find((entry) => entry.name === "炎晶战矛")!;
      expect(skill.trigger).toMatchObject({ probability });
      expect(skill.effects[0]).toMatchObject({ type: "extraDamage", value: 1 });
      expect(skill.effects.some((effect) => effect.type === "extraAttack")).toBe(false);
    }
  });
});
