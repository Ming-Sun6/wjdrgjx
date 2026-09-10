import type { TroopType, TroopTypeDefinition } from "../../domain/troop";

export const troopTypes = {
  shield: {
    id: "shield",
    displayName: "盾兵",
  },
  lancer: {
    id: "lancer",
    displayName: "矛兵",
  },
  marksman: {
    id: "marksman",
    displayName: "射手",
  },
} as const satisfies Record<TroopType, TroopTypeDefinition>;
