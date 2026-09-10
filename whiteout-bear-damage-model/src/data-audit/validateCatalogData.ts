import {
  DAMAGE_CATEGORIES,
  EFFECT_TYPES,
  EXTRA_DAMAGE_BASES,
  PROBABILITY_TRIGGER_FREQUENCIES,
  PROBABILITY_TRIGGER_PHASES,
} from "../domain/skill";
import { extraDamageEffectValidationErrors } from "../engine/damage/resolveDamageComponent";
import { multiplierResolverRegistry } from "../engine/skills/resolvers/resolverRegistry";
import { extraAttackEffectValidationErrors } from "../engine/attacks/extraAttackEffect";
import type {
  EffectLifecycle,
  SkillCalculationStatus,
  SkillEffectData,
  SkillTrigger,
} from "../domain/skill";
import type {
  DataValidationIssue,
  DataValidationResult,
  SkillCatalogAuditRecord,
} from "../domain/skillAudit";
import type { TroopSkillDefinition } from "../domain/troopSkill";
import { getAllBodyHeroes } from "../game-data/heroes/bodyHeroQueries";
import { getAllHeadHeroes } from "../game-data/heroes/headHeroQueries";
import { getAllTroopSkills } from "../game-data/troop-skills/troopSkillQueries";
import { collectSkillCatalog } from "./collectSkillCatalog";

const VALID_TROOP_TYPES = new Set(["shield", "lancer", "marksman"]);
const VALID_TARGETS = new Set(["all", ...VALID_TROOP_TYPES]);
const VALID_STATUSES = new Set<SkillCalculationStatus>([
  "supported",
  "pending",
  "unsupported",
]);
const VALID_MULTIPLIER_ZONES = new Set(Object.keys(multiplierResolverRegistry));

export function validateSkillData(
  records: readonly SkillCatalogAuditRecord[] = collectSkillCatalog(),
): DataValidationResult {
  const issues: DataValidationIssue[] = [];
  checkUnique(records.map((record) => record.recordId), "recordId", issues);
  checkUnique(
    records.flatMap((record) =>
      record.skillId === null ? [] : [record.skillId],
    ),
    "skillId",
    issues,
  );
  checkUnique(
    records.flatMap((record) => record.effects.map((effect) => effect.id)),
    "effectId",
    issues,
  );

  for (const record of records) {
    const path = `${record.category}.${record.recordId}`;
    if (!record.recordId || !record.skillName) {
      issue(issues, "missing-identity", path, "技能记录ID和名称不能为空。");
    }
    if (!record.rawDescription.trim()) {
      issue(issues, "missing-raw-description", path, "真实技能必须保留原始描述。");
    }
    if (!VALID_STATUSES.has(record.status)) {
      issue(issues, "invalid-status", path, `非法status：${record.status as string}。`);
    }
    validateReason(record.status, record.reason, path, issues);
    validateTrigger(record.trigger, `${path}.trigger`, issues);
    if (record.skill !== null) {
      if (
        record.skill.status !== undefined &&
        record.skill.status !== record.status
      ) {
        issue(
          issues,
          "skill-status-mismatch",
          `${path}.skill.status`,
          `Skill状态${record.skill.status}与记录状态${record.status}不一致。`,
        );
      }
      validateTrigger(record.skill.trigger, `${path}.skill.trigger`, issues);
      validateLifecycle(record.skill.lifecycle, `${path}.skill.lifecycle`, issues);
      validateSkillRuntimeMetadata(record.skill, `${path}.skill`, issues);
    }
    if (record.status === "supported" && record.effects.length === 0) {
      issue(issues, "supported-without-effects", path, "supported技能必须至少有一个效果。");
    }
    for (const [index, effect] of record.effects.entries()) {
      validateEffect(
        effect,
        record.trigger,
        record.skill?.lifecycle,
        `${path}.effects[${index}]`,
        issues,
      );
    }
  }

  return result(records.length, issues);
}

