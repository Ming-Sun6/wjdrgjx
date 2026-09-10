export class TroopRatioOptimizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidTotalTroopCountError extends TroopRatioOptimizationError {
  constructor(totalTroopCount: number) {
    super(`总兵数必须是非负安全整数，收到：${totalTroopCount}。`);
  }
}

export class InvalidStepPercentError extends TroopRatioOptimizationError {
  constructor(stepPercent: number, reason: string) {
    super(`比例步长 ${stepPercent} 无效：${reason}`);
  }
}

export class InvalidTroopRatioTopKError extends TroopRatioOptimizationError {
  constructor(topK: number) {
    super(`topK 必须是正安全整数，收到：${topK}。`);
  }
}

export class InvalidTroopRatioError extends TroopRatioOptimizationError {
  constructor(message: string) {
    super(message);
  }
}

export class InvalidTroopRatioBoundsError extends TroopRatioOptimizationError {
  constructor(message: string) {
    super(message);
  }
}

export class NoFeasibleTroopRatioError extends TroopRatioOptimizationError {
  constructor() {
    super("当前步长和最低/最高比例限制下没有可行的兵种比例。");
  }
}
