import type { MultiplierResolver } from "./MultiplierResolver";

/** 同乘区加算：M = 1 + sum(x_i)。 */
export const additiveMultiplierResolver: MultiplierResolver = {
  resolve(sum: number): number {
    return 1 + sum;
  },
};
