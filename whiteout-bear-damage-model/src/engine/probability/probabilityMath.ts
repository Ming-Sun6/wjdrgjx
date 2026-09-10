import type { WeightedBattleState } from "../../domain/probability";
import { InvalidProbabilityError, ProbabilityMassError } from "./errors";

export function validateProbability(
  probability: number,
  label = "probability",
): void {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new InvalidProbabilityError(
      `${label} 必须是 0 到 1（含端点）的有限数，收到 ${probability}。`,
    );
  }
}

export function validateProbabilityTolerance(tolerance: number): void {
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new InvalidProbabilityError(
      `probabilityTolerance 必须是正有限数，收到 ${tolerance}。`,
    );
  }
}

export function probabilityMass(
  states: readonly WeightedBattleState[],
): number {
  return states.reduce((sum, weighted) => sum + weighted.probability, 0);
}

export function assertUnitProbabilityMass(
  states: readonly WeightedBattleState[],
  tolerance: number,
  label: string,
): number {
  validateProbabilityTolerance(tolerance);
  for (const [index, weighted] of states.entries()) {
    validateProbability(weighted.probability, `${label}[${index}].probability`);
  }
  const mass = probabilityMass(states);
  if (Math.abs(mass - 1) > tolerance) {
    throw new ProbabilityMassError(
      `${label} 的概率和必须约等于 1（容差 ${tolerance}），实际为 ${mass}。`,
    );
  }
  return mass;
}
