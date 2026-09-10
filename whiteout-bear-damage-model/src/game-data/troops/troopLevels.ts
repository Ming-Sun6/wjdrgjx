import type { TroopLevel, TroopLevelId } from "../../domain/troop";

/**
 * C_t：兵种等级常数。
 * T12、T12-FC1 至 T12-FC5 保留显式缺失记录，不做插值或推算。
 */
export const troopLevels = {
  T1: known("T1", 1, null, 1),
  T2: known("T2", 2, null, 1.5),
  T3: known("T3", 3, null, 2.1),
  T4: known("T4", 4, null, 2.73),
  T5: known("T5", 5, null, 3.276),
  T6: known("T6", 6, null, 3.8657),
  T7: known("T7", 7, null, 4.5615),
  T8: known("T8", 8, null, 5.3826),
  T9: known("T9", 9, null, 6.3514),
  T10: known("T10", 10, null, 7.4947),
  "T10-FC1": known("T10-FC1", 10, 1, 7.7945),
  "T10-FC2": known("T10-FC2", 10, 2, 8.1842),
  "T10-FC3": known("T10-FC3", 10, 3, 8.5934),
  "T10-FC4": known("T10-FC4", 10, 4, 9.0231),
  "T10-FC5": known("T10-FC5", 10, 5, 9.4742),
  "T10-FC6": known("T10-FC6", 10, 6, 9.8532),
  "T10-FC7": known("T10-FC7", 10, 7, 10.3459),
  "T10-FC8": known("T10-FC8", 10, 8, 10.8632),
  "T10-FC9": known("T10-FC9", 10, 9, 11.4063),
  "T10-FC10": known("T10-FC10", 10, 10, 11.9766),
  T11: known("T11", 11, null, 8.8437),
  "T11-FC1": known("T11-FC1", 11, 1, 9.1975),
  "T11-FC2": known("T11-FC2", 11, 2, 9.6574),
  "T11-FC3": known("T11-FC3", 11, 3, 10.1402),
  "T11-FC4": known("T11-FC4", 11, 4, 10.6472),
  "T11-FC5": known("T11-FC5", 11, 5, 11.1796),
  "T11-FC6": known("T11-FC6", 11, 6, 11.6268),
  "T11-FC7": known("T11-FC7", 11, 7, 12.2081),
  "T11-FC8": known("T11-FC8", 11, 8, 12.8185),
  "T11-FC9": known("T11-FC9", 11, 9, 13.4595),
  "T11-FC10": known("T11-FC10", 11, 10, 14.1324),
  T12: missing("T12", 12, null),
  "T12-FC1": missing("T12-FC1", 12, 1),
  "T12-FC2": missing("T12-FC2", 12, 2),
  "T12-FC3": missing("T12-FC3", 12, 3),
  "T12-FC4": missing("T12-FC4", 12, 4),
  "T12-FC5": missing("T12-FC5", 12, 5),
  "T12-FC6": known("T12-FC6", 12, 6, 13.7196),
  "T12-FC7": known("T12-FC7", 12, 7, 14.4056),
  "T12-FC8": known("T12-FC8", 12, 8, 15.1259),
  "T12-FC9": known("T12-FC9", 12, 9, 15.8822),
  "T12-FC10": known("T12-FC10", 12, 10, 16.6763),
} as const satisfies Record<string, TroopLevel>;

function known(
  id: TroopLevelId,
  tier: number,
  fireCrystalLevel: number | null,
  constant: number,
): TroopLevel {
  return { id, tier, fireCrystalLevel, constant, status: "known" };
}

function missing(
  id: TroopLevelId,
  tier: number,
  fireCrystalLevel: number | null,
): TroopLevel {
  return { id, tier, fireCrystalLevel, constant: null, status: "missing" };
}
