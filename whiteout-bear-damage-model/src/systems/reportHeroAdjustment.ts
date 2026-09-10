import type { HeadFormation } from "../domain/battleDamage";
import type {
  BattleReportHeroAdjustmentConfig,
  ResolveBattleReportAttributesInput,
  ResolvedBattleReportAttributeAdjustment,
} from "../domain/reportHero";
import type { TenRoundExpectedDamageInput } from "../domain/tenRoundExpectedDamage";
import type { BaseTroopGroupInput } from "../domain/baseDamage";
import type { TroopType } from "../domain/troop";
import {
  getHeroStaticCombatStats,
  getReportHeroProfileById,
} from "../game-data/heroes/reportHeroProfiles";
import { getHeadHeroById } from "../game-data/heroes/headHeroQueries";

export const BEAR_PIT_ATTACK_PERCENT = 25;
const TROOP_TYPES: readonly TroopType[] = ["shield", "lancer", "marksman"];

export function calculateExclusiveWeaponPenetration(
  maxWeaponPenetrationPercent: number,
  weaponLevel: number,
): number {
  validateWeaponLevel(weaponLevel);
  if (!Number.isFinite(maxWeaponPenetrationPercent) || maxWeaponPenetrationPercent < 0) {
    throw new Error(`专武满级穿透必须是非负有限数，收到：${maxWeaponPenetrationPercent}。`);
  }
  return maxWeaponPenetrationPercent * weaponLevel / 10;
}

export function resolveBattleReportEffectiveAttributes(
  input: ResolveBattleReportAttributesInput,
): ResolvedBattleReportAttributeAdjustment {
  const reportHero = getReportHeroProfileById(input.reportHero.profileId);
  if (reportHero === undefined) throw new Error(`找不到战报英雄档案：${input.reportHero.profileId}。`);
  if (reportHero.troopType !== input.troopType) {
    throw new Error(`${reportHero.label}不能作为${input.troopType}战报英雄。`);
  }
  validateFinitePercent(input.battleReportAttackPercent, "战报攻击");
  validateFinitePercent(input.battleReportPenetrationPercent, "战报穿透");
  validateWeaponLevel(input.reportHero.weaponLevel);
  validateWeaponLevel(input.actualWeaponLevel);
  if (!reportHero.hasExclusiveWeapon && input.reportHero.weaponLevel !== 0) {
    throw new Error(`${reportHero.label}没有专武，战报专武等级必须为0。`);
  }

  // 未选择实际车头时保持静态差值为0，只应用熊坑固定+25%攻击。
  const actualHero = input.actualHeadHeroId === undefined
    ? undefined
    : getHeadHeroById(input.actualHeadHeroId);
  if (actualHero !== undefined && actualHero.troopType !== input.troopType) {
    throw new Error(`${actualHero.name}不能作为${input.troopType}实际车头。`);
  }
  const actualStats = input.actualHeadHeroId === undefined
    ? reportHero
    : getHeroStaticCombatStats(input.actualHeadHeroId);
  const actualWeaponLevel = input.actualHeadHeroId === undefined ? input.reportHero.weaponLevel : input.actualWeaponLevel;
  const reportWeaponPenetrationPercent = calculateExclusiveWeaponPenetration(
    reportHero.maxWeaponPenetrationPercent,
    input.reportHero.weaponLevel,
  );
  const actualWeaponPenetrationPercent = calculateExclusiveWeaponPenetration(
    actualStats.maxWeaponPenetrationPercent,
    actualWeaponLevel,
  );
  const deltaAttackPercent = actualStats.heroAttackPercent - reportHero.heroAttackPercent;
  const deltaPenetrationPercent = actualWeaponPenetrationPercent - reportWeaponPenetrationPercent;

  return {
    troopType: input.troopType,
    reportHero,
    actualHeadHeroId: input.actualHeadHeroId ?? null,
    reportWeaponLevel: input.reportHero.weaponLevel,
    actualWeaponLevel,
    reportHeroAttackPercent: reportHero.heroAttackPercent,
    actualHeroAttackPercent: actualStats.heroAttackPercent,
    reportWeaponPenetrationPercent,
    actualWeaponPenetrationPercent,
    deltaAttackPercent,
    deltaPenetrationPercent,
    bearPitAttackPercent: BEAR_PIT_ATTACK_PERCENT,
    correctedAttackPercent: input.battleReportAttackPercent + deltaAttackPercent + BEAR_PIT_ATTACK_PERCENT,
    correctedPenetrationPercent: input.battleReportPenetrationPercent + deltaPenetrationPercent,
  };
}

export function resolveBattleReportAdjustedTroops(
  troops: readonly BaseTroopGroupInput[],
  headFormation: HeadFormation,
  config: BattleReportHeroAdjustmentConfig,
): {
  readonly troops: readonly BaseTroopGroupInput[];
  readonly adjustments: Readonly<Record<TroopType, ResolvedBattleReportAttributeAdjustment>>;
} {
  const troopByType = new Map(troops.map((troop) => [troop.troopType, troop]));
  const adjustments = {} as Record<TroopType, ResolvedBattleReportAttributeAdjustment>;
  const resolvedTroops = TROOP_TYPES.map((troopType) => {
    const troop = troopByType.get(troopType);
    if (troop === undefined) throw new Error(`战报属性修正缺少${troopType}兵种输入。`);
    const actualHeadHeroId = headFormation[`${troopType}HeroId`];
    const adjustment = resolveBattleReportEffectiveAttributes({
      troopType,
      battleReportAttackPercent: troop.stats.attackPercent,
      battleReportPenetrationPercent: troop.stats.penetrationPercent,
      reportHero: config.reportHeroes[troopType],
      ...(actualHeadHeroId === undefined ? {} : { actualHeadHeroId }),
      actualWeaponLevel: config.actualWeaponLevels[troopType],
    });
    adjustments[troopType] = adjustment;
    return {
      ...troop,
      stats: {
        ...troop.stats,
        attackPercent: adjustment.correctedAttackPercent,
        penetrationPercent: adjustment.correctedPenetrationPercent,
      },
    };
  });
  return { troops: resolvedTroops, adjustments };
}

export function resolveBattleReportAdjustedInput(input: TenRoundExpectedDamageInput): {
  readonly input: TenRoundExpectedDamageInput;
  readonly adjustments?: Readonly<Record<TroopType, ResolvedBattleReportAttributeAdjustment>>;
} {
  if (input.battleReportHeroAdjustment === undefined) return { input };
  const { battleReportHeroAdjustment, ...withoutAdjustment } = input;
  const resolved = resolveBattleReportAdjustedTroops(
    input.troops,
    input.headFormation ?? {},
    battleReportHeroAdjustment,
  );
  return {
    input: { ...withoutAdjustment, troops: resolved.troops },
    adjustments: resolved.adjustments,
  };
}

function validateWeaponLevel(level: number): void {
  if (!Number.isSafeInteger(level) || level < 0 || level > 10) {
    throw new Error(`专武等级必须是0至10的整数，收到：${level}。`);
  }
}

function validateFinitePercent(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label}必须是有限数，收到：${value}。`);
}
