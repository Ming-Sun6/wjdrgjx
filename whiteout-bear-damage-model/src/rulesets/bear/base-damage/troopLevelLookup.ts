import type { TroopLevel, TroopLevelId } from "../../../domain/troop";
import { troopLevels } from "../../../game-data/troops/troopLevels";
import {
  MissingTroopLevelConstantError,
  UnknownTroopLevelError,
} from "./errors";

export function getTroopLevel(levelId: TroopLevelId): TroopLevel {
  const level = (troopLevels as Readonly<Record<string, TroopLevel>>)[levelId];

  if (level === undefined) {
    throw new UnknownTroopLevelError(levelId);
  }

  return level;
}

export function getTroopLevelConstant(levelId: TroopLevelId): number {
  const level = getTroopLevel(levelId);

  if (level.status === "missing" || level.constant === null) {
    throw new MissingTroopLevelConstantError(levelId);
  }

  return level.constant;
}
