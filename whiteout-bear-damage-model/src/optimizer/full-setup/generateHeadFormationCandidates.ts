import type { HeadFormation } from "../../domain/battleDamage";
import type { HeadOptimizationDimension, HeadSlotDimension } from "../../domain/fullBattleSetupOptimization";
import type { HeadHeroDefinition, HeadHeroId } from "../../domain/hero";
import type { TroopType } from "../../domain/troop";
import { InvalidHeadCandidateError, NoFullSetupCandidateError } from "./errors";

const SLOTS = ["shield", "lancer", "marksman"] as const;

export interface HeadCandidateDataSource {
  readonly getAllHeadHeroes: () => readonly HeadHeroDefinition[];
  readonly getHeadHeroById: (heroId: HeadHeroId) => HeadHeroDefinition | undefined;
}

export interface HeadFormationCandidate {
  readonly formation: HeadFormation;
  readonly heroes: readonly HeadHeroDefinition[];
  readonly key: string;
}

export interface HeadFormationGenerationResult {
  readonly candidates: readonly HeadFormationCandidate[];
  readonly skippedIncompatibleCount: number;
}

export function generateHeadFormationCandidates(
  dimension: HeadOptimizationDimension | undefined,
  dataSource: HeadCandidateDataSource,
): HeadFormationGenerationResult {
  const bySlot = Object.fromEntries(
    SLOTS.map((slot) => [
      slot,
      resolveSlotCandidates(slot, dimension?.[slot] ?? { mode: "fixed" }, dataSource),
    ]),
  ) as Record<TroopType, readonly (HeadHeroDefinition | null)[]>;
  const candidates: HeadFormationCandidate[] = [];
  let skippedIncompatibleCount = 0;

  for (const shield of bySlot.shield) {
    for (const lancer of bySlot.lancer) {
      for (const marksman of bySlot.marksman) {
        const heroes = [shield, lancer, marksman].filter(
          (hero): hero is HeadHeroDefinition => hero !== null,
        );
        if (!satisfiesExclusiveGroups(heroes)) {
          skippedIncompatibleCount += 1;
          continue;
        }
        const formation: HeadFormation = {
          ...(shield === null ? {} : { shieldHeroId: shield.id }),
          ...(lancer === null ? {} : { lancerHeroId: lancer.id }),
          ...(marksman === null ? {} : { marksmanHeroId: marksman.id }),
        };
        candidates.push({ formation, heroes, key: headFormationKey(formation) });
      }
    }
  }

  if (candidates.length === 0) throw new NoFullSetupCandidateError("head");
  candidates.sort((left, right) => left.key.localeCompare(right.key));
  return { candidates, skippedIncompatibleCount };
}

export function headFormationKey(formation: HeadFormation): string {
  return [
    formation.shieldHeroId ?? "",
    formation.lancerHeroId ?? "",
    formation.marksmanHeroId ?? "",
  ].join("|");
}

function resolveSlotCandidates(
  slot: TroopType,
  dimension: HeadSlotDimension,
  dataSource: HeadCandidateDataSource,
): readonly (HeadHeroDefinition | null)[] {
  if (dimension.mode === "fixed") {
    return dimension.fixedHeroId === undefined
      ? [null]
      : [resolveHero(dimension.fixedHeroId, slot, dataSource)];
  }

  const ids =
    dimension.candidateHeroIds ??
    dataSource
      .getAllHeadHeroes()
      .filter((hero) => hero.troopType === slot && hero.optimizableForBear !== false)
      .map((hero) => hero.id);
  if (new Set(ids).size !== ids.length) {
    throw new InvalidHeadCandidateError(`${slot}车头候选ID不能重复。`);
  }
  const heroes = ids.map((heroId) => resolveHero(heroId, slot, dataSource));
  const includeEmpty = dimension.includeEmpty ?? true;
  const candidates = includeEmpty ? [null, ...heroes] : heroes;
  if (candidates.length === 0) throw new NoFullSetupCandidateError(`${slot} head`);
  return candidates;
}

function resolveHero(
  heroId: HeadHeroId,
  slot: TroopType,
  dataSource: HeadCandidateDataSource,
): HeadHeroDefinition {
  const hero = dataSource.getHeadHeroById(heroId);
  if (hero === undefined) {
    throw new InvalidHeadCandidateError(`不存在车头英雄：${heroId}。`);
  }
  if (hero.troopType === null) {
    throw new InvalidHeadCandidateError(`车头英雄 ${heroId} 的兵种未知，不能参与${slot}槽搜索。`);
  }
  if (hero.troopType !== slot) {
    throw new InvalidHeadCandidateError(
      `车头英雄 ${heroId} 属于${hero.troopType}，不能放入${slot}槽。`,
    );
  }
  if (hero.optimizableForBear === false) {
    throw new InvalidHeadCandidateError(
      `车头英雄 ${heroId} 不是打熊远征候选。`,
    );
  }
  return hero;
}

function satisfiesExclusiveGroups(
  heroes: readonly HeadHeroDefinition[],
): boolean {
  const seen = new Set<string>();
  for (const hero of heroes) {
    for (const groupId of hero.exclusiveGroupIds ?? []) {
      if (seen.has(groupId)) return false;
      seen.add(groupId);
    }
  }
  return true;
}