function validateSkillRuntimeMetadata(
  skill: import("../domain/skill").Skill,
  path: string,
  issues: DataValidationIssue[],
): void {
  const critValues = [skill.critProbability, skill.critMultiplier, skill.critAppliesTo];
  if (critValues.some((value) => value !== undefined)) {
    if (
      skill.critProbability === undefined ||
      !Number.isFinite(skill.critProbability) ||
      skill.critProbability < 0 ||
      skill.critProbability > 1
    ) {
      issue(issues, "invalid-crit-probability", path, "critProbability必须位于[0,1]。");
    }
    if (
      skill.critMultiplier === undefined ||
      !Number.isFinite(skill.critMultiplier) ||
      skill.critMultiplier < 1
    ) {
      issue(issues, "invalid-crit-multiplier", path, "critMultiplier必须是至少为1的有限数。");
    }
    if (skill.critAppliesTo !== "normalAttackOnly") {
      issue(issues, "invalid-crit-target", path, "critAppliesTo必须明确为normalAttackOnly。");
    }
    if (
      skill.trigger.type !== "probability" ||
      skill.trigger.probability !== skill.critProbability ||
      skill.effects.some((effect) => effect.type !== "normalAttackDamageIncrease")
    ) {
      issue(issues, "invalid-crit-runtime-mapping", path, "暴击必须映射为同概率的normalAttackDamageIncrease事件。");
    }
  }

  const counter = skill.normalAttackCounter;
  if (counter !== undefined) {
    if (!counter.counterId.trim()) {
      issue(issues, "invalid-attack-counter-id", path, "普通攻击计数器counterId不能为空。");
    }
    if (
      !["shield", "lancer", "marksman", "allIndependent"].includes(counter.troopType) ||
      !Number.isSafeInteger(counter.attacksPerTrigger) ||
      counter.attacksPerTrigger < 1 ||
      !Number.isSafeInteger(counter.firstTriggerAttack) ||
      counter.firstTriggerAttack < 1 ||
      counter.counts !== "normalAttackOnly"
    ) {
      issue(issues, "invalid-attack-counter", path, "普通攻击计数器字段不完整或非法。");
    }
  }
}

export function validateHeroData(): DataValidationResult {
  const bodyHeroes = getAllBodyHeroes();
  const headHeroes = getAllHeadHeroes();
  const allHeroes = [...bodyHeroes, ...headHeroes];
  const issues: DataValidationIssue[] = [];
  checkUnique(allHeroes.map((hero) => hero.id), "heroId", issues);

  for (const hero of allHeroes) {
    const path = `hero.${hero.id}`;
    if (!hero.name.trim()) {
      issue(issues, "missing-hero-name", path, "英雄名称不能为空。");
    }
    if (
      hero.troopType !== null &&
      !VALID_TROOP_TYPES.has(hero.troopType)
    ) {
      issue(issues, "invalid-troop-type", path, `非法兵种：${hero.troopType as string}。`);
    }
    if (
      hero.exclusiveGroupIds?.some((groupId) => !groupId.trim()) === true ||
      new Set(hero.exclusiveGroupIds ?? []).size !==
        (hero.exclusiveGroupIds?.length ?? 0)
    ) {
      issue(
        issues,
        "invalid-exclusive-group",
        path,
        "exclusiveGroupIds不得为空或重复。",
      );
    }
    if (hero.role === "body") {
      if (hero.bodySkillDefinition.skill !== hero.bodySkill) {
        issue(
          issues,
          "body-skill-reference-mismatch",
          path,
          "bodySkill与bodySkillDefinition.skill必须引用同一配置。",
        );
      }
      if (
        hero.status === "pending" &&
        !hero.bodySkillDefinition.pendingReason.trim()
      ) {
        issue(issues, "missing-pending-reason", path, "pending车身技能必须说明原因。");
      }
    } else {
      for (const skill of hero.headSkills) {
        if (skill.status === "pending" && !skill.pendingReason.trim()) {
          issue(issues, "missing-pending-reason", `${path}.${skill.id}`, "pending车头技能必须说明原因。");
        }
      }
    }
  }
  return result(allHeroes.length, issues);
}

