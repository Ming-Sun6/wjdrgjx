import { describe, expect, it } from "vitest";
import type { HeadHeroDefinition, HeadHeroId } from "../domain/hero";
import type { TenRoundExpectedDamageDependencies } from "../domain/tenRoundExpectedDamage";
import type { TroopSkillDefinition } from "../domain/troopSkill";
import { bodyHeroCatalog } from "../game-data/heroes/bodyHeroCatalog";
import { headHeroCatalog } from "../game-data/heroes/headHeroCatalog";
import { getTroopSkillById } from "../game-data/troop-skills/troopSkillQueries";
import { calculateBattleDamage } from "./calculateBattleDamage";
import {
  calculateTenRoundExpectedDamage,
  createTenRoundExpectedDamageCalculator,
} from "./calculateTenRoundExpectedDamage";

const input = {
  troops: [
    {
      troopType: "marksman" as const,
      troopLevelId: "T10" as const,
      troopCount: 10_000,
      stats: { attackPercent: 400, penetrationPercent: 100 },
    },
  ],
  bodyHeroIds: [],
};

function syntheticHeadHero(): HeadHeroDefinition {
  const supportedSkill = {
    id: "skill.head.synthetic.attack",
    name: "测试车头攻击",
    status: "supported" as const,
    trigger: { type: "always" as const },
    effects: [
      {
        type: "attack" as const,
        value: 0.1,
        targetTroop: "all" as const,
        status: "supported" as const,
      },
    ],
  };
  return {
    id: "hero.head.synthetic",
    name: "测试车头",
    tier: null,
    generation: null,
    role: "head",
    troopType: "shield",
    bodySkill: null,
    notes: ["测试专用。"],
    source: "synthetic-test",
    headSkills: [
      {
        id: "head-skill.synthetic.attack",
        name: "测试车头攻击",
        status: "supported",
        supported: true,
        skill: supportedSkill,
        effectData: [
          {
            id: "effect.head.synthetic.attack",
            status: "supported",
            type: "attack",
            value: 0.1,
            targetTroop: "all",
            trigger: { type: "always" },
            rawDescription: "全军攻击提升10%。",
          },
        ],
        rawDescription: "全军攻击提升10%。",
        notes: ["测试专用。"],
      },
      {
        id: "head-skill.synthetic.pending",
        name: "测试待确认技能",
        status: "pending",
        supported: false,
        skill: null,
        effectData: [],
        rawDescription: "规则待确认。",
        pendingReason: "测试专用：规则待确认。",
        notes: ["测试专用：规则待确认。"],
      },
    ],
  };
}

function supportedFireSkill(
  effect: TroopSkillDefinition["effects"][number],
): TroopSkillDefinition {
  return {
    id: "troop-skill.synthetic.supported",
    name: "测试火晶技能",
    troopType: "marksman",
    level: 1,
    status: "supported",
    effects: [effect],
    trigger: { type: "always" },
    rawDescription: effect.rawDescription,
    notes: ["测试专用。"],
    source: "synthetic-test",
  };
}

function calculatorWith(options: {
  readonly headHero?: HeadHeroDefinition;
  readonly troopSkill?: TroopSkillDefinition;
}) {
  const dependencies: TenRoundExpectedDamageDependencies = {
    heroCatalog: bodyHeroCatalog,
    headHeroCatalog: options.headHero === undefined
      ? headHeroCatalog
      : {
          get: (heroId: HeadHeroId) =>
            heroId === options.headHero!.id ? options.headHero : undefined,
        },
    getTroopSkillById: (skillId) =>
      skillId === options.troopSkill?.id
        ? options.troopSkill
        : getTroopSkillById(skillId),
  };
  return createTenRoundExpectedDamageCalculator(dependencies);
}

