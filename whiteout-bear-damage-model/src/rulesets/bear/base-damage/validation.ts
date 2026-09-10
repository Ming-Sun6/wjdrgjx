import type { BaseTroopDamageInput } from "../../../domain/baseDamage";
import { InvalidBaseDamageInputError } from "./errors";

export function validateBaseTroopDamageInput(
  input: BaseTroopDamageInput,
): void {
  assertNonNegativeSafeInteger(input.totalTroopCount, "整支部队总兵数");
  assertNonNegativeSafeInteger(input.troopCount, "当前兵种兵数");

  if (input.totalTroopCount === 0 && input.troopCount > 0) {
    throw new InvalidBaseDamageInputError(
      "整支部队总兵数为 0 时，当前兵种兵数也必须为 0。",
    );
  }

  if (input.troopCount > input.totalTroopCount) {
    throw new InvalidBaseDamageInputError(
      "当前兵种兵数不能大于整支部队总兵数。",
    );
  }

  assertFinite(input.stats.attackPercent, "战报攻击百分数");
  assertFinite(input.stats.penetrationPercent, "战报穿透百分数");

  if (input.stats.defensePercent !== undefined) {
    assertFinite(input.stats.defensePercent, "战报防御百分数");
  }

  if (input.stats.healthPercent !== undefined) {
    assertFinite(input.stats.healthPercent, "战报生命百分数");
  }
}

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidBaseDamageInputError(`${label}必须是非负安全整数。`);
  }
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new InvalidBaseDamageInputError(`${label}必须是有限数字。`);
  }
}
