import type {
  HeadHeroCatalog,
  HeadHeroDefinition,
  HeadHeroId,
} from "../../domain/hero";
import { getHeadHeroById } from "./headHeroQueries";

export const headHeroCatalog: HeadHeroCatalog = {
  get(heroId: HeadHeroId): HeadHeroDefinition | undefined {
    return getHeadHeroById(heroId);
  },
};