describe("第二十一步真实技能十回合入口", () => {
  it("无英雄时自动兵种技能仍逐回合一致", () => {
    const result = calculateTenRoundExpectedDamage(input);

    expect(result.expectedDamageByRound).toHaveLength(10);
    expect(result.expectedTotalDamage).toBeCloseTo(
      result.expectedDamageByRound[0]!.expectedTotalDamage * 10,
      9,
    );
    expect(result.appliedSkills.some((skill) => skill.source === "troopTierSkill")).toBe(true);
    expect(result.skippedPendingSkills).toEqual([]);
  });

  it("确定性body attack技能在10回合持续生效", () => {
    const baseline = calculateTenRoundExpectedDamage(input)
      .expectedDamageByRound[0]!.expectedTotalDamage;
    const result = calculateTenRoundExpectedDamage({
      ...input,
      bodyHeroIds: ["hero.body.shuyun"],
    });

    expect(result.expectedDamageByRound.every(
      (round) => Math.abs(round.expectedTotalDamage - baseline * 1.25) < 1e-9,
    )).toBe(true);
    expect(result.appliedSkills.filter((skill) => skill.source === "body")).toHaveLength(1);
  });

  it("supported车头技能通过HeadFormation进入全部10回合", () => {
    const result = calculatorWith({ headHero: syntheticHeadHero() })({
      ...input,
      headFormation: { shieldHeroId: "hero.head.synthetic" },
    });

    expect(result.expectedDamageByRound.every(
      (round) =>
        round.expectedMultipliersByTroop.marksman?.byEffectType.attack === 1.1,
    )).toBe(true);
    expect(result.appliedSkills.some((skill) => skill.source === "head")).toBe(true);
  });

  it("同一车头supported技能参与，pending技能只出现在跳过报告", () => {
    const result = calculatorWith({ headHero: syntheticHeadHero() })({
      ...input,
      headFormation: { shieldHeroId: "hero.head.synthetic" },
    });

    expect(result.appliedSkills.map((skill) => skill.skillName)).toContain("测试车头攻击");
    expect(result.skippedPendingSkills).toContainEqual(
      expect.objectContaining({
        source: "head",
        skillName: "测试待确认技能",
        status: "pending",
      }),
    );
  });

  it("敌方shield条件通过BattleContext匹配，不使用技能名特判", () => {
    const conditional = supportedFireSkill({
      id: "effect.synthetic.vs-shield",
      status: "supported",
      type: "marksmanDamage",
      value: 0.1,
      targetTroop: "marksman",
      targetEnemyTroop: "shield",
      trigger: { type: "always" },
      conditions: [{ type: "enemyTroopType", troopType: "shield" }],
      rawDescription: "射手对盾兵伤害提升10%。",
    });
    const baseline = calculateTenRoundExpectedDamage(input).expectedTotalDamage;
    const result = calculatorWith({ troopSkill: conditional })({
      ...input,
      fireCrystal: { skillIds: [conditional.id] },
    });

    expect(result.expectedTotalDamage).toBeCloseTo(baseline * 1.1, 9);
    expect(result.appliedSkills).toContainEqual(
      expect.objectContaining({ source: "fireCrystal", skillName: "测试火晶技能" }),
    );
  });

  it("远程打击已转supported并正式进入对盾乘区", () => {
    const baseline = calculateTenRoundExpectedDamage(input);
    const result = calculateTenRoundExpectedDamage({
      ...input,
      fireCrystal: {
        skillIds: ["troop-skill.marksman.remote-strike"],
      },
    });

    expect(result.expectedTotalDamage).toBeCloseTo(baseline.expectedTotalDamage, 10);
    expect(result.appliedSkills).toContainEqual(
      expect.objectContaining({
        source: "fireCrystal",
        recordId: "troop-skill.marksman.remote-strike",
      }),
    );
    expect(result.skippedPendingSkills).toEqual([]);
  });

  it("defenseReduction严格保持25%=1.25、25%+10%=1.35", () => {
    const tenPercent = supportedFireSkill({
      id: "effect.synthetic.defense-reduction",
      status: "supported",
      type: "defenseReduction",
      value: 0.1,
      targetTroop: "all",
      trigger: { type: "always" },
      rawDescription: "敌方防御降低10%。",
    });
    const calculator = calculatorWith({ troopSkill: tenPercent });
    const one = calculator({ ...input, bodyHeroIds: ["hero.body.hengdelike"] });
    const combined = calculator({
      ...input,
      bodyHeroIds: ["hero.body.hengdelike"],
      fireCrystal: { skillIds: [tenPercent.id] },
    });

    expect(
      one.expectedDamageByRound[0]?.expectedMultipliersByTroop.marksman
        ?.byEffectType.defenseReduction,
    ).toBe(1.25);
    expect(
      combined.expectedDamageByRound[0]?.expectedMultipliersByTroop.marksman
        ?.byEffectType.defenseReduction,
    ).toBe(1.35);
    expect(
      combined.expectedDamageByRound[0]?.enemyDefense
        .expectedEffectiveDefenseByTroop.marksman,
    ).toBeUndefined();
  });
});