export function validateTroopSkillData(
  skills: readonly TroopSkillDefinition[] = getAllTroopSkills(),
): DataValidationResult {
  const issues: DataValidationIssue[] = [];
  checkUnique(skills.map((skill) => skill.id), "troopSkillId", issues);
  for (const skill of skills) {
    const path = `troopSkill.${skill.id}`;
    if (!VALID_TROOP_TYPES.has(skill.troopType)) {
      issue(issues, "invalid-troop-type", path, `非法兵种：${skill.troopType as string}。`);
    }
    if (skill.status === "pending" && !skill.pendingReason.trim()) {
      issue(issues, "missing-pending-reason", path, "pending兵种技能必须说明原因。");
    }
    if (skill.status === "supported" && skill.level === null) {
      issue(issues, "missing-supported-level", path, "supported兵种技能必须提供等级。");
    }
  }
  const skillResult = validateSkillData(
    skills.map((skill) => ({
      category: "fireCrystal" as const,
      ownerId: skill.troopType,
      recordId: skill.id,
      skillId: skill.id,
      skillName: skill.name,
      status: skill.status,
      skill: null,
      effects: skill.effects,
      trigger: skill.trigger,
      rawDescription: skill.rawDescription,
      source: skill.source,
      reason:
        skill.status === "pending"
          ? skill.pendingReason
          : skill.status === "unsupported"
            ? skill.unsupportedReason
            : null,
    })),
  );
  issues.push(...skillResult.issues);
  return result(skills.length, issues);
}

function validateEffect(
  effect: SkillEffectData,
  inheritedTrigger: SkillTrigger | null,
  inheritedLifecycle: EffectLifecycle | undefined,
  path: string,
  issues: DataValidationIssue[],
): void {
  if (!effect.id) {
    issue(issues, "missing-effect-id", path, "效果记录ID不能为空。");
  }
  if (!effect.rawDescription.trim()) {
    issue(issues, "missing-raw-description", path, "效果必须保留原始描述。");
  }
  validateReason(
    effect.status,
    effect.pendingReason ?? effect.unsupportedReason ?? null,
    path,
    issues,
  );
  if (effect.type !== null && !EFFECT_TYPES.includes(effect.type)) {
    issue(issues, "invalid-effect-type", path, `非法effectType：${effect.type as string}。`);
  }
  if (effect.value !== null && !Number.isFinite(effect.value)) {
    issue(issues, "invalid-effect-value", path, "效果value必须是有限数字或null。");
  }
  if (
    effect.valueOptions !== undefined &&
    (effect.valueOptions.length === 0 ||
      effect.valueOptions.some((value) => !Number.isFinite(value)))
  ) {
    issue(
      issues,
      "invalid-effect-value-options",
      path,
      "valueOptions必须是非空有限数字数组。",
    );
  }
  if (
    effect.valuePerStack !== undefined &&
    effect.valuePerStack !== null &&
    !Number.isFinite(effect.valuePerStack)
  ) {
    issue(issues, "invalid-value-per-stack", path, "valuePerStack必须是有限数字或null。");
  }
  if (
    effect.basis !== undefined &&
    effect.basis !== null &&
    !EXTRA_DAMAGE_BASES.includes(effect.basis)
  ) {
    issue(issues, "invalid-extra-damage-basis", path, "basis不在已声明枚举中。");
  }
  if (
    effect.damageCategory !== undefined &&
    effect.damageCategory !== null &&
    !DAMAGE_CATEGORIES.includes(effect.damageCategory)
  ) {
    issue(issues, "invalid-damage-category", path, "damageCategory不在已声明枚举中。");
  }
  if (Array.isArray(effect.applicableMultiplierZones)) {
    const zones = new Set<string>();
    for (const zone of effect.applicableMultiplierZones) {
      if (!VALID_MULTIPLIER_ZONES.has(zone)) {
        issue(issues, "invalid-extra-damage-zone", path, `非法额外伤害乘区：${zone as string}。`);
      }
      if (zones.has(zone)) {
        issue(issues, "duplicate-extra-damage-zone", path, `重复额外伤害乘区：${zone}。`);
      }
      zones.add(zone);
    }
  }
  if (
    effect.count !== undefined &&
    effect.count !== null &&
    (!Number.isSafeInteger(effect.count) || effect.count < 1)
  ) {
    issue(issues, "invalid-extra-attack-count", path, "count必须是正安全整数或null。");
  }
  if (
    effect.damageScale !== undefined &&
    effect.damageScale !== null &&
    (!Number.isFinite(effect.damageScale) || effect.damageScale < 0)
  ) {
    issue(issues, "invalid-extra-attack-scale", path, "damageScale必须是非负有限数或null。");
  }
  if (
    effect.maxAttackDepth !== undefined &&
    effect.maxAttackDepth !== null &&
    (!Number.isSafeInteger(effect.maxAttackDepth) || effect.maxAttackDepth < 1)
  ) {
    issue(issues, "invalid-extra-attack-depth", path, "maxAttackDepth必须是正安全整数或null。");
  }
  if (
    effect.maxTriggerDepth !== undefined &&
    effect.maxTriggerDepth !== null &&
    (!Number.isSafeInteger(effect.maxTriggerDepth) ||
      effect.maxTriggerDepth < 1 ||
      effect.maxTriggerDepth > 64)
  ) {
    issue(issues, "invalid-trigger-chain-depth", path, "maxTriggerDepth必须是1～64的安全整数或null。");
  }
  if (
    effect.triggerApplication !== undefined &&
    effect.triggerApplication !== "transient" &&
    effect.triggerApplication !== "duration" &&
    effect.triggerApplication !== "stack"
  ) {
    issue(issues, "invalid-trigger-application", path, "triggerApplication不是已声明类型。");
  }
  validateConditions(effect.conditions, `${path}.conditions`, issues);
  if (
    effect.targetTroop !== undefined &&
    !VALID_TARGETS.has(effect.targetTroop)
  ) {
    issue(issues, "invalid-target", path, `非法targetTroop：${effect.targetTroop as string}。`);
  }
  if (
    effect.targetEnemyTroop !== undefined &&
    !VALID_TARGETS.has(effect.targetEnemyTroop)
  ) {
    issue(issues, "invalid-target", path, `非法targetEnemyTroop：${effect.targetEnemyTroop as string}。`);
  }
  validateTrigger(effect.trigger ?? null, `${path}.trigger`, issues);
  validateLifecycle(effect.lifecycle, `${path}.lifecycle`, issues);

  if (effect.status === "supported") {
    if (effect.type === null || effect.value === null) {
      issue(issues, "incomplete-supported-effect", path, "supported效果必须提供type和value。");
    }
    const effectiveTrigger = effect.trigger ?? inheritedTrigger;
    if (effectiveTrigger === null) {
      issue(issues, "missing-supported-trigger", path, "supported效果必须提供trigger。");
    } else if (!isSupportedEffectTrigger(
      effectiveTrigger,
      effect.lifecycle ?? inheritedLifecycle,
      effect,
    )) {
      issue(
        issues,
        "unsupported-trigger-marked-supported",
        path,
        "supported效果只允许always、字段完整的即时/持续概率、onSkillTrigger联动、概率联动、概率extraAttack、周期叠层或周期extraDamage。",
      );
    }
    if (effect.type === "extraDamage") {
      for (const message of extraDamageEffectValidationErrors(effect)) {
        issue(issues, "incomplete-supported-extra-damage", path, message);
      }
    }
    if (effect.type === "extraAttack") {
      for (const message of extraAttackEffectValidationErrors(effect)) {
        issue(issues, "incomplete-supported-extra-attack", path, message);
      }
    }
    if (
      effect.targetEnemyTroop !== undefined &&
      effect.targetEnemyTroop !== "all"
    ) {
      const conditionMatchesTarget = effect.conditions?.some(
        (condition) =>
          condition.type === "enemyTroopType" &&
          condition.troopType === effect.targetEnemyTroop,
      );
      if (!conditionMatchesTarget) {
        issue(
          issues,
          "enemy-target-condition-marked-supported",
          path,
          "指定敌方兵种的supported效果必须提供对应enemyTroopType条件。",
        );
      }
    }
  }
}

