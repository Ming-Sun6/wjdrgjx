export class FullSetupOptimizationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidFullSetupTopKError extends FullSetupOptimizationError {
  public constructor(value: number) {
    super(`topK必须是正安全整数，收到：${value}。`);
  }
}

export class InvalidHeadCandidateError extends FullSetupOptimizationError {
  public constructor(message: string) {
    super(message);
  }
}

export class InvalidFireCrystalConfigurationError extends FullSetupOptimizationError {
  public constructor(message: string) {
    super(message);
  }
}

export class UnknownFireCrystalLevelError extends FullSetupOptimizationError {
  public constructor(skillId: string) {
    super(`火晶技能 ${skillId} 的等级未知，不能参与带等级范围的优化。`);
  }
}

export class FullSetupCandidateCountOverflowError extends FullSetupOptimizationError {
  public constructor() {
    super("完整优化笛卡尔积超出JavaScript安全整数范围。请显式限制候选集合。");
  }
}

export class NoFullSetupCandidateError extends FullSetupOptimizationError {
  public constructor(dimension: string) {
    super(`${dimension}维度没有合法候选。`);
  }
}
