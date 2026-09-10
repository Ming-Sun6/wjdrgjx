import type { BodyHeroId, HeroCalculationStatus } from "../../domain/hero";

export class BodyOptimizationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BodyOptimizationError";
  }
}

export class InvalidBodyCountError extends BodyOptimizationError {
  public constructor(bodyCount: number) {
    super(`bodyCount 必须是 0～4 的整数，当前为 ${bodyCount}。`);
    this.name = "InvalidBodyCountError";
  }
}

export class InvalidTopKError extends BodyOptimizationError {
  public constructor(topK: number) {
    super(`topK 必须是正整数，当前为 ${topK}。`);
    this.name = "InvalidTopKError";
  }
}

export class UnknownOptimizerHeroError extends BodyOptimizationError {
  public readonly heroId: BodyHeroId;

  public constructor(heroId: BodyHeroId) {
    super(`优化候选中不存在英雄：${heroId}。`);
    this.name = "UnknownOptimizerHeroError";
    this.heroId = heroId;
  }
}

export class UnavailableOptimizerHeroError extends BodyOptimizationError {
  public readonly heroId: BodyHeroId;
  public readonly status: Exclude<HeroCalculationStatus, "supported">;

  public constructor(
    heroId: BodyHeroId,
    status: Exclude<HeroCalculationStatus, "supported">,
  ) {
    super(`英雄 ${heroId} 的状态为 ${status}，不能加入当前优化候选池。`);
    this.name = "UnavailableOptimizerHeroError";
    this.heroId = heroId;
    this.status = status;
  }
}

export class DuplicateOptimizerHeroError extends BodyOptimizationError {
  public readonly heroId: BodyHeroId;

  public constructor(heroId: BodyHeroId) {
    super(`优化候选池包含重复英雄 ID：${heroId}。重复选择由组合生成器负责。`);
    this.name = "DuplicateOptimizerHeroError";
    this.heroId = heroId;
  }
}

export class ZeroBaselineDamageError extends BodyOptimizationError {
  public constructor() {
    super("无车身伤害必须大于 0，否则无法计算 improvementOverNoBody。");
    this.name = "ZeroBaselineDamageError";
  }
}