function isSupportedEffectTrigger(
  trigger: SkillTrigger,
  lifecycle: EffectLifecycle | undefined,
  effect: SkillEffectData,
): boolean {
  if (trigger.type === "always") return lifecycle === undefined;
  if (trigger.type === "onSkillTrigger") {
    return (
      Boolean(trigger.sourceSkillId) &&
      isSupportedTriggeredApplication(effect, lifecycle)
    );
  }
  if (trigger.type === "everyNRounds") {
    const hasExplicitSchedule =
      trigger.firstTriggerRound !== undefined &&
      Number.isSafeInteger(trigger.firstTriggerRound) &&
      trigger.firstTriggerRound >= 1 &&
      trigger.triggerPhase !== undefined &&
      (trigger.probability === undefined ||
        (Number.isFinite(trigger.probability) &&
          trigger.probability >= 0 &&
          trigger.probability <= 1));
    if (!hasExplicitSchedule) return false;
    if (effect.type === "extraDamage") {
      return (
        lifecycle === undefined &&
        trigger.triggerPhase !== "roundEnd"
      );
    }
    return (
      lifecycle?.refreshMode === "stack" &&
      lifecycle.activationTiming !== undefined &&
      lifecycle.maxStacks !== undefined &&
      Number.isSafeInteger(lifecycle.maxStacks) &&
      lifecycle.maxStacks >= 1 &&
      lifecycle.atMaxStacks === "keep" &&
      lifecycle.durationRounds === undefined &&
      lifecycle.decayRate === undefined &&
      Number.isFinite(effect.valuePerStack) &&
      effect.value === effect.valuePerStack
    );
  }
  if (trigger.type !== "probability") return false;
  if (trigger.event === "onSkillTrigger") {
    return (
      Boolean(trigger.requiredSkillId) &&
      trigger.triggerPhase !== undefined &&
      trigger.frequency === "explicitSchedule" &&
      isSupportedTriggeredApplication(effect, lifecycle)
    );
  }
  const supportedPhases =
    (effect.type === "extraDamage" || effect.type === "extraAttack") &&
    lifecycle === undefined
      ? new Set(["roundStart", "beforeAttack", "onAttack", "afterAttack"])
      : new Set(["roundStart", "beforeAttack", "onAttack"]);
  const hasSupportedTiming =
    trigger.triggerPhase !== undefined &&
    supportedPhases.has(trigger.triggerPhase) &&
    trigger.frequency !== undefined &&
    trigger.frequency !== "oncePerAttack";
  if (!hasSupportedTiming) return false;
  if (lifecycle === undefined) return trigger.durationRounds === undefined;
  return (
    lifecycle.durationRounds !== undefined &&
    Number.isSafeInteger(lifecycle.durationRounds) &&
    lifecycle.durationRounds >= 1 &&
    (trigger.durationRounds === undefined ||
      trigger.durationRounds === lifecycle.durationRounds) &&
    (lifecycle.activationTiming === "immediate" ||
      lifecycle.activationTiming === "nextRound") &&
    (lifecycle.refreshMode === "refresh" ||
      lifecycle.refreshMode === "replace") &&
    lifecycle.maxStacks === undefined &&
    lifecycle.atMaxStacks === undefined &&
    lifecycle.decayRate === undefined &&
    lifecycle.maxApplications === undefined
  );
}

