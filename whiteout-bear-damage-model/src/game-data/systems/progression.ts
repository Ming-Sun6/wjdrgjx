import type { TownBuffSize } from "../../domain/preparation";

export const HUNTER_HEART_RATES = [0,.02,.04,.06,.09,.12,.15,.18,.21,.24,.27,.30] as const;
export const PET_BUFF_RATES = [0,.025,.03,.035,.04,.05,.06,.07,.08,.09,.10] as const;
export const EXCLUSIVE_WEAPON_RATES = [0,.05,.075,.10,.125,.15] as const;
export const TOWN_BUFF_RATES: Readonly<Record<TownBuffSize,number>> = { none:0, small:.10, large:.20 };
export const BEAR_SLAYER_CAPACITY_PER_LEVEL = 3000;
export const PET_CAPACITY_PER_LEVEL = 1500;

export function lookupLevel(table: readonly number[], level:number, label:string):number {
  if(!Number.isSafeInteger(level)||level<0||level>=table.length) throw new Error(`${label}等级超出范围。`);
  return table[level]!;
}
