export class BattleSetupOptimizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidBattleSetupBodyCountError extends BattleSetupOptimizationError {
  constructor(bodyCount: number) {
    super(`bodyCount 必须是 0～4 的安全整数，收到：${bodyCount}。`);
  }
}

export class InvalidBattleSetupTopKError extends BattleSetupOptimizationError {
  constructor(topK: number) {
    super(`topK 必须是正安全整数，收到：${topK}。`);
  }
}

export class BattleSetupCountOverflowError extends BattleSetupOptimizationError {
  constructor() {
    super("比例候选数与车身组合数的乘积超出安全整数范围。");
  }
}

export class BattleSetupEvaluationCountError extends BattleSetupOptimizationError {
  constructor(expected: number, actual: number) {
    super(`联合评估数量不一致：预期 ${expected}，实际 ${actual}。`);
  }
}
