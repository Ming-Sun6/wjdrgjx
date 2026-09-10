import type { Skill, SkillEffectData } from "../../domain/skill";
import type { TroopSkillDefinition } from "../../domain/troopSkill";
import { InvalidSkillEffectError } from "./errors";

export interface SkippedCatalogEffect {
  readonly effectId: string;
  readonly status: "pending" | "unsupported";
  readonly reason: string;
}

export interface SupportedCatalogEffectResolution {
  readonly skills: readonly Skill[];
  readonly skippedEffects: readonly SkippedCatalogEffect[];
}

/**
 * 将目录中 effect 级 supported 部分转换成普通 Skill；其余效果只返回解释。
 * 每个效果可有独立 trigger，因而不需要把混合技能强行设成单一状态。
 */
export function resolveSupportedCatalogEffects(
  definition: TroopSkillDefinition,
): SupportedCatalogEffectResolution {
  const skills: Skill[] = [];
  const skippedEffects: SkippedCatalogEffect[] = [];

  for (const effect of definition.effects) {
    if (effect.status !== "supported") {
      skippedEffects.push({
        effectId: effect.id,
        status: effect.status,
        reason:
          effect.pendingReason ??
          effect.unsupportedReason ??
          `${effect.status} 效果未提供原因。`,
      });
      continue;
    }
    const trigger = effect.trigger ?? definition.trigger;
    if (trigger === null) {
      throw new InvalidSkillEffectError(
        `supported效果 ${effect.id} 必须具有trigger。`,
      );
    }
    assertExecutableEffect(effect);
    skills.push({
      id: `${definition.id}.${effect.id}`,
      name: `${definition.name} / ${effect.id}`,
      status: "supported",
      rawDescription: effect.rawDescription,
      source: definition.source,
      sourceRecordId: definition.id,
      ...(definition.sourceKind === undefined
        ? {}
        : { sourceKind: definition.sourceKind }),
      effects: [
        {
          type: effect.type,
          value: effect.value,
          ...(effect.valuePerStack === undefined ||
          effect.valuePerStack === null
            ? {}
            : { valuePerStack: effect.valuePerStack }),
          ...(effect.basis === undefined || effect.basis === null
            ? {}
            : { basis: effect.basis }),
          ...(effect.damageCategory === undefined ||
          effect.damageCategory === null
            ? {}
            : { damageCategory: effect.damageCategory }),
          ...(effect.applicableMultiplierZones === undefined ||
          effect.applicableMultiplierZones === null
            ? {}
            : {
                applicableMultiplierZones:
                  effect.applicableMultiplierZones,
              }),
          ...(effect.count === undefined || effect.count === null
            ? {}
            : { count: effect.count }),
          ...(effect.damageScale === undefined || effect.damageScale === null
            ? {}
            : { damageScale: effect.damageScale }),
          ...(effect.triggerPolicy === undefined || effect.triggerPolicy === null
            ? {}
            : { triggerPolicy: effect.triggerPolicy }),
          ...(effect.maxAttackDepth === undefined ||
          effect.maxAttackDepth === null
            ? {}
            : { maxAttackDepth: effect.maxAttackDepth }),
          status: "supported",
          rawDescription: effect.rawDescription,
          ...(effect.targetTroop === undefined
            ? {}
            : { targetTroop: effect.targetTroop }),
          ...(effect.lifecycle === undefined
            ? {}
            : { lifecycle: effect.lifecycle }),
          ...(effect.conditions === undefined
            ? {}
            : { conditions: effect.conditions }),
          ...(effect.triggerApplication === undefined
            ? {}
            : { triggerApplication: effect.triggerApplication }),
          ...(effect.maxTriggerDepth === undefined || effect.maxTriggerDepth === null
            ? {}
            : { maxTriggerDepth: effect.maxTriggerDepth }),
          ...(effect.zoneAggregation === undefined ? {} : { zoneAggregation: effect.zoneAggregation }),
          ...(effect.activeRounds === undefined ? {} : { activeRounds: effect.activeRounds }),
          ...(effect.valueByRound === undefined ? {} : { valueByRound: effect.valueByRound }),
          ...(effect.valueByEnemyTroop === undefined ? {} : { valueByEnemyTroop: effect.valueByEnemyTroop }),
        },
      ],
      trigger,
    });
  }

  return { skills, skippedEffects };
}

function assertExecutableEffect(
  effect: SkillEffectData,
): asserts effect is SkillEffectData & {
  readonly type: NonNullable<SkillEffectData["type"]>;
  readonly value: number;
} {
  if (effect.type === null || effect.value === null) {
    throw new InvalidSkillEffectError(
      `supported效果 ${effect.id} 必须具有type和value。`,
    );
  }
  if (!Number.isFinite(effect.value)) {
    throw new InvalidSkillEffectError(
      `supported效果 ${effect.id} 的value必须是有限数字。`,
    );
  }
}
