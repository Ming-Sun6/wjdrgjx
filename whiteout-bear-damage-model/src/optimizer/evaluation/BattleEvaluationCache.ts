import type { OptimizerScoringMode } from "../../domain/optimizerScoring";
import type { TenRoundExpectedDamageInput } from "../../domain/tenRoundExpectedDamage";

const DEFAULT_MAX_ENTRIES = 10_000;

export interface BattleEvaluationCacheStatistics {
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly entryCount: number;
  readonly maxEntries: number;
}

/** 单次优化运行内使用的确定性FIFO缓存；容量限制避免联合穷举无限占用内存。 */
export class BattleEvaluationCache<T> {
  readonly #entries = new Map<string, T>();
  readonly #maxEntries: number;
  #cacheHits = 0;
  #cacheMisses = 0;

  public constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
      throw new Error(`BattleEvaluationCache.maxEntries必须是正安全整数，收到：${maxEntries}。`);
    }
    this.#maxEntries = maxEntries;
  }

  public getOrCompute(key: string, compute: () => T): { readonly value: T; readonly hit: boolean } {
    const cached = this.#entries.get(key);
    if (cached !== undefined) {
      this.#cacheHits += 1;
      return { value: cached, hit: true };
    }

    this.#cacheMisses += 1;
    const value = compute();
    if (this.#entries.size >= this.#maxEntries) {
      const oldestKey = this.#entries.keys().next().value as string | undefined;
      if (oldestKey !== undefined) this.#entries.delete(oldestKey);
    }
    this.#entries.set(key, value);
    return { value, hit: false };
  }

  public statistics(): BattleEvaluationCacheStatistics {
    return {
      cacheHits: this.#cacheHits,
      cacheMisses: this.#cacheMisses,
      entryCount: this.#entries.size,
      maxEntries: this.#maxEntries,
    };
  }
}

/** key显式覆盖当前所有影响正式评分的输入；车身顺序因规则无关而规范化。 */
export function createBattleEvaluationKey(
  input: TenRoundExpectedDamageInput,
  scoringMode: OptimizerScoringMode,
  legacyMetricId: string,
  enemyBaseDefense: number | undefined,
  normalizedBodyHeroKeys?: readonly string[],
): string {
  return JSON.stringify({
    scoringMode,
    legacyMetricId,
    battleContext: {
      totalRounds: 10,
      enemyTroopType: "shield",
      enemyInfiniteHp: true,
      enemyBaseDefense: enemyBaseDefense ?? null,
    },
    troops: input.troops.map((troop) => ({
      troopType: troop.troopType,
      troopCount: troop.troopCount,
      troopLevelId: troop.troopLevelId,
      stats: {
        attackPercent: troop.stats.attackPercent,
        defensePercent: troop.stats.defensePercent ?? null,
        penetrationPercent: troop.stats.penetrationPercent,
        healthPercent: troop.stats.healthPercent ?? null,
      },
    })),
    damageChannel: input.damageChannel ?? "base",
    bodyHeroIds: normalizedBodyHeroKeys === undefined
      ? [...input.bodyHeroIds].sort()
      : [...normalizedBodyHeroKeys].sort(),
    headFormation: input.headFormation ?? null,
    // 火晶联动的声明顺序未来可能具有时序意义，因此不擅自排序。
    fireCrystalSkillIds: input.fireCrystal?.skillIds ?? [],
    preparation: input.preparation ?? null,
    battleReportHeroAdjustment: input.battleReportHeroAdjustment ?? null,
  });
}
