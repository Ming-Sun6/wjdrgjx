import { describe, expect, it } from "vitest";
import { calculateBattleDamageWithAdditionalSkills } from "../app/calculateBattleDamage";
import type { SkillCatalogAuditRecord } from "../domain/skillAudit";
import type { Skill } from "../domain/skill";
import type { PendingTroopSkillDefinition } from "../domain/troopSkill";
import { getAllBodyHeroes } from "../game-data/heroes/bodyHeroQueries";
import { getAllHeadHeroes } from "../game-data/heroes/headHeroQueries";
import {
  getAllTroopSkills,
  getTroopSkillsByTroopType,
} from "../game-data/troop-skills/troopSkillQueries";
import { UnsupportedSkillDataStatusError } from "../engine/skills/errors";
import { createInstantProbabilityEvent } from "../engine/probability/createInstantProbabilityEvent";
import { createDurationProbabilityEvent } from "../engine/probability/createDurationProbabilityEvent";
import { createPeriodicStackingScenario } from "../engine/probability/periodicStackingEffects";
import {
  createExtraDamageProbabilityEvent,
  createPeriodicExtraDamageScenario,
} from "../engine/probability/extraDamageEvents";
import { createExtraAttackProbabilityEvent } from "../engine/probability/extraAttackEvents";
import { resolveSkillEffects } from "../engine/skills/resolveSkillEffects";
import { resolveSupportedCatalogEffects } from "../engine/skills/resolveSupportedCatalogEffects";
import { linkedSkillDefinitionFromSkill } from "../engine/trigger-chain/definitions";
import { collectSkillCatalog } from "./collectSkillCatalog";
import { generateSkillSupportReport } from "./generateSkillSupportReport";
import { generatePendingSkillBlockerReport } from "./generatePendingBlockerReport";
import {
  validateHeroData,
  validateSkillData,
  validateTroopSkillData,
} from "./validateCatalogData";

