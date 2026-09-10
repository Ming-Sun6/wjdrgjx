import { describe, expect, it } from "vitest";
import { calculateTenRoundExpectedDamage } from "../app/calculateTenRoundExpectedDamage";
import type { TenRoundExpectedDamageInput } from "../domain/tenRoundExpectedDamage";
import { generateHeadFormationCandidates } from "../optimizer/full-setup/generateHeadFormationCandidates";
import { formatHeadHeroOptionLabel, headHeroOptions } from "../ui/model";
import { getAllHeadHeroes, getHeadHeroById } from "./heroes/headHeroQueries";
import { headHeroCatalog } from "./heroes/headHeroCatalog";
import { resolveAutomaticTroopSkills } from "./troop-skills/automaticTroopSkills";

const troops: TenRoundExpectedDamageInput["troops"] = [
  { troopType: "shield", troopCount: 10_000, troopLevelId: "T6", stats: { attackPercent: 0, penetrationPercent: 0 } },
  { troopType: "lancer", troopCount: 10_000, troopLevelId: "T6", stats: { attackPercent: 0, penetrationPercent: 0 } },
  { troopType: "marksman", troopCount: 10_000, troopLevelId: "T6", stats: { attackPercent: 0, penetrationPercent: 0 } },
];
const calculate = (marksmanHeroId?: `hero.head.${string}`, includeDamageDistribution = false) =>
  calculateTenRoundExpectedDamage(
    {
      troops,
      bodyHeroIds: [],
      ...(marksmanHeroId === undefined ? {} : { headFormation: { marksmanHeroId } }),
    },
    { includeDamageDistribution },
  );
const supportedSkill = (heroId: `hero.head.${string}`, recordId: string) => {
  const definition = getHeadHeroById(heroId)!.headSkills.find((entry) => entry.id === recordId)!;
  if (definition.status !== "supported") throw new Error(`${recordId}不是supported。`);
  return definition.skill;
};

