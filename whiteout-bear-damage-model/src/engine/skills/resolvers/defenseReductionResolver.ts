import type { MultiplierResolver } from "./MultiplierResolver";

/** 已确认的打熊减防乘区：M_defRed = 1 + sum(r_i)。 */
export const defenseReductionResolver: MultiplierResolver = {
  resolve(sum: number): number {
    return 1 + sum;
  },
};
