import type {
  BattleDamageInput,
  BattleDamageResult,
} from "../domain/battleDamage";
import type { Skill } from "../domain/skill";
import {
  calculateBattleDamageFromCatalog,
  type BattleDamageRuntimeOptions,
} from "../engine/battle/calculateBattleDamage";
import { calculateSimplifiedBearRoundDamage } from "../engine/battle/calculateSimplifiedBearRoundDamage";
import { bodyHeroCatalog } from "../game-data/heroes/bodyHeroCatalog";
import { headHeroCatalog } from "../game-data/heroes/headHeroCatalog";

/** 使用当前游戏数据配置的应用层计算入口。 */
export const calculateBattleDamage: (
  input: BattleDamageInput,
) => BattleDamageResult = (input) =>
  calculateSimplifiedBearRoundDamage(
    input,
    { heroCatalog: bodyHeroCatalog, headHeroCatalog },
    [],
    { ignoreNonAlwaysCatalogSkills: true },
  );

/**
 * 历史事件框架兼容入口；保留给底层 AttackEvent/extraAttack 单元测试和未来扩展。
 * 当前正式十回合入口、UI、优化器与 benchmark 不调用此函数。
 */
export function calculateBattleDamageWithAdditionalSkills(
  input: BattleDamageInput,
  additionalSkills: readonly Skill[],
  runtimeOptions: BattleDamageRuntimeOptions = {},
): BattleDamageResult {
  return calculateBattleDamageFromCatalog(
    input,
    { heroCatalog: bodyHeroCatalog, headHeroCatalog },
    additionalSkills,
    runtimeOptions,
  );
}
