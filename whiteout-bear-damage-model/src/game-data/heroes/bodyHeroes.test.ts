import { describe, expect, it } from "vitest";
import { calculateBattleDamage } from "../../app/calculateBattleDamage";
import { calculateTenRoundExpectedDamage } from "../../app/calculateTenRoundExpectedDamage";
import type { BodyHeroDefinition, BodyHeroId } from "../../domain/hero";
import type { SkillEffect } from "../../domain/skill";
import { UnsupportedBodyHeroError } from "../../engine/battle/errors";
import { resolveSkillEffects } from "../../engine/skills/resolveSkillEffects";
import {
  getAllBodyHeroes,
  getHeroById,
  getPendingBodyHeroes,
  getSupportedBodyHeroes,
  getUnsupportedBodyHeroes,
} from "./bodyHeroQueries";

function requireHero(heroId: BodyHeroId): BodyHeroDefinition {
  const hero = getHeroById(heroId);

  if (hero === undefined) {
    throw new Error(`测试找不到英雄：${heroId}`);
  }

  return hero;
}

function requireFirstEffect(heroId: BodyHeroId): SkillEffect {
  const hero = requireHero(heroId);

  if (hero.skill === null || hero.skill.effects[0] === undefined) {
    throw new Error(`测试英雄缺少技能效果：${heroId}`);
  }

  return hero.skill.effects[0];
}

describe("完整车身英雄数据库", () => {
  it("录入29个英雄，并按最新规则分为25 supported / 4 pending / 0 unsupported", () => {
    expect(getAllBodyHeroes()).toHaveLength(29);
    expect(getSupportedBodyHeroes()).toHaveLength(25);
    expect(getPendingBodyHeroes()).toHaveLength(4);
    expect(getUnsupportedBodyHeroes()).toHaveLength(0);
  });

  it("玲奈常驻提升30%普通攻击且不属于额外伤害", () => {
    const hero = requireHero("hero.body.lingnai");
    expect(hero.status).toBe("supported");
    expect(hero.skill?.trigger).toEqual({ type: "always" });
    expect(requireFirstEffect(hero.id)).toMatchObject({
      type: "normalAttackDamageIncrease",
      value: 0.3,
      targetTroop: "all",
    });
    expect(requireFirstEffect(hero.id).type).not.toBe("extraDamage");
  });

  it("所有 hero id 唯一且配置字段完整", () => {
    const heroes = getAllBodyHeroes();
    const ids = heroes.map((hero) => hero.id);

    expect(new Set(ids).size).toBe(ids.length);

    for (const hero of heroes) {
      expect(hero.id).toMatch(/^hero\.body\./);
      expect(hero.name.length).toBeGreaterThan(0);
      expect(["S", "A", "B", "C", "D"]).toContain(hero.tier);
      expect(hero.generation === null || Number.isSafeInteger(hero.generation)).toBe(true);
      expect(hero.role).toBe("body");
      expect(hero.bodySkill).toBe(hero.skill);
      expect(hero.headSkills).toEqual([]);
      expect(hero.notes.length).toBeGreaterThan(0);
      expect(hero.supported).toBe(hero.status === "supported");
    }
  });

  it("杰西是 penetration +0.25", () => {
    expect(requireFirstEffect("hero.body.jiexi")).toMatchObject({
      type: "penetration",
      value: 0.25,
      targetTroop: "all",
    });
  });

  it("书允是 attack +0.25", () => {
    expect(requireFirstEffect("hero.body.shuyun")).toMatchObject({
      type: "attack",
      value: 0.25,
      targetTroop: "all",
    });
  });

  it("亨德里克是 defenseReduction +0.25", () => {
    expect(requireFirstEffect("hero.body.hengdelike")).toMatchObject({
      type: "defenseReduction",
      value: 0.25,
      targetTroop: "all",
    });
  });

  it("格温是 vulnerable +0.25", () => {
    expect(requireFirstEffect("hero.body.gewen")).toMatchObject({
      type: "vulnerable",
      value: 0.25,
      targetTroop: "all",
    });
  });

  it("诺拉只作用于 marksman", () => {
    expect(requireFirstEffect("hero.body.nuola")).toMatchObject({
      type: "baseDamageIncrease",
      value: 0.15,
      targetTroop: "marksman",
    });
  });

  it("米娅按三次独立攻击判定的nextRound易伤规则正式参与计算", () => {
    const hero = requireHero("hero.body.miya");

    expect(hero.status).toBe("supported");
    expect(hero.supported).toBe(true);
    expect(hero.skill?.trigger).toMatchObject({
      type: "probability",
      probability: 0.5,
      attemptsPerRound: 3,
      frequency: "oncePerRound",
    });
    expect(hero.skill?.effects[0]).toMatchObject({
      type: "vulnerable",
      value: 0.5,
    });
  });

  it("韦恩在round5/9造成100% extraDamage并正式参与计算", () => {
    const hero = requireHero("hero.body.weien");

    expect(hero.status).toBe("supported");
    expect(hero.supported).toBe(true);
    expect(hero.skill?.trigger).toMatchObject({ type: "everyNRounds", interval: 4, firstTriggerRound: 5 });
    expect(hero.skill?.effects[0]).toMatchObject({
      type: "extraDamage",
      value: 1,
      basis: "postMultiplierDamage",
    });
    const result = calculateTenRoundExpectedDamage({
      troops: [{ troopType: "shield", troopLevelId: "T6", troopCount: 10_000, stats: { attackPercent: 0, penetrationPercent: 0 } }],
      bodyHeroIds: ["hero.body.weien"],
    });
    expect(result.expectedDamageByRound.map((round) => round.expectedExtraDamage > 0 ? round.round : null).filter(Boolean)).toEqual([5, 9]);
  });

  it("所有 supported 英雄均可由静态或十回合正式入口处理", () => {
    for (const hero of getSupportedBodyHeroes()) {
      for (const troopType of ["shield", "lancer", "marksman"] as const) {
        if (hero.skill.trigger.type === "always") {
          expect(() => resolveSkillEffects([hero.skill], troopType)).not.toThrow();
        } else {
          expect(() => calculateTenRoundExpectedDamage({
            troops: [{ troopType, troopLevelId: "T6", troopCount: 10_000, stats: { attackPercent: 0, penetrationPercent: 0 } }],
            bodyHeroIds: [hero.id],
          })).not.toThrow();
        }
      }
    }
  });

  it("所有 pending/unsupported 英雄强行传入计算器都会明确报错", () => {
    const unavailableHeroes = [
      ...getPendingBodyHeroes(),
      ...getUnsupportedBodyHeroes(),
    ];

    for (const hero of unavailableHeroes) {
      expect(() =>
        calculateBattleDamage({
          troops: [
            {
              troopType: "shield",
              troopLevelId: "T10",
              troopCount: 10_000,
              stats: { attackPercent: 0, penetrationPercent: 0 },
            },
          ],
          bodyHeroIds: [hero.id as BodyHeroId],
        }),
      ).toThrow(UnsupportedBodyHeroError);
    }
  });

  it("pending名单保留已知结构或null，但全部具有pendingReason且不参与计算", () => {
    for (const hero of getPendingBodyHeroes()) {
      expect(hero.supported).toBe(false);
      expect(hero.bodySkillDefinition.status).toBe("pending");
      expect(hero.bodySkillDefinition.pendingReason.length).toBeGreaterThan(0);
      expect(hero.bodySkillDefinition.skill).toBe(hero.skill);
    }
  });
});