function isSupportedTriggeredApplication(
  effect: SkillEffectData,
  lifecycle: EffectLifecycle | undefined,
): boolean {
  if (effect.triggerApplication === "transient") {
    return lifecycle === undefined;
  }
  if (effect.triggerApplication === "duration") {
    return (
      lifecycle?.durationRounds !== undefined &&
      Number.isSafeInteger(lifecycle.durationRounds) &&
      lifecycle.durationRounds >= 1 &&
      (lifecycle.activationTiming === "immediate" ||
        lifecycle.activationTiming === "nextRound") &&
      (lifecycle.refreshMode === "refresh" ||
        lifecycle.refreshMode === "replace")
    );
  }
  return (
    effect.triggerApplication === "stack" &&
    lifecycle?.refreshMode === "stack" &&
    lifecycle.activationTiming !== undefined &&
    lifecycle.maxStacks !== undefined &&
    Number.isSafeInteger(lifecycle.maxStacks) &&
    lifecycle.maxStacks >= 1 &&
    lifecycle.atMaxStacks === "keep" &&
    Number.isFinite(effect.valuePerStack) &&
    effect.value === effect.valuePerStack
  );
}

function validateTrigger(
  trigger: SkillTrigger | null,
  path: string,
  issues: DataValidationIssue[],
): void {
  if (trigger === null) return;
  if (trigger.type === "probability") {
    if (
      !Number.isFinite(trigger.probability) ||
      trigger.probability < 0 ||
      trigger.probability > 1
    ) {
      issue(issues, "invalid-probability", path, "probability必须位于[0,1]。 ");
    }
    if (
      trigger.durationRounds !== undefined &&
      (!Number.isSafeInteger(trigger.durationRounds) ||
        trigger.durationRounds < 1)
    ) {
      issue(issues, "invalid-duration", path, "durationRounds必须是正安全整数。");
    }
    if (
      trigger.triggerPhase !== undefined &&
      !PROBABILITY_TRIGGER_PHASES.includes(trigger.triggerPhase)
    ) {
      issue(issues, "invalid-trigger-phase", path, "triggerPhase不在已声明枚举中。");
    }
    if (
      trigger.frequency !== undefined &&
      !PROBABILITY_TRIGGER_FREQUENCIES.includes(trigger.frequency)
    ) {
      issue(issues, "invalid-trigger-frequency", path, "frequency不在已声明枚举中。");
    }
    if (
      trigger.event === "onSkillTrigger" &&
      !trigger.requiredSkillId?.trim()
    ) {
      issue(
        issues,
        "missing-required-skill-id",
        path,
        "概率onSkillTrigger必须声明requiredSkillId。",
      );
    }
    if (
      trigger.requiredSkillId !== undefined &&
      trigger.event !== "onSkillTrigger"
    ) {
      issue(
        issues,
        "orphan-required-skill-id",
        path,
        "requiredSkillId只能用于event=onSkillTrigger。",
      );
    }
    if (
      trigger.attemptsPerRound !== undefined &&
      (!Number.isSafeInteger(trigger.attemptsPerRound) || trigger.attemptsPerRound < 1)
    ) {
      issue(issues, "invalid-attempt-count", path, "attemptsPerRound必须是正安全整数。");
    }
    if (trigger.independentTroopTargets !== undefined) {
      const targets = trigger.independentTroopTargets;
      if (
        targets.length === 0 ||
        targets.some((target) => !["shield", "lancer", "marksman"].includes(target)) ||
        new Set(targets).size !== targets.length
      ) {
        issue(
          issues,
          "invalid-independent-troop-targets",
          path,
          "independentTroopTargets必须是非空、无重复的合法兵种列表。",
        );
      }
    }
    if (
      trigger.instanceAggregation !== undefined &&
      !trigger.instanceAggregation.groupId.trim()
    ) {
      issue(issues, "invalid-probability-group", path, "概率实例聚合groupId不能为空。");
    }
    if (
      trigger.instanceAggregation !== undefined &&
      (trigger.instanceAggregation.stackingMode !== "probabilityOnly" ||
        trigger.instanceAggregation.magnitudeStacking !== false)
    ) {
      issue(
        issues,
        "invalid-probability-aggregation",
        path,
        "当前概率实例聚合只支持probabilityOnly且magnitudeStacking=false。",
      );
    }
  }
  if (
    trigger.type === "everyNRounds" &&
    (!Number.isSafeInteger(trigger.interval) || trigger.interval < 1)
  ) {
    issue(issues, "invalid-interval", path, "interval必须是正安全整数。");
  }
  if (trigger.type === "everyNRounds") {
    if (
      trigger.firstTriggerRound !== undefined &&
      (!Number.isSafeInteger(trigger.firstTriggerRound) ||
        trigger.firstTriggerRound < 1)
    ) {
      issue(issues, "invalid-first-trigger-round", path, "firstTriggerRound必须是正安全整数。");
    }
    if (
      trigger.firstRound !== undefined &&
      (!Number.isSafeInteger(trigger.firstRound) || trigger.firstRound < 1)
    ) {
      issue(issues, "invalid-first-round", path, "firstRound必须是正安全整数。");
    }
    if (
      trigger.firstRound !== undefined &&
      trigger.firstTriggerRound !== undefined &&
      trigger.firstRound !== trigger.firstTriggerRound
    ) {
      issue(issues, "conflicting-first-trigger-round", path, "firstRound与firstTriggerRound不一致。");
    }
    if (
      trigger.triggerPhase !== undefined &&
      !PROBABILITY_TRIGGER_PHASES.includes(trigger.triggerPhase)
    ) {
      issue(issues, "invalid-trigger-phase", path, "triggerPhase不在已声明枚举中。");
    }
    if (
      trigger.probability !== undefined &&
      (!Number.isFinite(trigger.probability) ||
        trigger.probability < 0 ||
        trigger.probability > 1)
    ) {
      issue(issues, "invalid-probability", path, "probability必须位于[0,1]。 ");
    }
  }
  if (
    trigger.type === "stacking" &&
    (!Number.isSafeInteger(trigger.maxStacks) || trigger.maxStacks < 1)
  ) {
    issue(issues, "invalid-max-stacks", path, "maxStacks必须是正安全整数。");
  }
  if (trigger.type === "onSkillTrigger" && !trigger.sourceSkillId?.trim()) {
    issue(
      issues,
      "missing-source-skill-id",
      path,
      "onSkillTrigger必须声明sourceSkillId。",
    );
  }
}