describe("v0.3 射手车头英雄", () => {
  it("津曼以S1射手录入且常驻全军穿透+25%", () => {
    const hero = getHeadHeroById("hero.head.jinman")!;
    expect(hero).toMatchObject({ name: "津曼", generation: 1, troopType: "marksman" });
    expect(hero.headSkills[0]?.skill?.effects[0]).toMatchObject({ type: "penetration", value: .25, targetTroop: "all" });
  });

  it("格雷格以S3录入，20%概率增伤40%持续3回合并刷新", () => {
    const hero = getHeadHeroById("hero.head.geleige")!;
    const skill = supportedSkill(hero.id, "head-skill.geleige.damage-refresh");
    expect(hero.generation).toBe(3);
    expect(skill.trigger).toMatchObject({ type: "probability", probability: .2, frequency: "oncePerRound", durationRounds: 3 });
    expect(skill.lifecycle).toEqual({ durationRounds: 3, activationTiming: "immediate", refreshMode: "refresh" });
    expect(calculate(hero.id).expectedRoundDamage[2]?.expectedMultipliersByTroop.shield?.byEffectType.baseDamageIncrease).toBeCloseTo(1 + .488 * .4, 12);
  });

  it("琳恩S4在round4首次享受第一层射手攻击+5%", () => {
    const result = calculate("hero.head.linen");
    const attack = result.expectedRoundDamage.map((round) => round.expectedMultipliersByTroop.marksman!.byEffectType.attack);
    expect(attack).toEqual([1, 1, 1, 1.05, 1.05, 1.05, 1.10, 1.10, 1.10, 1.15]);
  });

  it("韦恩S6只在round4/8产生100%周期extraDamage", () => {
    const result = calculate("hero.head.weien");
    for (const round of result.expectedRoundDamage) {
      const extra = Object.values(round.expectedTroopDamageBreakdowns).reduce((sum, value) => sum + (value?.extraDamage ?? 0), 0);
      expect(extra).toBeCloseTo([4, 8].includes(round.round) ? calculate().expectedRoundDamage[0]!.expectedNormalDamage : 0, 8);
    }
  });

  it("韦恩暴击保留25%、倍率2与normalAttackOnly数据语义", () => {
    const skill = supportedSkill("hero.head.weien", "head-skill.weien.critical");
    expect(skill).toMatchObject({ critProbability: .25, critMultiplier: 2, critAppliesTo: "normalAttackOnly" });
    expect(skill.effects).toEqual([expect.objectContaining({ type: "normalAttackDamageIncrease", value: 1 })]);
  });

  it("韦恩每回合为盾矛射建立三个独立暴击Bernoulli事件", () => {
    const result = calculate("hero.head.weien");
    const events = result.expectedRoundDamage[0]!.instantProbabilityEvents.filter((event) => event.skillId === "skill.head.weien.critical");
    expect(events).toHaveLength(3);
    expect(events.map((event) => event.effects[0]?.targetTroop).sort()).toEqual(["lancer", "marksman", "shield"]);
    for (const troopType of ["shield", "lancer", "marksman"] as const) {
      expect(result.expectedRoundDamage[0]!.expectedMultipliersByTroop[troopType]?.byEffectType.normalAttackDamageIncrease).toBeCloseTo(1.25, 12);
    }
  });

  it("修拉S9在round2/4/6/8/10触发射手extraDamage", () => {
    const result = calculate("hero.head.xiula");
    for (const round of result.expectedRoundDamage) {
      const extra = round.expectedTroopDamageBreakdowns.marksman?.extraDamage ?? 0;
      expect(extra > 0).toBe([2, 4, 6, 8, 10].includes(round.round));
    }
  });

  it("修拉计数技能的25%易伤在下一回合3/5/7/9生效", () => {
    const result = calculate("hero.head.xiula");
    for (const round of result.expectedRoundDamage) {
      expect(round.expectedMultipliersByTroop.shield?.byEffectType.vulnerable).toBe([3, 5, 7, 9].includes(round.round) ? 1.25 : 1);
    }
  });

  it("修拉三技能只提供射手伤害+10%", () => {
    const effect = supportedSkill("hero.head.xiula", "head-skill.xiula.marksman-damage").effects[0];
    expect(effect).toMatchObject({ type: "marksmanDamage", value: .10, targetTroop: "marksman" });
  });

  it("丽姬娅S12的技能2和技能3显式共享同一射手攻击计数器", () => {
    const first = supportedSkill("hero.head.lijijia", "head-skill.lijijia.counter-extra-vulnerable");
    const second = supportedSkill("hero.head.lijijia", "head-skill.lijijia.counter-extra");
    expect(first.normalAttackCounter?.counterId).toBe("counter.lijijia.marksman-normal.shared");
    expect(second.normalAttackCounter).toEqual(first.normalAttackCounter);
  });

  it("丽姬娅同一计数节点的两个100%额伤同区加算为200%", () => {
    const result = calculate("hero.head.lijijia");
    const round2 = result.expectedRoundDamage[1]!;
    expect(round2.expectedTroopDamageBreakdowns.marksman!.extraDamage).toBeCloseTo(round2.expectedTroopDamageBreakdowns.marksman!.normalDamage * 2, 10);
  });

  it("乌尔卡努丝S13二技能复用格温第6次额伤与第7次易伤覆盖语义", () => {
    const gwen = getHeadHeroById("hero.head.gewen")!;
    const ulkarnus = getHeadHeroById("hero.head.wuerkanusi")!;
    const project = (hero: typeof gwen) => hero.headSkills
      .filter((definition) => ["第6次攻击特殊伤害", "第8次攻击易伤覆盖"].includes(definition.name))
      .map((definition) => ({
      name: definition.name,
      trigger: definition.skill?.trigger,
      effects: definition.skill?.effects.map(({ rawDescription: _raw, status: _status, ...effect }) => effect),
      }));
    expect(project(ulkarnus)).toEqual(project(gwen));
  });

  it("乌尔卡努丝三技能只在round3/6/9提供减防60%和射手攻击60%", () => {
    const result = calculate("hero.head.wuerkanusi");
    for (const round of result.expectedRoundDamage) {
      const active = [3, 6, 9].includes(round.round);
      expect(round.expectedMultipliersByTroop.shield?.byEffectType.defenseReduction).toBe(active ? 1.6 : 1);
      expect(round.expectedMultipliersByTroop.marksman?.byEffectType.attack).toBe(active ? 1.6 : 1);
    }
  });

  it("卡拉S14常驻全军普通攻击伤害+30%", () => {
    const skill = supportedSkill("hero.head.kala", "head-skill.kala.normal-attack");
    expect(skill.effects[0]).toMatchObject({ type: "normalAttackDamageIncrease", value: .30, targetTroop: "all" });
    expect(calculate("hero.head.kala").expectedRoundDamage.every((round) => round.expectedMultipliersByTroop.shield?.byEffectType.normalAttackDamageIncrease === 1.3)).toBe(true);
  });

  it("维薇卡S15每回合建立盾矛射三个独立20% extraDamage判定", () => {
    const result = calculate("hero.head.weiweika");
    const events = result.expectedRoundDamage[0]!.instantProbabilityEvents.filter((event) => event.skillId === "skill.head.weiweika.independent-extra");
    expect(events).toHaveLength(3);
    expect(events.every((event) => event.triggerProbability === .20)).toBe(true);
    expect(events.map((event) => event.effects[0]?.targetTroop).sort()).toEqual(["lancer", "marksman", "shield"]);
  });

  it("维薇卡三技能常驻射手伤害+10%", () => {
    expect(supportedSkill("hero.head.weiweika", "head-skill.weiweika.marksman-damage").effects[0]).toMatchObject({ type: "marksmanDamage", value: .10, targetTroop: "marksman" });
  });

  it("艾诗琳S16二技能仅round3/6/9提供射手伤害+150%", () => {
    const effect = supportedSkill("hero.head.aishilin", "head-skill.aishilin.periodic-marksman-damage").effects[0];
    expect(effect).toMatchObject({ type: "marksmanDamage", value: 1.5, targetTroop: "marksman", activeRounds: [3, 6, 9] });
  });

  it("艾诗琳S16三技能仅round3/6/9提供射手extraDamage+40%", () => {
    const result = calculate("hero.head.aishilin");
    for (const round of result.expectedRoundDamage) {
      expect((round.expectedTroopDamageBreakdowns.marksman?.extraDamage ?? 0) > 0).toBe([3, 6, 9].includes(round.round));
      expect(round.expectedTroopDamageBreakdowns.shield?.extraDamage ?? 0).toBe(0);
    }
  });

  it("所有已知代数的车头select标签严格为英雄名（S代数）", () => {
    for (const hero of headHeroOptions.filter((entry) => entry.generation !== null)) {
      expect(formatHeadHeroOptionLabel(hero)).toBe(`${hero.name}（S${hero.generation}）`);
    }
  });

  it("车头select标签不包含技能描述或状态", () => {
    for (const hero of headHeroOptions) {
      expect(formatHeadHeroOptionLabel(hero)).not.toMatch(/攻击|穿透|伤害|防御|supported|pending|待确认/);
    }
  });

  it("射手T12技能显示为炽火燧星（射T12技能）", () => {
    const skill = resolveAutomaticTroopSkills(troops, { marksmanBlazingStarLevel: 24 }).find((entry) => entry.id === "skill.auto.marksman.blazing-star");
    expect(skill?.name).toBe("炽火燧星（射T12技能） L24");
  });

  it("矛兵T12技能显示为烈辉战阵（矛T12技能）", () => {
    const skill = resolveAutomaticTroopSkills([{ ...troops[1]!, troopLevelId: "T12-FC10" }], { lancerT12SkillLevel: 24 }).find((entry) => entry.id === "skill.auto.lancer.t12");
    expect(skill?.name).toBe("烈辉战阵（矛T12技能）");
  });

  it("本批10名射手车头均无pending且所有可计算技能为5级", () => {
    const ids = ["jinman", "geleige", "linen", "weien", "xiula", "lijijia", "wuerkanusi", "kala", "weiweika", "aishilin"];
    for (const id of ids) {
      const hero = getHeadHeroById(`hero.head.${id}`)!;
      expect(hero.headSkills.some((definition) => definition.status === "pending")).toBe(false);
      expect(hero.headSkills.every((definition) => definition.skill?.level === 5)).toBe(true);
    }
  });

  it("格雷格、琳恩、韦恩与维薇卡随机技能同时进入期望值和95%伤害区间", () => {
    for (const heroId of ["hero.head.geleige", "hero.head.linen", "hero.head.weien", "hero.head.weiweika"] as const) {
      const result = calculate(heroId, true);
      expect(result.expectedTotalDamage).toBeGreaterThan(0);
      expect(result.damageDistribution?.lower95).toBeLessThan(result.damageDistribution!.upper95);

      if (heroId === "hero.head.geleige") {
        expect(result.expectedRoundDamage.some((round) => round.expectedActiveEffects.some(
          (effect) => effect.sourceSkillId === "skill.head.geleige.damage-refresh",
        ))).toBe(true);
      } else {
        expect(result.instantProbabilityEvents.length).toBeGreaterThan(0);
      }
    }
  });

  it("车头优化候选数据源自动包含全部新增射手英雄", () => {
    const candidates = generateHeadFormationCandidates(
      { marksman: { mode: "optimize", includeEmpty: false }, shield: { mode: "fixed" }, lancer: { mode: "fixed" } },
      { getAllHeadHeroes, getHeadHeroById: (id) => headHeroCatalog.get(id) },
    );
    const ids = new Set(candidates.candidates.map((candidate) => candidate.formation.marksmanHeroId));
    for (const id of ["jinman", "geleige", "linen", "weien", "xiula", "lijijia", "wuerkanusi", "kala", "weiweika", "aishilin"]) {
      expect(ids.has(`hero.head.${id}` as `hero.head.${string}`)).toBe(true);
    }
  });
});
