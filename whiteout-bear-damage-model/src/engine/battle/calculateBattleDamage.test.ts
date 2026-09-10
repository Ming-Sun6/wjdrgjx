import { describe, expect, it } from "vitest";
import { calculateBattleDamage } from "../../app/calculateBattleDamage";
import type {
  BattleDamageInput,
  BattleDamageResult,
  BattleTroopDamageResult,
} from "../../domain/battleDamage";
import type {
  BodyHeroId,
  HeroCatalog,
  HeroDefinition,
} from "../../domain/hero";
import type { TroopType } from "../../domain/troop";
import type { Skill } from "../../domain/skill";
import { bodyHeroes } from "../../game-data/heroes/bodyHeroes";
import { calculateBattleDamageFromCatalog } from "./calculateBattleDamage";
import { TooManyBodyHeroesError } from "./errors";

const heroIds = {
  jiexi: "hero.body.jiexi",
  jiesaier: "hero.body.jiesaier",
  shuyun: "hero.body.shuyun",
  hengdelike: "hero.body.hengdelike",
  suoniya: "hero.body.suoniya",
  nuola: "hero.body.nuola",
  gewen: "hero.body.gewen",
  feilande: "hero.body.feilande",
} as const satisfies Record<string, BodyHeroId>;

const baseTroops: BattleDamageInput["troops"] = [
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
];

function calculate(bodyHeroIds: readonly BodyHeroId[]): BattleDamageResult {
  return calculateBattleDamage({
    troops: baseTroops,
    bodyHeroIds,
  });
}

function troop(
  result: BattleDamageResult,
  troopType: TroopType,
): BattleTroopDamageResult {
  const troopResult = result.troopDamages[troopType];

  if (troopResult === undefined) {
    throw new Error(`测试缺少兵种结果：${troopType}`);
  }

  return troopResult;
}

describe("车身英雄配置接入", () => {
  it("完整数据库中的 supported 英雄均可作为纯配置接入", () => {
    expect(Object.keys(bodyHeroes)).toHaveLength(29);

    for (const hero of Object.values(bodyHeroes)) {
      expect(hero.role).toBe("body");
      if (hero.status === "supported") {
        expect(hero.supported).toBe(true);
        expect(["always", "probability", "everyNRounds"]).toContain(hero.skill.trigger.type);
      }
    }
  });
});

