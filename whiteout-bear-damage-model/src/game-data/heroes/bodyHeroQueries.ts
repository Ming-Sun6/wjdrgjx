import type {
  BodyHeroDefinition,
  HeroId,
  PendingHeroDefinition,
  SupportedHeroDefinition,
  UnsupportedHeroDefinition,
} from "../../domain/hero";
import { bodyHeroes } from "./bodyHeroes";

const allBodyHeroes: readonly BodyHeroDefinition[] = Object.freeze(
  Object.values(bodyHeroes),
);
const heroesById: Readonly<Record<string, BodyHeroDefinition>> = bodyHeroes;

export function getAllBodyHeroes(): readonly BodyHeroDefinition[] {
  return allBodyHeroes;
}

export function getSupportedBodyHeroes(): readonly SupportedHeroDefinition[] {
  return allBodyHeroes.filter(
    (hero): hero is SupportedHeroDefinition => hero.status === "supported",
  );
}

export function getPendingBodyHeroes(): readonly PendingHeroDefinition[] {
  return allBodyHeroes.filter(
    (hero): hero is PendingHeroDefinition => hero.status === "pending",
  );
}

export function getUnsupportedBodyHeroes(): readonly UnsupportedHeroDefinition[] {
  return allBodyHeroes.filter(
    (hero): hero is UnsupportedHeroDefinition => hero.status === "unsupported",
  );
}

export function getHeroById(heroId: HeroId): BodyHeroDefinition | undefined {
  return heroesById[heroId];
}
