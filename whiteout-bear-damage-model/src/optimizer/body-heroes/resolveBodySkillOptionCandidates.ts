import type { BodySkillOption } from "../../domain/bodySkillOption";
import type { BodyHeroId } from "../../domain/hero";
import { getAllBodySkillOptions, getBodySkillOptionForHeroId } from "../../game-data/body-skills";
import { BodyOptimizationError } from "./errors";
import { resolveSupportedBodyHeroCandidates } from "./resolveSupportedBodyHeroCandidates";

export function resolveBodySkillOptionCandidates(
  requestedHeroIds: readonly BodyHeroId[] | undefined,
): readonly BodySkillOption[] {
  if (requestedHeroIds === undefined) return getAllBodySkillOptions();
  const options = resolveSupportedBodyHeroCandidates(requestedHeroIds).map((hero) => {
    const option = getBodySkillOptionForHeroId(hero.id);
    if (option === undefined) {
      throw new BodyOptimizationError(`英雄 ${hero.id} 的车身效果不在当前 v0.1 自动优化范围内。`);
    }
    return option;
  });
  return [...new Map(options.map((option) => [option.id, option])).values()];
}
