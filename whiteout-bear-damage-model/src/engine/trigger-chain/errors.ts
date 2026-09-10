export class InvalidTriggerChainError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidTriggerChainError";
  }
}

export class TriggerChainCycleError extends InvalidTriggerChainError {
  public constructor(message: string) {
    super(message);
    this.name = "TriggerChainCycleError";
  }
}

export class TriggerChainDepthError extends InvalidTriggerChainError {
  public constructor(message: string) {
    super(message);
    this.name = "TriggerChainDepthError";
  }
}
