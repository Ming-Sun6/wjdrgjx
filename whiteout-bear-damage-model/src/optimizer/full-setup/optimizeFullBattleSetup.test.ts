import { describe, expect, it } from "vitest";
import { createTenRoundExpectedDamageCalculator } from "../../app/calculateTenRoundExpectedDamage";
import type { FullBattleSetupOptimizationInput } from "../../domain/fullBattleSetupOptimization";
import type { BodyHeroDefinition, HeadHeroCatalog, HeadHeroDefinition, HeadHeroId, HeroId } from "../../domain/hero";
import type { Skill } from "../../domain/skill";
import type { TroopSkillDefinition, TroopSkillId } from "../../domain/troopSkill";
import { createBattleDamageCalculator } from "../../engine/battle/calculateBattleDamage";
import { bodyHeroCatalog } from "../../game-data/heroes/bodyHeroCatalog";
import { getAllBodyHeroes, getHeroById } from "../../game-data/heroes/bodyHeroQueries";
import { headHeroes } from "../../game-data/heroes/headHeroes";
import { optimizeBattleSetup } from "../battle-setup";
import { UnknownFireCrystalLevelError } from "./errors";
import { createFullBattleSetupOptimizer, optimizeFullBattleSetup } from "./optimizeFullBattleSetup";

const jiexi = "hero.body.jiexi" as const;
const shuyun = "hero.body.shuyun" as const;
const suoniya = "hero.body.suoniya" as const;

const troopSettings = {
  shield: {
    troopLevelId: "T10" as const,
    stats: { attackPercent: 400, penetrationPercent: 100 },
  },
  lancer: {
    troopLevelId: "T10" as const,
    stats: { attackPercent: 400, penetrationPercent: 100 },
  },
  marksman: {
    troopLevelId: "T10" as const,
    stats: { attackPercent: 400, penetrationPercent: 100 },
  },
};

const input: FullBattleSetupOptimizationInput = {
  totalTroopCount: 20_000,
  troopSettings,
};

function supportedHead(
  id: HeadHeroId,
  troopType: "shield" | "lancer" | "marksman",
  value: number,
  exclusiveGroupIds?: readonly string[],
): HeadHeroDefinition {
  const skill: Skill = {
    id: `skill.${id}.damage`,
    name: `${id}已支持增伤`,
    status: "supported",
    trigger: { type: "always" },
    effects: [
      {
        type: "damageIncrease",
        value,
        targetTroop: "all",
        status: "supported",
      },
    ],
  };
  return {
    id,
    name: id,
    tier: null,
    generation: null,
    role: "head",
    troopType,
    bodySkill: null,
    headSkills: [
      {
        id: `head-skill.${id}.damage`,
        name: skill.name,
        status: "supported",
        supported: true,
        skill,
        effectData: [
          {
            id: `effect.${id}.damage`,
            status: "supported",
            type: "damageIncrease",
            value,
            targetTroop: "all",
            trigger: { type: "always" },
            rawDescription: `测试增伤${value}。`,
          },
        ],
        rawDescription: `测试增伤${value}。`,
        notes: ["synthetic"],
      },
    ],
    notes: ["synthetic"],
    ...(exclusiveGroupIds === undefined ? {} : { exclusiveGroupIds }),
  };
}

