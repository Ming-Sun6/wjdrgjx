export class InvalidAttackEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAttackEventError";
  }
}

export class AttackRecursionLimitError extends InvalidAttackEventError {
  constructor(message: string) {
    super(message);
    this.name = "AttackRecursionLimitError";
  }
}

