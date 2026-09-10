import type {
  TroopRatioBounds,
  TroopRatios,
} from "../../domain/troopRatioOptimization";
import type { TroopType } from "../../domain/troop";
import {
  InvalidStepPercentError,
  InvalidTroopRatioBoundsError,
  NoFeasibleTroopRatioError,
} from "./errors";
import {
  decimalUnitsToNumber,
  toCommonDecimalUnits,
} from "./decimalUnits";

const TROOP_TYPES: readonly TroopType[] = ["shield", "lancer", "marksman"];

export interface TroopRatioGridOptions {
  readonly minimumRatios?: TroopRatioBounds;
  readonly maximumRatios?: TroopRatioBounds;
}

/** 使用整数百分比单位枚举，避免用浮点数反复 += stepPercent。 */
export function generateTroopRatioGrid(
  stepPercent: number,
  options: TroopRatioGridOptions = {},
): readonly TroopRatios[] {
  if (!Number.isFinite(stepPercent) || stepPercent <= 0 || stepPercent > 100) {
    throw new InvalidStepPercentError(
      stepPercent,
      "必须是大于 0 且不超过 100 的有限数字。",
    );
  }

  const { units, decimalPlaces } = toCommonDecimalUnits([stepPercent, 100]);
  const stepUnits = units[0]!;
  const totalUnits = units[1]!;

  if (totalUnits % stepUnits !== 0n) {
    throw new InvalidStepPercentError(
      stepPercent,
      "步长必须能整除 100，以保证三个兵种都位于同一比例网格。",
    );
  }

  const tickCountBigInt = totalUnits / stepUnits;
  if (tickCountBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new InvalidStepPercentError(stepPercent, "离散格点数量超出安全整数范围。");
  }

  const tickCount = Number(tickCountBigInt);
  const minimumRatios = resolveBounds(options.minimumRatios, 0, "最低");
  const maximumRatios = resolveBounds(options.maximumRatios, 100, "最高");

  for (const troopType of TROOP_TYPES) {
    if (minimumRatios[troopType] > maximumRatios[troopType]) {
      throw new InvalidTroopRatioBoundsError(
        `${troopType} 的最低比例不能大于最高比例。`,
      );
    }
  }

  const ratios: TroopRatios[] = [];

  for (let shieldTick = 0; shieldTick <= tickCount; shieldTick += 1) {
    for (
      let lancerTick = 0;
      lancerTick <= tickCount - shieldTick;
      lancerTick += 1
    ) {
      const marksmanTick = tickCount - shieldTick - lancerTick;
      const candidate: TroopRatios = {
        shield: decimalUnitsToNumber(
          BigInt(shieldTick) * stepUnits,
          decimalPlaces,
        ),
        lancer: decimalUnitsToNumber(
          BigInt(lancerTick) * stepUnits,
          decimalPlaces,
        ),
        marksman: decimalUnitsToNumber(
          BigInt(marksmanTick) * stepUnits,
          decimalPlaces,
        ),
      };

      if (isWithinBounds(candidate, minimumRatios, maximumRatios)) {
        ratios.push(candidate);
      }
    }
  }

  if (ratios.length === 0) {
    throw new NoFeasibleTroopRatioError();
  }

  return ratios;
}

function resolveBounds(
  bounds: TroopRatioBounds | undefined,
  fallback: number,
  label: string,
): Record<TroopType, number> {
  const resolved: Record<TroopType, number> = {
    shield: fallback,
    lancer: fallback,
    marksman: fallback,
  };

  for (const troopType of TROOP_TYPES) {
    const value = bounds?.[troopType];
    if (value === undefined) {
      continue;
    }
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new InvalidTroopRatioBoundsError(
        `${troopType} 的${label}比例必须位于 0%～100%，收到：${value}。`,
      );
    }
    resolved[troopType] = value;
  }

  return resolved;
}

function isWithinBounds(
  ratios: TroopRatios,
  minimumRatios: Readonly<Record<TroopType, number>>,
  maximumRatios: Readonly<Record<TroopType, number>>,
): boolean {
  return TROOP_TYPES.every(
    (troopType) =>
      ratios[troopType] >= minimumRatios[troopType] &&
      ratios[troopType] <= maximumRatios[troopType],
  );
}