function pendingHead(
  id: HeadHeroId,
  troopType: "shield" | "lancer" | "marksman",
): HeadHeroDefinition {
  const pendingSkill: Skill = {
    id: `skill.${id}.pending`,
    name: `${id}待确认1000%`,
    status: "pending",
    trigger: { type: "always" },
    effects: [
      {
        type: "damageIncrease",
        value: 10,
        status: "pending",
        pendingReason: "测试：规则未知。",
      },
    ],
  };
  return {
    id,
    name: id,
    tier: null,
    generation: null,
    role: "head",
    troopType,
    bodySkill: null,
    headSkills: [
      {
        id: `head-skill.${id}.pending`,
        name: pendingSkill.name,
        status: "pending",
        supported: false,
        skill: pendingSkill,
        effectData: [
          {
            id: `effect.${id}.pending`,
            status: "pending",
            type: "damageIncrease",
            value: 10,
            trigger: { type: "always" },
            rawDescription: "测试待确认1000%。",
            pendingReason: "测试：规则未知。",
          },
        ],
        rawDescription: "测试待确认1000%。",
        pendingReason: "测试：规则未知。",
        notes: ["测试：规则未知。"],
      },
    ],
    notes: ["synthetic"],
  };
}

function fireSkill(
  id: TroopSkillId,
  value: number,
  level: number | null = 1,
): TroopSkillDefinition {
  return {
    id,
    name: id,
    troopType: "marksman",
    level,
    status: "supported",
    trigger: { type: "always" },
    effects: [
      {
        id: `effect.${id}`,
        status: "supported",
        type: "damageIncrease",
        value,
        targetTroop: "all",
        trigger: { type: "always" },
        rawDescription: `测试火晶增伤${value}。`,
      },
    ],
    rawDescription: `测试火晶增伤${value}。`,
    notes: ["synthetic"],
    source: "synthetic-test",
  };
}

function syntheticOptimizer(
  heads: readonly HeadHeroDefinition[],
  fires: readonly TroopSkillDefinition[],
) {
  const headById = new Map(heads.map((hero) => [hero.id, hero]));
  const fireById = new Map(fires.map((skill) => [skill.id, skill]));
  const headCatalog: HeadHeroCatalog = {
    get: (heroId) => headById.get(heroId),
  };
  const getTroopSkillById = (skillId: TroopSkillId) => fireById.get(skillId);
  const calculateExpected = createTenRoundExpectedDamageCalculator({
    heroCatalog: bodyHeroCatalog,
    headHeroCatalog: headCatalog,
    getTroopSkillById,
  });
  const calculateSingle = createBattleDamageCalculator({
    heroCatalog: bodyHeroCatalog,
    headHeroCatalog: headCatalog,
  });

  return createFullBattleSetupOptimizer({
    calculateSingleRoundDamage: calculateSingle,
    calculateTenRoundExpectedDamage: calculateExpected,
    getBodyHeroById: (heroId) => {
      const hero = getHeroById(heroId as HeroId);
      return hero?.role === "body" ? hero : undefined;
    },
    getAllBodyHeroes,
    getAllHeadHeroes: () => heads,
    getHeadHeroById: (heroId) => headById.get(heroId),
    getAllTroopSkills: () => fires,
    getTroopSkillById,
  });
}

