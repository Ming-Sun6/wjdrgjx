import type {
  TroopCounts,
  TroopRatios,
} from "../../domain/troopRatioOptimization";
import type { TroopType } from "../../domain/troop";
import {
  InvalidTotalTroopCountError,
  InvalidTroopRatioError,
} from "./errors";
import { toCommonDecimalUnits } from "./decimalUnits";

const TROOP_TYPES: readonly TroopType[] = ["shield", "lancer", "marksman"];
/** UI按0.01%展示；半个显示单位内的IEEE-754误差视为同一比例。 */
export const TROOP_RATIO_SUM_EPSILON = 0.005;

/**
 * 使用 largest remainder method 把百分比转换为整数兵数。
 * 余数相同时固定按 shield、lancer、marksman 顺序分配，结果不依赖随机数。
 */
export function allocateTroopsByRatio(
  totalTroopCount: number,
  ratios: TroopRatios,
): TroopCounts {
  if (!Number.isSafeInteger(totalTroopCount) || totalTroopCount < 0) {
    throw new InvalidTotalTroopCountError(totalTroopCount);
  }

  const ratioValues = TROOP_TYPES.map((troopType) => ratios[troopType]);

  for (const [index, ratio] of ratioValues.entries()) {
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 100) {
      throw new InvalidTroopRatioError(
        `${TROOP_TYPES[index]} 比例必须位于 0%～100%，收到：${ratio}。`,
      );
    }
  }

  const ratioTotal = ratioValues.reduce((sum, value) => sum + value, 0);
  if (Math.abs(ratioTotal - 100) > TROOP_RATIO_SUM_EPSILON) {
    throw new InvalidTroopRatioError(
      `盾/矛/射比例之和必须为 100.00%，当前为 ${ratioTotal.toFixed(2)}%。`,
    );
  }

  const { units, scale } = toCommonDecimalUnits(ratioValues);
  const ratioUnits = units.slice(0, TROOP_TYPES.length);
  const ratioSum = ratioUnits.reduce((sum, value) => sum + value, 0n);

  if (scale <= 0n || ratioSum <= 0n) {
    throw new InvalidTroopRatioError("比例单位转换失败。");
  }

  const total = BigInt(totalTroopCount);
  const allocations = ratioUnits.map((ratioUnit, index) => {
    const numerator = total * ratioUnit;
    return {
      index,
      count: numerator / ratioSum,
      remainder: numerator % ratioSum,
    };
  });
  const allocated = allocations.reduce((sum, item) => sum + item.count, 0n);
  const remaining = total - allocated;
  const remainderOrder = [...allocations].sort((left, right) => {
    if (left.remainder === right.remainder) {
      return left.index - right.index;
    }
    return left.remainder > right.remainder ? -1 : 1;
  });

  for (let index = 0; index < Number(remaining); index += 1) {
    remainderOrder[index]!.count += 1n;
  }

  const counts = allocations.map((item) => Number(item.count));

  return {
    shield: counts[0]!,
    lancer: counts[1]!,
    marksman: counts[2]!,
  };
}