function validateConditions(
  conditions: SkillEffectData["conditions"],
  path: string,
  issues: DataValidationIssue[],
): void {
  if (conditions === undefined) return;
  for (const [index, condition] of conditions.entries()) {
    const conditionPath = `${path}[${index}]`;
    if (condition.type === "sourceSkillTriggered") {
      if (!condition.requiredSkillId.trim()) {
        issue(issues, "invalid-condition", conditionPath, "requiredSkillId不能为空。");
      }
    } else if (
      condition.type === "attackerTroopType" ||
      condition.type === "enemyTroopType"
    ) {
      if (!VALID_TROOP_TYPES.has(condition.troopType)) {
        issue(issues, "invalid-condition", conditionPath, "条件兵种无效。");
      }
    } else if (condition.type === "attackKind") {
      if (condition.attackKind !== "normal" && condition.attackKind !== "extra") {
        issue(issues, "invalid-condition", conditionPath, "attackKind无效。");
      }
    } else if (condition.type === "round") {
      validateNumericCondition(condition.operator, condition.value, conditionPath, issues);
      if (!Number.isSafeInteger(condition.value) || condition.value < 1) {
        issue(issues, "invalid-condition", conditionPath, "round条件值必须是正安全整数。");
      }
    } else if (condition.type === "stackCount") {
      if (!condition.activeEffectId.trim()) {
        issue(issues, "invalid-condition", conditionPath, "activeEffectId不能为空。");
      }
      validateNumericCondition(condition.operator, condition.value, conditionPath, issues);
      if (!Number.isSafeInteger(condition.value) || condition.value < 0) {
        issue(issues, "invalid-condition", conditionPath, "stackCount条件值必须是非负安全整数。");
      }
    }
  }
}

