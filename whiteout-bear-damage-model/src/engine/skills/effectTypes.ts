import { EFFECT_TYPES, type EffectType } from "../../domain/skill";
import type { TroopType } from "../../domain/troop";

const effectTypeSet: ReadonlySet<string> = new Set(EFFECT_TYPES);

export const TROOP_DAMAGE_EFFECT_BY_TROOP = {
  shield: "shieldDamage",
  lancer: "lancerDamage",
  marksman: "marksmanDamage",
} as const satisfies Record<TroopType, EffectType>;

export const IMPLICIT_TROOP_BY_EFFECT: Readonly<
  Partial<Record<EffectType, TroopType>>
> = {
  shieldDamage: "shield",
  lancerDamage: "lancer",
  marksmanDamage: "marksman",
};

export function isEffectType(value: string): value is EffectType {
  return effectTypeSet.has(value);
}
