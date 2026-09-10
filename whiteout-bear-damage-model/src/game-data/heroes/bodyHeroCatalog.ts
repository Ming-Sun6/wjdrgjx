import type { HeroCatalog, HeroDefinition, HeroId } from "../../domain/hero";
import { getHeroById } from "./bodyHeroQueries";

export const bodyHeroCatalog: HeroCatalog = {
  get(heroId: HeroId): HeroDefinition | undefined {
    return getHeroById(heroId);
  },
};