function validateNumericCondition(
  operator: string,
  value: number,
  path: string,
  issues: DataValidationIssue[],
): void {
  if (!["eq", "gte", "lte", "gt", "lt"].includes(operator)) {
    issue(issues, "invalid-condition", path, "数值条件operator无效。");
  }
  if (!Number.isFinite(value)) {
    issue(issues, "invalid-condition", path, "数值条件value必须是有限数。");
  }
}

function validateLifecycle(
  lifecycle: EffectLifecycle | undefined,
  path: string,
  issues: DataValidationIssue[],
): void {
  if (lifecycle === undefined) return;
  if (
    lifecycle.activationTiming !== undefined &&
    lifecycle.activationTiming !== "immediate" &&
    lifecycle.activationTiming !== "nextRound"
  ) {
    issue(issues, "invalid-activation-timing", path, "activationTiming必须是immediate或nextRound。");
  }
  for (const key of ["durationRounds", "maxStacks", "maxApplications"] as const) {
    const value = lifecycle[key];
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
      issue(issues, `invalid-${key}`, path, `${key}必须是正安全整数。`);
    }
  }
  if (
    lifecycle.decayRate !== undefined &&
    (!Number.isFinite(lifecycle.decayRate) ||
      lifecycle.decayRate < 0 ||
      lifecycle.decayRate > 1)
  ) {
    issue(issues, "invalid-decay-rate", path, "decayRate必须位于[0,1]。 ");
  }
  if (
    lifecycle.atMaxStacks !== undefined &&
    lifecycle.atMaxStacks !== "keep" &&
    lifecycle.atMaxStacks !== "refreshDuration"
  ) {
    issue(issues, "invalid-at-max-stacks", path, "atMaxStacks不是已声明行为。");
  }
}

function validateReason(
  status: SkillCalculationStatus,
  reason: string | null,
  path: string,
  issues: DataValidationIssue[],
): void {
  if (status !== "supported" && (reason === null || !reason.trim())) {
    issue(
      issues,
      status === "pending"
        ? "missing-pending-reason"
        : "missing-unsupported-reason",
      path,
      `${status}数据必须提供原因。`,
    );
  }
}

function checkUnique(
  values: readonly string[],
  label: string,
  issues: DataValidationIssue[],
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      issue(issues, `duplicate-${label}`, label, `重复${label}：${value}。`);
    }
    seen.add(value);
  }
}

function issue(
  issues: DataValidationIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function result(
  checkedCount: number,
  issues: readonly DataValidationIssue[],
): DataValidationResult {
  return { valid: issues.length === 0, checkedCount, issues };
}
