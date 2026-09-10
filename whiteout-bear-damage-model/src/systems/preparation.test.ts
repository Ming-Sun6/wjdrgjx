import { describe, expect, it } from "vitest";
import { aggregateMultipliers } from "../engine/skills/aggregateMultipliers";
import { resolveSkillEffects } from "../engine/skills/resolveSkillEffects";
import {
  BEAR_SLAYER_CAPACITY_PER_LEVEL,
  EXCLUSIVE_WEAPON_RATES,
  HUNTER_HEART_RATES,
  PET_BUFF_RATES,
  PET_CAPACITY_PER_LEVEL,
  TOWN_BUFF_RATES,
} from "../game-data/systems/progression";
import { calculateMarchCapacity, prepareBattleModifiers } from "./preparation";
import type { BattlePreparationConfig } from "../domain/preparation";

const baseConfig: BattlePreparationConfig = {
  baseMarchCapacity: 100_003,
  otherFixedCapacity: 0,
  expert: { hunterHeartLevel: 0, bearSlayerLevel: 0 },
  town: { attack: "none", penetration: "none", defenseReduction: "none", marchCapacity: "none" },
  pet: { attackLevel: 0, penetrationLevel: 0, defenseReductionLevel: 0, capacityLevel: 0 },
};

describe("专家、Buff与出征容量", () => {
  it("等级表严格等于确认数据", () => {
    expect(HUNTER_HEART_RATES).toEqual([0,.02,.04,.06,.09,.12,.15,.18,.21,.24,.27,.30]);
    expect(PET_BUFF_RATES).toEqual([0,.025,.03,.035,.04,.05,.06,.07,.08,.09,.10]);
    expect(EXCLUSIVE_WEAPON_RATES).toEqual([0,.05,.075,.10,.125,.15]);
    expect(TOWN_BUFF_RATES).toEqual({ none: 0, small: .1, large: .2 });
    expect(BEAR_SLAYER_CAPACITY_PER_LEVEL).toBe(3_000);
    expect(PET_CAPACITY_PER_LEVEL).toBe(1_500);
  });

  it("固定容量先加、城镇百分比后乘且最终floor", () => {
    const result = calculateMarchCapacity({
      ...baseConfig,
      otherFixedCapacity: 7,
      expert: { hunterHeartLevel: 0, bearSlayerLevel: 10 },
      town: { ...baseConfig.town, marchCapacity: "small" },
      pet: { ...baseConfig.pet, capacityLevel: 10 },
    });
    expect(result.fixedAdjustedCapacity).toBe(145_010);
    expect(result.rawFinalMarchCapacity).toBeCloseTo(159_511, 10);
    expect(result.finalMarchCapacity).toBe(Math.floor(result.rawFinalMarchCapacity));
  });

  it("largest remainder重分配后兵数严格守恒", () => {
    const prepared = prepareBattleModifiers([
      { troopType: "shield", troopCount: 2, troopLevelId: "T10", stats: { attackPercent: 0, penetrationPercent: 0 } },
      { troopType: "lancer", troopCount: 3, troopLevelId: "T10", stats: { attackPercent: 0, penetrationPercent: 0 } },
      { troopType: "marksman", troopCount: 5, troopLevelId: "T10", stats: { attackPercent: 0, penetrationPercent: 0 } },
    ], {}, baseConfig);
    expect(Object.values(prepared.troopCounts).reduce((sum, count) => sum + count, 0)).toBe(100_003);
    expect(prepared.troopCounts).toEqual({ shield: 20_001, lancer: 30_001, marksman: 50_001 });
  });

  it("counts-to-ratios conversion does not create a negative floating-point remainder", () => {
    const prepared = prepareBattleModifiers([
      { troopType: "shield", troopCount: 10, troopLevelId: "T10", stats: { attackPercent: 0, penetrationPercent: 0 } },
      { troopType: "lancer", troopCount: 182_360, troopLevelId: "T10", stats: { attackPercent: 0, penetrationPercent: 0 } },
      { troopType: "marksman", troopCount: 0, troopLevelId: "T10", stats: { attackPercent: 0, penetrationPercent: 0 } },
    ], {}, { ...baseConfig, baseMarchCapacity: 182_370 });

    expect(prepared.troopCounts).toEqual({ shield: 10, lancer: 182_360, marksman: 0 });
  });

  it("skill.attack、buff.attack与expertBearDamage保持三个独立乘区", () => {
    const prepared = prepareBattleModifiers([], {}, {
      ...baseConfig,
      expert: { hunterHeartLevel: 11, bearSlayerLevel: 0 },
      town: { ...baseConfig.town, attack: "large" },
      pet: { ...baseConfig.pet, attackLevel: 10 },
    });
    const effects = resolveSkillEffects([
      ...prepared.skills,
      { id: "test.skill.attack", name: "技能攻击", trigger: { type: "always" }, effects: [{ type: "attack", value: .25 }] },
    ], "shield");
    const multipliers = aggregateMultipliers(effects, { troopType: "shield", damageChannel: "normalAttack" });
    expect(multipliers.multiplierByEffectType.attack).toBe(1.25);
    expect(multipliers.multiplierByEffectType.buffAttack).toBe(1.30);
    expect(multipliers.multiplierByEffectType.expertBearDamage).toBe(1.30);
    expect(multipliers.combinedMultiplier).toBeCloseTo(1.25 * 1.30 * 1.30, 12);
  });

  it("专武映射由英雄数据决定，城镇+宠物+专武在buff.attack内加算", () => {
    const prepared = prepareBattleModifiers([], { shieldHeroId: "hero.head.heketuo" }, {
      ...baseConfig,
      town: { ...baseConfig.town, attack: "large" },
      pet: { ...baseConfig.pet, attackLevel: 10 },
      exclusiveWeapons: { levelsByHeroId: { "hero.head.heketuo": 5 } },
    });
    const effects = resolveSkillEffects(prepared.skills, "shield");
    const multipliers = aggregateMultipliers(effects, { troopType: "shield", damageChannel: "normalAttack" });
    expect(multipliers.sumByEffectType.buffAttack).toBeCloseTo(.20 + .10 + .15, 12);
    expect(multipliers.multiplierByEffectType.buffAttack).toBeCloseTo(1.45, 12);
  });

  it("Buff与Skill的穿透、减防分别区内加算并跨大区相乘", () => {
    const prepared = prepareBattleModifiers([], {}, {
      ...baseConfig,
      town: { ...baseConfig.town, penetration: "small", defenseReduction: "small" },
      pet: { ...baseConfig.pet, penetrationLevel: 10, defenseReductionLevel: 10 },
    });
    const effects = resolveSkillEffects([
      ...prepared.skills,
      {
        id: "test.skill.penetration-defense",
        name: "技能穿透与减防",
        trigger: { type: "always" },
        effects: [
          { type: "penetration", value: .25 },
          { type: "defenseReduction", value: .25 },
          { type: "defenseReduction", value: .25 },
        ],
      },
    ], "shield");
    const multipliers = aggregateMultipliers(effects, { troopType: "shield", damageChannel: "normalAttack" });

    expect(multipliers.multiplierByEffectType.buffPenetration).toBeCloseTo(1.2, 12);
    expect(multipliers.multiplierByEffectType.penetration).toBeCloseTo(1.25, 12);
    expect(multipliers.multiplierByEffectType.buffDefenseReduction).toBeCloseTo(1.2, 12);
    expect(multipliers.multiplierByEffectType.defenseReduction).toBeCloseTo(1.5, 12);
    expect(multipliers.combinedMultiplier).toBeCloseTo(1.2 * 1.25 * 1.2 * 1.5, 12);
  });

  it("最终兵数模式不应用任何容量扩展且保留输入兵数", () => {
    const prepared = prepareBattleModifiers([
      { troopType: "shield", troopCount: 10, troopLevelId: "T10", stats: { attackPercent: 0, penetrationPercent: 0 } },
      { troopType: "lancer", troopCount: 300, troopLevelId: "T10", stats: { attackPercent: 0, penetrationPercent: 0 } },
      { troopType: "marksman", troopCount: 130_000, troopLevelId: "T10", stats: { attackPercent: 0, penetrationPercent: 0 } },
    ], {}, {
      ...baseConfig,
      baseMarchCapacity: 130_310,
      capacityMode: "useFinalTroops",
      expert: { hunterHeartLevel: 0, bearSlayerLevel: 10 },
      town: { ...baseConfig.town, marchCapacity: "large" },
      pet: { ...baseConfig.pet, capacityLevel: 10 },
    });
    expect(prepared.troopCounts).toEqual({ shield: 10, lancer: 300, marksman: 130_000 });
    expect(prepared.capacity).toMatchObject({
      expertFixedCapacity: 0,
      petFixedCapacity: 0,
      townMarchCapacityRate: 0,
      finalMarchCapacity: 130_310,
    });
  });

  it("额外集结Buff与宠物在Buff小区加算", () => {
    const prepared = prepareBattleModifiers([], {}, {
      ...baseConfig,
      capacityMode: "useFinalTroops",
      pet: { ...baseConfig.pet, attackLevel: 5, penetrationLevel: 1 },
      additionalDamageBuffs: { attackRate: .05, penetrationRate: .05 },
    });
    const multipliers = aggregateMultipliers(resolveSkillEffects(prepared.skills, "shield"), {
      troopType: "shield",
      damageChannel: "normalAttack",
    });
    expect(multipliers.multiplierByEffectType.buffAttack).toBeCloseTo(1.10, 12);
    expect(multipliers.multiplierByEffectType.buffPenetration).toBeCloseTo(1.075, 12);
  });
});