describe("第二十三步完整阵容优化器", () => {
  it("head/fire固定为空时与第二十二步联合优化结果一致", () => {
    const legacyDimensions = optimizeBattleSetup(input, {
      ratioStepPercent: 100,
      bodyCount: 1,
      topK: 6,
      candidateHeroIds: [shuyun, suoniya],
    });
    const full = optimizeFullBattleSetup(input, {
      ratio: { mode: "optimize", stepPercent: 100 },
      body: { mode: "optimize", bodyCount: 1, candidateHeroIds: [shuyun, suoniya] },
      head: {},
      fireCrystal: { mode: "fixed" },
      topK: 6,
    });

    expect(full.results.map((candidate) => ({
      ratios: candidate.ratios,
      bodyHeroIds: candidate.bodyHeroIds,
      score: candidate.score,
    }))).toEqual(legacyDimensions.results.map((candidate) => ({
      ratios: candidate.ratios,
      bodyHeroIds: candidate.heroIds,
      score: candidate.score,
    })));
  });

  it("两个synthetic车头中选择supported增伤20%的Head B", () => {
    const a = supportedHead("hero.head.synthetic-a", "shield", 0.1);
    const b = supportedHead("hero.head.synthetic-b", "shield", 0.2);
    const result = syntheticOptimizer([a, b], [])(input, {
      ratio: { mode: "fixed", ratios: { shield: 0, lancer: 0, marksman: 100 } },
      body: { mode: "fixed", heroIds: [] },
      head: {
        shield: { mode: "optimize", candidateHeroIds: [a.id, b.id], includeEmpty: false },
      },
      fireCrystal: { mode: "fixed" },
      topK: 2,
    });

    expect(result.headCombinationCount).toBe(2);
    expect(result.results[0]?.headFormation.shieldHeroId).toBe(b.id);
  });

  it("pending +1000%车头不参与评分且在结果中报告", () => {
    const supported = supportedHead("hero.head.supported-small", "shield", 0.1);
    const pending = pendingHead("hero.head.pending-huge", "shield");
    const result = syntheticOptimizer([supported, pending], [])(input, {
      ratio: { mode: "fixed", ratios: { shield: 0, lancer: 0, marksman: 100 } },
      body: { mode: "fixed", heroIds: [] },
      head: {
        shield: {
          mode: "optimize",
          candidateHeroIds: [supported.id, pending.id],
          includeEmpty: false,
        },
      },
      fireCrystal: { mode: "fixed" },
      topK: 2,
    });

    expect(result.results[0]?.headFormation.shieldHeroId).toBe(supported.id);
    const pendingResult = result.results.find(
      (candidate) => candidate.headFormation.shieldHeroId === pending.id,
    )!;
    expect(pendingResult.skippedPendingSkills).toContainEqual(
      expect.objectContaining({ source: "head", status: "pending" }),
    );
  });

  it("exclusiveGroupIds数据驱动过滤跨槽非法车头组合", () => {
    const shieldBlocked = supportedHead(
      "hero.head.exclusive-shield",
      "shield",
      0.3,
      ["exclusive.synthetic"],
    );
    const shieldAllowed = supportedHead("hero.head.allowed-shield", "shield", 0.1);
    const lancerBlocked = supportedHead(
      "hero.head.exclusive-lancer",
      "lancer",
      0.2,
      ["exclusive.synthetic"],
    );
    const result = syntheticOptimizer(
      [shieldBlocked, shieldAllowed, lancerBlocked],
      [],
    )(input, {
      ratio: { mode: "fixed", ratios: { shield: 0, lancer: 0, marksman: 100 } },
      body: { mode: "fixed", heroIds: [] },
      head: {
        shield: {
          mode: "optimize",
          candidateHeroIds: [shieldBlocked.id, shieldAllowed.id],
          includeEmpty: false,
        },
        lancer: {
          mode: "optimize",
          candidateHeroIds: [lancerBlocked.id],
          includeEmpty: false,
        },
      },
      fireCrystal: { mode: "fixed" },
    });

    expect(result.skippedIncompatibleHeadCombinationCount).toBe(1);
    expect(result.headCombinationCount).toBe(1);
    expect(result.results[0]?.headFormation).toEqual({
      shieldHeroId: shieldAllowed.id,
      lancerHeroId: lancerBlocked.id,
    });
  });

  it("火晶配置优化选择supported +10%而不是+5%", () => {
    const a = fireSkill("troop-skill.synthetic-fc-a", 0.05);
    const b = fireSkill("troop-skill.synthetic-fc-b", 0.1);
    const result = syntheticOptimizer([], [a, b])(input, {
      ratio: { mode: "fixed", ratios: { shield: 0, lancer: 0, marksman: 100 } },
      body: { mode: "fixed", heroIds: [] },
      fireCrystal: {
        mode: "optimize",
        includeEmpty: false,
        allowedConfigurations: [
          { id: "fc-a", settings: { skillIds: [a.id] } },
          { id: "fc-b", settings: { skillIds: [b.id] } },
        ],
      },
      topK: 2,
    });

    expect(result.fireCrystalConfigurationCount).toBe(2);
    expect(result.results[0]?.fireCrystalConfiguration.id).toBe("fc-b");
  });

  it("2×2×2×2完整空间评估16项且top1等于手工全量最大值", () => {
    const headA = supportedHead("hero.head.full-a", "shield", 0.05);
    const headB = supportedHead("hero.head.full-b", "shield", 0.1);
    const fireA = fireSkill("troop-skill.full-a", 0.04);
    const fireB = fireSkill("troop-skill.full-b", 0.08);
    const optimize = syntheticOptimizer([headA, headB], [fireA, fireB]);
    const ratios = [
      { shield: 0, lancer: 50, marksman: 50 },
      { shield: 0, lancer: 0, marksman: 100 },
    ] as const;
    const fires = [
      { id: "full-fc-a", settings: { skillIds: [fireA.id] } },
      { id: "full-fc-b", settings: { skillIds: [fireB.id] } },
    ] as const;
    const result = optimize(input, {
      ratio: { mode: "optimize", allowedRatios: ratios },
      body: { mode: "optimize", bodyCount: 1, candidateHeroIds: [jiexi, shuyun] },
      head: {
        shield: {
          mode: "optimize",
          candidateHeroIds: [headA.id, headB.id],
          includeEmpty: false,
        },
      },
      fireCrystal: {
        mode: "optimize",
        includeEmpty: false,
        allowedConfigurations: fires,
      },
      topK: 16,
      performanceWarningThreshold: 10,
    });
    const manual = ratios.flatMap((ratiosCandidate) =>
      [jiexi, shuyun].flatMap((bodyHeroId) =>
        [headA, headB].flatMap((head) =>
          fires.map((fire) => {
            const ideal = {
              shield: input.totalTroopCount * ratiosCandidate.shield / 100,
              lancer: input.totalTroopCount * ratiosCandidate.lancer / 100,
              marksman: input.totalTroopCount * ratiosCandidate.marksman / 100,
            };
            return {
              ratios: ratiosCandidate,
              bodyHeroId,
              headHeroId: head.id,
              fireId: fire.id,
              score: createTenRoundExpectedDamageCalculator({
                heroCatalog: bodyHeroCatalog,
                headHeroCatalog: { get: (id) => [headA, headB].find((item) => item.id === id) },
                getTroopSkillById: (id) => [fireA, fireB].find((item) => item.id === id),
              })({
                troops: (["shield", "lancer", "marksman"] as const).map((troopType) => ({
                  troopType,
                  troopCount: ideal[troopType],
                  ...troopSettings[troopType],
                })),
                bodyHeroIds: [bodyHeroId],
                headFormation: { shieldHeroId: head.id },
                fireCrystal: fire.settings,
              }).expectedTotalDamage,
            };
          }),
        ),
      ),
    ).sort((left, right) => right.score - left.score);

    expect(result.cartesianCandidateCount).toBe(16);
    expect(result.evaluatedCandidateCount).toBe(16);
    expect(result.performanceWarning).toContain("16");
    expect(result.results[0]).toMatchObject({
      ratios: manual[0]!.ratios,
      bodyHeroIds: [manual[0]!.bodyHeroId],
      headFormation: { shieldHeroId: manual[0]!.headHeroId },
      fireCrystalConfiguration: { id: manual[0]!.fireId },
    });
    expect(result.results[0]?.score).toBeCloseTo(manual[0]!.score, 10);
  });

  it("ratio/body/head/fire四个维度都可固定并保持精确单候选", () => {
    const head = supportedHead("hero.head.fixed", "shield", 0.1);
    const fire = fireSkill("troop-skill.fixed", 0.1);
    const result = syntheticOptimizer([head], [fire])(input, {
      ratio: { mode: "fixed", ratios: { shield: 0, lancer: 0, marksman: 100 } },
      body: { mode: "fixed", heroIds: [jiexi, jiexi] },
      head: { shield: { mode: "fixed", fixedHeroId: head.id } },
      fireCrystal: {
        mode: "fixed",
        configuration: { id: "fixed", settings: { skillIds: [fire.id] } },
      },
      topK: 1,
    });

    expect(result.cartesianCandidateCount).toBe(1);
    expect(result.evaluatedCandidateCount).toBe(1);
    expect(result.results[0]?.bodyHeroIds).toEqual([jiexi, jiexi]);
    expect(result.results[0]?.headFormation.shieldHeroId).toBe(head.id);
    expect(result.results[0]?.fireCrystalConfiguration.id).toBe("fixed");
  });

  it("未知火晶等级在等级范围搜索时明确报错，不进行插值", () => {
    const unknownLevel = fireSkill("troop-skill.unknown-level", 0.1, null);
    const optimize = syntheticOptimizer([], [unknownLevel]);

    expect(() => optimize(input, {
      ratio: { mode: "fixed", ratios: { shield: 0, lancer: 0, marksman: 100 } },
      body: { mode: "fixed", heroIds: [] },
      fireCrystal: {
        mode: "optimize",
        includeEmpty: false,
        minLevel: 1,
        allowedConfigurations: [
          { id: "unknown", settings: { skillIds: [unknownLevel.id] } },
        ],
      },
    })).toThrow(UnknownFireCrystalLevelError);
  });

  it("真实赫克托与尼莫互斥组来自数据配置而非姓名判断", () => {
    expect(headHeroes["hero.head.heketuo"].exclusiveGroupIds).toEqual([
      "head-exclusive.shield-primary",
    ]);
    expect(headHeroes["hero.head.nimo"].exclusiveGroupIds).toEqual([
      "head-exclusive.shield-primary",
    ]);
  });

  it("尼莫以三个远征技能进入车头优化，但探险技能不进入", () => {
    const result = optimizeFullBattleSetup(input, {
      ratio: { mode: "fixed", ratios: { shield: 100, lancer: 0, marksman: 0 } },
      body: { mode: "fixed", heroIds: [] },
      head: {
        shield: {
          mode: "optimize",
          candidateHeroIds: ["hero.head.nimo"],
          includeEmpty: false,
        },
      },
      fireCrystal: { mode: "fixed" },
      topK: 1,
    });
    expect(result.results[0]?.headFormation.shieldHeroId).toBe("hero.head.nimo");
    const appliedNames = result.results[0]?.battleResult.appliedSkills?.map((skill) => skill.skillName) ?? [];
    expect(appliedNames).toEqual(expect.arrayContaining(["战前宣言（5级）", "剑术指导（5级）", "精湛剑术（5级）"]));
    for (const name of ["三断斩", "剑气", "孤傲"]) expect(appliedNames).not.toContain(name);
  });

  it("弗林特作为正式盾兵车头候选进入完整10回合优化评分", () => {
    const result = optimizeFullBattleSetup(input, {
      ratio: { mode: "fixed", ratios: { shield: 100, lancer: 0, marksman: 0 } },
      body: { mode: "fixed", heroIds: [] },
      head: {
        shield: {
          mode: "optimize",
          candidateHeroIds: ["hero.head.fulinte"],
          includeEmpty: false,
        },
      },
      fireCrystal: { mode: "fixed" },
      topK: 1,
    });
    const best = result.results[0];
    expect(best).toBeDefined();
    if (!best) {
      throw new Error("expected Flint to produce one optimized setup");
    }
    expect(best.headFormation.shieldHeroId).toBe("hero.head.fulinte");
    expect(best.expectedDamageByRound).toHaveLength(10);
    expect((best.battleResult.appliedSkills ?? []).map((skill) => skill.skillName)).toEqual(
      expect.arrayContaining(["野火燎原（5级）", "燃烧意志（5级）", "无尽烈火（5级）"]),
    );
  });
});
