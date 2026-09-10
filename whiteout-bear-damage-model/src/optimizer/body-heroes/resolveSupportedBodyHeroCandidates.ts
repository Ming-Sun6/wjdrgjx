import type { BodyHeroId, SupportedHeroDefinition } from "../../domain/hero";
import {
  getHeroById,
  getSupportedBodyHeroes,
} from "../../game-data/heroes/bodyHeroQueries";
import {
  DuplicateOptimizerHeroError,
  UnavailableOptimizerHeroError,
  UnknownOptimizerHeroError,
} from "./errors";

/** 为所有车身优化器提供同一套 supported 候选池校验。 */
export function resolveSupportedBodyHeroCandidates(
  requestedIds: readonly BodyHeroId[] | undefined,
): readonly SupportedHeroDefinition[] {
  if (requestedIds === undefined) {
    return getSupportedBodyHeroes();
  }

  const seen = new Set<BodyHeroId>();

  return requestedIds.map((heroId) => {
    if (seen.has(heroId)) {
      throw new DuplicateOptimizerHeroError(heroId);
    }
    seen.add(heroId);

    const hero = getHeroById(heroId);

    if (hero === undefined) {
      throw new UnknownOptimizerHeroError(heroId);
    }

    if (hero.status !== "supported") {
      throw new UnavailableOptimizerHeroError(heroId, hero.status);
    }

    return hero;
  });
}