describe("真实技能目录审计", () => {
  it("当前skill、hero和troop skill数据全部通过校验", () => {
    expect(validateSkillData()).toEqual({
      valid: true,
      checkedCount: 82,
      issues: [],
    });
    expect(validateHeroData()).toEqual({
      valid: true,
      checkedCount: 49,
      issues: [],
    });
    expect(validateTroopSkillData()).toEqual({
      valid: true,
      checkedCount: 7,
      issues: [],
    });
  });

  it("所有hero、技能记录、结构化skill和effect ID均唯一", () => {
    const heroIds = [
      ...getAllBodyHeroes().map((hero) => hero.id),
      ...getAllHeadHeroes().map((hero) => hero.id),
    ];
    const records = collectSkillCatalog();
    const recordIds = records.map((record) => record.recordId);
    const skillIds = records.flatMap((record) =>
      record.skillId === null ? [] : [record.skillId],
    );
    const effectIds = records.flatMap((record) =>
      record.effects.map((effect) => effect.id),
    );

    expect(new Set(heroIds).size).toBe(heroIds.length);
    expect(new Set(recordIds).size).toBe(recordIds.length);
    expect(new Set(skillIds).size).toBe(skillIds.length);
    expect(new Set(effectIds).size).toBe(effectIds.length);
  });

  it("所有pending技能和效果均有明确原因", () => {
    for (const record of collectSkillCatalog()) {
      if (record.status === "pending") {
        expect(record.reason?.length).toBeGreaterThan(0);
      }
      for (const effect of record.effects) {
        if (effect.status === "pending") {
          expect(effect.pendingReason?.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("所有supported技能效果字段完整且可由对应的正式入口解析", () => {
    for (const record of collectSkillCatalog()) {
      if (record.status !== "supported") continue;
      expect(record.skill).not.toBeNull();
      for (const effect of record.effects) {
        expect(effect.status).toBe("supported");
        expect(effect.type).not.toBeNull();
        expect(effect.value).not.toBeNull();
      }
      for (const troopType of ["shield", "lancer", "marksman"] as const) {
        if (
          record.skill!.trigger.type === "onSkillTrigger" ||
          (record.skill!.trigger.type === "probability" &&
            record.skill!.trigger.event === "onSkillTrigger")
        ) {
          expect(() => linkedSkillDefinitionFromSkill(record.skill!)).not.toThrow();
        } else if (record.skill!.effects.some((effect) => (effect.conditions?.length ?? 0) > 0)) {
          // 敌方兵种等条件先由BattleContext适配器解析，不直接送入普通always resolver。
          expect(record.effects.some((effect) => (effect.conditions?.length ?? 0) > 0)).toBe(true);
        } else if (record.skill!.trigger.type === "always") {
          expect(() => resolveSkillEffects([record.skill!], troopType)).not.toThrow();
        } else if (record.skill!.trigger.type === "everyNRounds") {
          expect(() =>
            record.skill!.effects.some((effect) => effect.type === "extraDamage")
              ? createPeriodicExtraDamageScenario(record.skill!)
              : createPeriodicStackingScenario(record.skill!),
          ).not.toThrow();
        } else if (
          record.skill!.lifecycle?.durationRounds !== undefined ||
          record.skill!.effects.some(
            (effect) => effect.lifecycle?.durationRounds !== undefined,
          )
        ) {
          expect(() => createDurationProbabilityEvent(record.skill!)).not.toThrow();
        } else if (
          record.skill!.effects.some((effect) => effect.type === "extraAttack")
        ) {
          expect(() => createExtraAttackProbabilityEvent(record.skill!)).not.toThrow();
        } else if (
          record.skill!.effects.some((effect) => effect.type === "extraDamage")
        ) {
          expect(() => createExtraDamageProbabilityEvent(record.skill!)).not.toThrow();
        } else {
          expect(() => createInstantProbabilityEvent(record.skill!)).not.toThrow();
        }
      }
    }
  });

  it("审计器只允许basis、category和适用乘区完整的extraDamage标记supported", () => {
    const trigger = {
      type: "probability" as const,
      probability: 0.3,
      triggerPhase: "afterAttack" as const,
      frequency: "oncePerRound" as const,
    };
    const completeEffect = {
      id: "effect.synthetic-extra.complete",
      status: "supported" as const,
      type: "extraDamage" as const,
      value: 0.5,
      basis: "normalAttackDamage" as const,
      damageCategory: "extra" as const,
      applicableMultiplierZones: ["vulnerable"] as const,
      targetTroop: "all" as const,
      trigger,
      rawDescription: "测试专用：30%概率造成普通攻击基准50%的额外伤害。",
    };
    const record: SkillCatalogAuditRecord = {
      category: "fireCrystal",
      ownerId: "marksman",
      recordId: "record.synthetic-extra.complete",
      skillId: "skill.synthetic-extra.complete",
      skillName: "测试专用额外伤害",
      status: "supported",
      trigger,
      rawDescription: completeEffect.rawDescription,
      source: "synthetic-test",
      reason: null,
      effects: [completeEffect],
      skill: {
        id: "skill.synthetic-extra.complete",
        name: "测试专用额外伤害",
        status: "supported",
        trigger,
        effects: [completeEffect],
      },
    };

    expect(validateSkillData([record])).toEqual({
      valid: true,
      checkedCount: 1,
      issues: [],
    });
    expect(
      validateSkillData([
        {
          ...record,
          recordId: "record.synthetic-extra.incomplete",
          skillId: "skill.synthetic-extra.incomplete",
          effects: [
            {
              ...completeEffect,
              id: "effect.synthetic-extra.incomplete",
              basis: null,
            },
          ],
          skill: null,
        },
      ]).valid,
    ).toBe(false);
  });

  it("审计器只允许执行字段完整的extraAttack标记supported", () => {
    const trigger = {
      type: "probability" as const,
      probability: 0.1,
      triggerPhase: "afterAttack" as const,
      frequency: "oncePerRound" as const,
    };
    const triggerPolicy = {
      beforeAttack: true,
      onAttack: true,
      afterAttack: true,
      canTriggerExtraAttack: false,
      canTriggerExtraDamage: true,
    };
    const completeEffect = {
      id: "effect.synthetic-extra-attack.complete",
      status: "supported" as const,
      type: "extraAttack" as const,
      value: 1,
      count: 1,
      damageScale: 1,
      triggerPolicy,
      maxAttackDepth: 1,
      targetTroop: "all" as const,
      trigger,
      rawDescription: "测试专用：每回合攻击后10%概率额外攻击一次。",
    };
    const record: SkillCatalogAuditRecord = {
      category: "fireCrystal",
      ownerId: "marksman",
      recordId: "record.synthetic-extra-attack.complete",
      skillId: "skill.synthetic-extra-attack.complete",
      skillName: "测试专用额外攻击",
      status: "supported",
      trigger,
      rawDescription: completeEffect.rawDescription,
      source: "synthetic-test",
      reason: null,
      effects: [completeEffect],
      skill: {
        id: "skill.synthetic-extra-attack.complete",
        name: "测试专用额外攻击",
        status: "supported",
        trigger,
        effects: [completeEffect],
      },
    };

    expect(validateSkillData([record])).toEqual({
      valid: true,
      checkedCount: 1,
      issues: [],
    });
    expect(() => createExtraAttackProbabilityEvent(record.skill!)).not.toThrow();
    expect(
      validateSkillData([
        {
          ...record,
          recordId: "record.synthetic-extra-attack.incomplete",
          skillId: "skill.synthetic-extra-attack.incomplete",
          effects: [
            {
              ...completeEffect,
              id: "effect.synthetic-extra-attack.incomplete",
              triggerPolicy: null,
            },
          ],
          skill: null,
        },
      ]).issues.map((issue) => issue.code),
    ).toContain("incomplete-supported-extra-attack");
  });

  it("审计器允许来源、条件和应用方式完整的onSkillTrigger效果", () => {
    const trigger = {
      type: "onSkillTrigger" as const,
      sourceSkillId: "skill.synthetic.A",
    };
    const effect = {
      id: "effect.synthetic.linked-B",
      status: "supported" as const,
      type: "damageIncrease" as const,
      value: 0.2,
      targetTroop: "marksman" as const,
      targetEnemyTroop: "shield" as const,
      trigger,
      conditions: [
        {
          type: "sourceSkillTriggered" as const,
          requiredSkillId: "skill.synthetic.A",
        },
        { type: "enemyTroopType" as const, troopType: "shield" as const },
      ],
      triggerApplication: "transient" as const,
      maxTriggerDepth: 4,
      rawDescription: "测试专用：A触发后B对盾目标增伤20%。",
    };
    const record: SkillCatalogAuditRecord = {
      category: "fireCrystal",
      ownerId: "marksman",
      recordId: "record.synthetic.linked-B",
      skillId: "skill.synthetic.B",
      skillName: "测试专用联动B",
      status: "supported",
      trigger,
      rawDescription: effect.rawDescription,
      source: "synthetic-test",
      reason: null,
      effects: [effect],
      skill: {
        id: "skill.synthetic.B",
        name: "测试专用联动B",
        status: "supported",
        trigger,
        effects: [
          {
            type: "damageIncrease",
            value: 0.2,
            targetTroop: "marksman",
            status: "supported",
            conditions: effect.conditions,
            triggerApplication: "transient",
            maxTriggerDepth: 4,
          },
        ],
      },
    };

    expect(validateSkillData([record])).toEqual({
      valid: true,
      checkedCount: 1,
      issues: [],
    });
  });

  it("审计器允许字段完整的即时概率乘区技能标记supported", () => {
    const trigger = {
      type: "probability" as const,
      probability: 0.25,
      triggerPhase: "beforeAttack" as const,
      frequency: "oncePerRound" as const,
    };
    const record: SkillCatalogAuditRecord = {
      category: "head",
      ownerId: "hero.head.synthetic-instant",
      recordId: "record.synthetic-instant",
      skillId: "skill.synthetic-instant",
      skillName: "合成即时概率技能",
      status: "supported",
      skill: {
        id: "skill.synthetic-instant",
        name: "合成即时概率技能",
        status: "supported",
        trigger,
        effects: [
          {
            type: "attack",
            value: 0.25,
            targetTroop: "all",
            status: "supported",
          },
        ],
      },
      effects: [
        {
          id: "effect.synthetic-instant",
          status: "supported",
          type: "attack",
          value: 0.25,
          targetTroop: "all",
          trigger,
          rawDescription: "每回合攻击前25%概率攻击提升25%，仅当前结算。",
        },
      ],
      trigger,
      rawDescription: "每回合攻击前25%概率攻击提升25%，仅当前结算。",
      source: "test",
      reason: null,
    };

    expect(validateSkillData([record])).toEqual({
      valid: true,
      checkedCount: 1,
      issues: [],
    });
  });

  it("审计器允许生命周期完整的持续概率乘区技能标记supported", () => {
    const trigger = {
      type: "probability" as const,
      probability: 0.4,
      triggerPhase: "roundStart" as const,
      frequency: "oncePerRound" as const,
      durationRounds: 2,
    };
    const lifecycle = {
      durationRounds: 2,
      activationTiming: "immediate" as const,
      refreshMode: "refresh" as const,
    };
    const record: SkillCatalogAuditRecord = {
      category: "head",
      ownerId: "hero.head.synthetic-duration",
      recordId: "record.synthetic-duration",
      skillId: "skill.synthetic-duration",
      skillName: "合成持续概率技能",
      status: "supported",
      skill: {
        id: "skill.synthetic-duration",
        name: "合成持续概率技能",
        status: "supported",
        trigger,
        lifecycle,
        effects: [
          {
            type: "damageIncrease",
            value: 0.4,
            targetTroop: "all",
            status: "supported",
          },
        ],
      },
      effects: [
        {
          id: "effect.synthetic-duration",
          status: "supported",
          type: "damageIncrease",
          value: 0.4,
          targetTroop: "all",
          trigger,
          rawDescription: "回合开始40%概率增伤40%，立即生效2回合并刷新。",
        },
      ],
      trigger,
      rawDescription: "回合开始40%概率增伤40%，立即生效2回合并刷新。",
      source: "test",
      reason: null,
    };

    expect(validateSkillData([record])).toEqual({
      valid: true,
      checkedCount: 1,
      issues: [],
    });
    expect(() => createDurationProbabilityEvent(record.skill!)).not.toThrow();
  });

  it("审计器允许字段完整的everyNRounds线性叠层技能标记supported", () => {
    const trigger = {
      type: "everyNRounds" as const,
      interval: 2,
      firstTriggerRound: 2,
      triggerPhase: "roundStart" as const,
      probability: 0.4,
    };
    const lifecycle = {
      activationTiming: "immediate" as const,
      refreshMode: "stack" as const,
      maxStacks: 4,
      atMaxStacks: "keep" as const,
    };
    const record: SkillCatalogAuditRecord = {
      category: "fireCrystal",
      ownerId: "marksman",
      recordId: "record.synthetic-periodic-stack",
      skillId: "skill.synthetic-periodic-stack",
      skillName: "合成周期叠层技能",
      status: "supported",
      skill: {
        id: "skill.synthetic-periodic-stack",
        name: "合成周期叠层技能",
        status: "supported",
        trigger,
        lifecycle,
        effects: [
          {
            type: "marksmanDamage",
            value: 0.1,
            valuePerStack: 0.1,
            targetTroop: "marksman",
            status: "supported",
          },
        ],
      },
      effects: [
        {
          id: "effect.synthetic-periodic-stack",
          status: "supported",
          type: "marksmanDamage",
          value: 0.1,
          valuePerStack: 0.1,
          targetTroop: "marksman",
          trigger,
          rawDescription: "从第2回合起每2回合40%概率增加一层射手伤害。",
        },
      ],
      trigger,
      rawDescription: "从第2回合起每2回合40%概率增加一层射手伤害。",
      source: "test",
      reason: null,
    };

    expect(validateSkillData([record])).toEqual({
      valid: true,
      checkedCount: 1,
      issues: [],
    });
    expect(() => createPeriodicStackingScenario(record.skill!)).not.toThrow();
  });

  it("非法概率、重复ID和缺失pendingReason会被审计器报告", () => {
    const invalid: SkillCatalogAuditRecord = {
      category: "head",
      ownerId: "hero.head.synthetic",
      recordId: "duplicate",
      skillId: null,
      skillName: "非法合成技能",
      status: "pending",
      skill: null,
      effects: [
        {
          id: "duplicate-effect",
          status: "pending",
          type: "attack",
          value: 0.1,
          trigger: { type: "probability", probability: 1.1 },
          rawDescription: "非法概率。",
        },
      ],
      trigger: { type: "probability", probability: -0.1 },
      rawDescription: "非法合成技能。",
      source: "test",
      reason: null,
    };
    const result = validateSkillData([invalid, invalid]);
    const codes = result.issues.map((issue) => issue.code);

    expect(result.valid).toBe(false);
    expect(codes).toContain("duplicate-recordId");
    expect(codes).toContain("duplicate-effectId");
    expect(codes).toContain("invalid-probability");
    expect(codes).toContain("missing-pending-reason");
  });

  it("skill支持报告按body/head/fireCrystal/troopTierSkill统计skill与effect", () => {
    const report = generateSkillSupportReport();

    expect(report.totals.skills).toEqual({
      supported: 78,
      pending: 4,
      unsupported: 0,
    });
    expect(report.totals.effects).toEqual({
      supported: 82,
      pending: 0,
      unsupported: 0,
    });
    expect(report.byCategory.body.skills).toEqual({
      supported: 25,
      pending: 4,
      unsupported: 0,
    });
    expect(report.byCategory.head.skills).toEqual({ supported: 46, pending: 0, unsupported: 0 });
    expect(report.byCategory.fireCrystal.skills).toEqual({ supported: 6, pending: 0, unsupported: 0 });
    expect(report.byCategory.troopTierSkill.skills).toEqual({ supported: 1, pending: 0, unsupported: 0 });
  });

  it("pending原因严格区分规则未知、引擎缺口与数据来源不足", () => {
    const report = generatePendingSkillBlockerReport();

    expect(report.engineCapability).toHaveLength(0);
    expect(report.gameRuleInformation).toHaveLength(0);
    expect(report.dataSourceUncertain).toHaveLength(4);
    expect(
      report.gameRuleInformation.every(
        (entry) => entry.classification === "RULE_UNKNOWN",
      ),
    ).toBe(true);
    expect(report.dataSourceUncertain.every((entry) => entry.classification === "DATA_SOURCE_UNCERTAIN")).toBe(true);
  });
});

describe("效果级supported / pending边界", () => {
  const partialSkill: PendingTroopSkillDefinition = {
    id: "troop-skill.marksman.synthetic-partial",
    name: "合成部分支持技能",
    troopType: "marksman",
    level: 1,
    status: "pending",
    trigger: null,
    rawDescription: "测试效果级状态。",
    pendingReason: "其中一个效果仍待确认。",
    notes: ["测试专用。"],
    source: "test",
    effects: [
      {
        id: "effect.synthetic.supported-attack",
        status: "supported",
        type: "attack",
        value: 0.1,
        targetTroop: "all",
        trigger: { type: "always" },
        rawDescription: "攻击提升10%。",
      },
      {
        id: "effect.synthetic.pending-extra",
        status: "pending",
        type: "extraDamage",
        value: 0.5,
        targetTroop: "marksman",
        trigger: { type: "probability", probability: 0.3 },
        rawDescription: "概率额外伤害。",
        pendingReason: "额外伤害结算未知。",
      },
    ],
  };

  it("同一技能只转换supported effect，pending effect保留跳过原因", () => {
    const resolution = resolveSupportedCatalogEffects(partialSkill);

    expect(resolution.skills).toHaveLength(1);
    expect(resolution.skills[0]?.effects).toHaveLength(1);
    expect(resolution.skills[0]?.effects[0]?.type).toBe("attack");
    expect(resolution.skippedEffects).toEqual([
      {
        effectId: "effect.synthetic.pending-extra",
        status: "pending",
        reason: "额外伤害结算未知。",
      },
    ]);
  });

  it("转换后的supported effect进入既有伤害引擎，pending effect不参与", () => {
    const resolution = resolveSupportedCatalogEffects(partialSkill);
    const input = {
      troops: [
        {
          troopType: "marksman" as const,
          troopLevelId: "T10" as const,
          troopCount: 10_000,
          stats: { attackPercent: 0, penetrationPercent: 0 },
        },
      ],
      bodyHeroIds: [],
    };
    const baseline = calculateBattleDamageWithAdditionalSkills(input, []);
    const calculated = calculateBattleDamageWithAdditionalSkills(
      input,
      resolution.skills,
    );

    expect(calculated.finalDamage).toBeCloseTo(
      baseline.finalDamage * 1.1,
      12,
    );
    expect(calculated.troopDamages.marksman?.multipliers.byEffectType.attack).toBeCloseTo(
      1.1,
      12,
    );
    expect(calculated.troopDamages.marksman?.deferredExtraDamageEffects).toEqual(
      [],
    );
  });

  it("带pending状态的原始Skill即使被直接传入resolver也会明确报错", () => {
    const pendingSkill: Skill = {
      id: "skill.synthetic.pending",
      name: "合成待确认技能",
      status: "pending",
      trigger: { type: "always" },
      effects: [{ type: "attack", value: .1, status: "pending" }],
    };
    expect(() =>
      resolveSkillEffects([pendingSkill], "shield"),
    ).toThrow(UnsupportedSkillDataStatusError);
  });
});

describe("射手火晶技能数据", () => {
  it("火晶与兵种技能分层后共录入7项，并能按troopType查询", () => {
    expect(getAllTroopSkills()).toHaveLength(7);
    expect(getTroopSkillsByTroopType("marksman")).toHaveLength(7);
    expect(getTroopSkillsByTroopType("shield")).toEqual([]);
    expect(getTroopSkillsByTroopType("lancer")).toEqual([]);
  });

  it("确认后的技能均为supported，连射为T7兵种技能且炽火燧星不是战斗叠层", () => {
    const skills = getAllTroopSkills();
    expect(skills.every((skill) => skill.status === "supported")).toBe(true);
    expect(
      skills.find((skill) => skill.name === "连射")?.sourceKind,
    ).toBe("troopTierSkill");
    expect(
      skills.find((skill) => skill.name === "连射")?.trigger,
    ).toMatchObject({ type: "probability", probability: 0.1 });
    expect(
      skills.find((skill) => skill.name === "燃晶火药 Lv.2")?.trigger,
    ).toMatchObject({ type: "probability", probability: 0.3 });
    expect(
      skills.find((skill) => skill.name === "炽火燧星（射T12技能） L24")?.effects[0],
    ).toMatchObject({
      value: .12,
      activeRounds: [6,7,8,9,10],
    });
    expect(
      skills.find((skill) => skill.name === "火焰冲击 Lv.2")?.effects[0],
    ).toMatchObject({
      type: "normalAttackDamageIncrease",
      value: .06,
      status: "supported",
    });
  });
});
