import type { BearBattleContext } from "../../../domain/bearBattle";

export const BEAR_BATTLE_TOTAL_ROUNDS = 10 as const;
export const BEAR_ENEMY_TROOP_TYPE = "shield" as const;
export const BEAR_ENEMY_INFINITE_HP = true as const;

export const DEFAULT_BEAR_BATTLE_CONTEXT: BearBattleContext = Object.freeze({
  totalRounds: BEAR_BATTLE_TOTAL_ROUNDS,
  enemyTroopType: BEAR_ENEMY_TROOP_TYPE,
  enemyInfiniteHp: BEAR_ENEMY_INFINITE_HP,
  enemyBaseDefense: null,
});