describe("确定性四车身乘区计算", () => {
  it("杰西 + 杰塞尔：同穿透乘区加算为 1.50", () => {
    const result = calculate([heroIds.jiexi, heroIds.jiesaier]);
    const shield = troop(result, "shield");

    expect(shield.multipliers.byEffectType.penetration).toBeCloseTo(1.5, 12);
    expect(shield.multipliers.combined).toBeCloseTo(1.5, 12);
  });

  it("杰西 + 书允：穿透与攻击跨乘区相乘", () => {
    const result = calculate([heroIds.jiexi, heroIds.shuyun]);
    const shield = troop(result, "shield");

    expect(shield.multipliers.byEffectType.penetration).toBeCloseTo(1.25, 12);
    expect(shield.multipliers.byEffectType.attack).toBeCloseTo(1.25, 12);
    expect(shield.multipliers.combined).toBeCloseTo(1.25 * 1.25, 12);
  });

  it("书允 + 菲兰德：同攻击乘区加算为 1.40", () => {
    const result = calculate([heroIds.shuyun, heroIds.feilande]);
    const shield = troop(result, "shield");

    expect(shield.multipliers.byEffectType.attack).toBeCloseTo(1.4, 12);
    expect(shield.multipliers.combined).toBeCloseTo(1.4, 12);
  });

  it("两个亨德里克：减防同区加算为 1.50", () => {
    const result = calculate([heroIds.hengdelike, heroIds.hengdelike]);
    const shield = troop(result, "shield");

    expect(shield.multipliers.byEffectType.defenseReduction).toBeCloseTo(
      1.5,
      12,
    );
    expect(shield.multipliers.combined).toBeCloseTo(1.5, 12);
  });

  it("单回合静态入口不擅自计算格温nextRound易伤", () => {
    const result = calculate([heroIds.suoniya, heroIds.gewen]);
    const shield = troop(result, "shield");

    expect(shield.multipliers.byEffectType.baseDamageIncrease).toBeCloseTo(1.2, 12);
    expect(shield.multipliers.byEffectType.vulnerable).toBe(1);
    expect(shield.multipliers.combined).toBeCloseTo(1.2, 12);
  });

  it("诺拉只使射手伤害乘以 1.15", () => {
    const result = calculate([heroIds.nuola]);
    const shield = troop(result, "shield");
    const lancer = troop(result, "lancer");
    const marksman = troop(result, "marksman");

    expect(shield.finalDamage).toBeCloseTo(shield.baseDamage, 12);
    expect(lancer.finalDamage).toBeCloseTo(lancer.baseDamage, 12);
    expect(marksman.finalDamage).toBeCloseTo(marksman.baseDamage * 1.15, 12);
    expect(marksman.multipliers.byEffectType.baseDamageIncrease).toBeCloseTo(
      1.15,
      12,
    );
  });

  it("四个重复杰西被完整保留，穿透乘区为 2.00", () => {
    const result = calculate([
      heroIds.jiexi,
      heroIds.jiexi,
      heroIds.jiexi,
      heroIds.jiexi,
    ]);
    const shield = troop(result, "shield");

    expect(result.selectedBodyHeroes).toHaveLength(4);
    expect(result.selectedBodyHeroes.map((hero) => hero.heroId)).toEqual([
      heroIds.jiexi,
      heroIds.jiexi,
      heroIds.jiexi,
      heroIds.jiexi,
    ]);
    expect(shield.multipliers.byEffectType.penetration).toBeCloseTo(2, 12);
    expect(shield.multipliers.combined).toBeCloseTo(2, 12);
  });

  it("零车身时三个兵种和总伤害均保持基础值", () => {
    const result = calculate([]);

    expect(result.finalDamage).toBeCloseTo(result.baseDamage, 12);
    for (const troopType of ["shield", "lancer", "marksman"] as const) {
      const troopResult = troop(result, troopType);
      expect(troopResult.finalDamage).toBeCloseTo(troopResult.baseDamage, 12);
      expect(troopResult.multipliers.combined).toBe(1);
    }
  });

  it("总伤害等于三个兵种最终伤害之和并保留总基础伤害", () => {
    const result = calculate([
      heroIds.jiexi,
      heroIds.shuyun,
      heroIds.hengdelike,
      heroIds.suoniya,
    ]);
    const shield = troop(result, "shield");
    const lancer = troop(result, "lancer");
    const marksman = troop(result, "marksman");

    expect(result.finalDamage).toBeCloseTo(
      shield.finalDamage + lancer.finalDamage + marksman.finalDamage,
      12,
    );
    expect(result.baseDamage).toBeCloseTo(
      shield.baseDamage + lancer.baseDamage + marksman.baseDamage,
      12,
    );
  });

  it("注入一个新英雄配置即可生效，不需要修改核心引擎", () => {
    const configOnlyHeroId = "hero.body.config-only" as const;
    const configOnlySkill: Skill = {
      id: "skill.body.config-only.attack",
      name: "配置测试攻击",
      effects: [{ type: "attack", value: 0.1, targetTroop: "all" }],
      trigger: { type: "always" },
    };
    const configOnlyHero: HeroDefinition = {
      id: configOnlyHeroId,
      name: "配置测试英雄",
      tier: "C",
      generation: null,
      role: "body",
      status: "supported",
      supported: true,
      troopType: null,
      skill: configOnlySkill,
      bodySkill: configOnlySkill,
      bodySkillDefinition: {
        id: "body-skill-record.hero.body.config-only",
        name: configOnlySkill.name,
        status: "supported",
        supported: true,
        skill: configOnlySkill,
        effectData: [{
          id: "skill.body.config-only.attack.effect.0",
          status: "supported",
          type: "attack",
          value: 0.1,
          targetTroop: "all",
          rawDescription: "配置测试攻击。",
        }],
        rawDescription: "配置测试攻击。",
        notes: ["仅用于验证数据注入。"],
      },
      headSkills: [],
      notes: ["仅用于验证数据注入。"],
    };
    const injectedCatalog: HeroCatalog = {
      get(heroId) {
        return heroId === configOnlyHeroId ? configOnlyHero : undefined;
      },
    };

    const result = calculateBattleDamageFromCatalog(
      {
        troops: baseTroops,
        bodyHeroIds: [configOnlyHeroId],
      },
      { heroCatalog: injectedCatalog },
    );

    expect(troop(result, "shield").multipliers.byEffectType.attack).toBeCloseTo(
      1.1,
      12,
    );
  });

  it("超过四个车身时明确报错", () => {
    expect(() =>
      calculate([
        heroIds.jiexi,
        heroIds.jiexi,
        heroIds.jiexi,
        heroIds.jiexi,
        heroIds.jiexi,
      ]),
    ).toThrow(TooManyBodyHeroesError);
  });
});
