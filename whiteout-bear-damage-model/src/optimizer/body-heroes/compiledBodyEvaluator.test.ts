import { describe, expect, it } from "vitest";
import { calculateTenRoundExpectedDamage } from "../../app/calculateTenRoundExpectedDamage";
import type { BodySkillOptionId } from "../../domain/bodySkillOption";
import type { TenRoundExpectedDamageInput } from "../../domain/tenRoundExpectedDamage";
import { getAllBodySkillOptions } from "../../game-data/body-skills";
import {
  compileBodyEffect,
  compileBodySkillOptions,
  scoreBodyFast,
  scoreBodyTroopsFast,
  simulateCompiledBodyDetails,
  tryCreateStaticBodyBattleContext,
} from "./compiledBodyEvaluator";

const input: TenRoundExpectedDamageInput = {
  troops: [
    { troopType: "shield", troopLevelId: "T6", troopCount: 10_001, stats: { attackPercent: 400, penetrationPercent: 100 } },
    { troopType: "lancer", troopLevelId: "T6", troopCount: 20_003, stats: { attackPercent: 420, penetrationPercent: 110 } },
    { troopType: "marksman", troopLevelId: "T6", troopCount: 30_007, stats: { attackPercent: 440, penetrationPercent: 120 } },
  ],
  bodyHeroIds: [],
};

describe("车身编译期望评分器", () => {
  it.each([
    ["两个常驻攻击", ["body-skill.attack-25", "body-skill.attack-25"]],
    ["两个独立概率穿透", ["body-skill.probability-penetration-50", "body-skill.probability-penetration-50"]],
    ["两个下一回合概率易伤", ["body-skill.probability-vulnerable-50", "body-skill.probability-vulnerable-50"]],
    ["两个刷新型格雷格", ["body-skill.greg-damage-40", "body-skill.greg-damage-40"]],
    ["四种独立乘区混合", [
      "body-skill.attack-25",
      "body-skill.probability-penetration-50",
      "body-skill.probability-vulnerable-50",
      "body-skill.greg-damage-40",
    ]],
  ] as const)("%s与正式概率状态机逐回合一致", (_label, optionIds) => {
    compareCompiledWithFormal(input, optionIds);
  });

  it("格温第8回合replace会屏蔽车身普通易伤，而不是与之相加", () => {
    compareCompiledWithFormal(
      {
        ...input,
        headFormation: { marksmanHeroId: "hero.head.gewen" },
      },
      ["body-skill.vulnerable-25"],
    );
  });

  it("两个米娅车身在编译路径中合并概率而不叠加易伤幅度", () => {
    const baseline = calculateTenRoundExpectedDamage(input);
    const context = tryCreateStaticBodyBattleContext(input, baseline)!;
    const effect = compileSelected([
      "body-skill.probability-vulnerable-50",
      "body-skill.probability-vulnerable-50",
    ]);
    const compiled = simulateCompiledBodyDetails(context, effect);
    expect(
      compiled.expectedDamageByRound[0]!.expectedMultipliersByTroop.shield
        ?.byEffectType.vulnerable,
    ).toBeCloseTo(1, 12);
    expect(
      compiled.expectedDamageByRound[1]!.expectedMultipliersByTroop.shield
        ?.byEffectType.vulnerable,
    ).toBeCloseTo(1.4921875, 12);
  });

  it("米娅车头1加车身2在compiled fast path与正式引擎一致", () => {
    const withMiaHead = {
      ...input,
      headFormation: { lancerHeroId: "hero.head.miya" as const },
    };
    compareCompiledWithFormal(withMiaHead, [
      "body-skill.probability-vulnerable-50",
      "body-skill.probability-vulnerable-50",
    ]);
    const baseline = calculateTenRoundExpectedDamage({ ...withMiaHead, bodyHeroIds: [] });
    const context = tryCreateStaticBodyBattleContext(
      { ...withMiaHead, bodyHeroIds: [] },
      baseline,
    )!;
    const effect = compileSelected([
      "body-skill.probability-vulnerable-50",
      "body-skill.probability-vulnerable-50",
    ]);
    const compiled = simulateCompiledBodyDetails(context, effect);
    expect(
      compiled.expectedDamageByRound[1]!.expectedMultipliersByTroop.shield
        ?.byEffectType.vulnerable,
    ).toBeCloseTo(1.4990234375, 12);
  });

  it("纯评分入口只返回number，兵种评分入口不构造逐回合明细", () => {
    const baseline = calculateTenRoundExpectedDamage(input);
    const context = tryCreateStaticBodyBattleContext(input, baseline);
    expect(context).not.toBeNull();
    const effect = compileSelected(["body-skill.attack-25"]);
    const scalar = scoreBodyFast(context!, effect);
    const troops = scoreBodyTroopsFast(context!, effect);
    expect(typeof scalar).toBe("number");
    expect(scalar).toBeCloseTo(troops.totalDamage, 9);
    expect("expectedDamageByRound" in troops).toBe(false);
  });
});

function compareCompiledWithFormal(
  baseInput: TenRoundExpectedDamageInput,
  optionIds: readonly BodySkillOptionId[],
): void {
  const baseline = calculateTenRoundExpectedDamage({ ...baseInput, bodyHeroIds: [] });
  const context = tryCreateStaticBodyBattleContext(
    { ...baseInput, bodyHeroIds: [] },
    baseline,
  );
  expect(context).not.toBeNull();
  const effect = compileSelected(optionIds);
  const formal = calculateTenRoundExpectedDamage({
    ...baseInput,
    bodyHeroIds: effect.representativeHeroIds,
  });
  const compiled = simulateCompiledBodyDetails(context!, effect);

  expect(compiled.totalDamage).toBeCloseTo(formal.expectedTotalDamage, 8);
  expect(compiled.troopDamages.shield).toBeCloseTo(formal.expectedShieldDamage, 8);
  expect(compiled.troopDamages.lancer).toBeCloseTo(formal.expectedLancerDamage, 8);
  expect(compiled.troopDamages.marksman).toBeCloseTo(formal.expectedMarksmanDamage, 8);
  expect(compiled.expectedDamageByRound).toHaveLength(10);
  for (let index = 0; index < 10; index += 1) {
    const fastRound = compiled.expectedDamageByRound[index]!;
    const formalRound = formal.expectedDamageByRound[index]!;
    expect(fastRound.expectedTotalDamage).toBeCloseTo(formalRound.expectedTotalDamage, 8);
    expect(fastRound.expectedShieldDamage).toBeCloseTo(formalRound.expectedShieldDamage, 8);
    expect(fastRound.expectedLancerDamage).toBeCloseTo(formalRound.expectedLancerDamage, 8);
    expect(fastRound.expectedMarksmanDamage).toBeCloseTo(formalRound.expectedMarksmanDamage, 8);
  }
}

function compileSelected(optionIds: readonly BodySkillOptionId[]) {
  const compiled = compileBodySkillOptions(getAllBodySkillOptions());
  return compileBodyEffect(optionIds.map((id) => {
    const option = compiled.find((candidate) => candidate.option.id === id);
    if (option === undefined) throw new Error(`测试缺少车身技能选项：${id}`);
    return option;
  }));
}
