export class InvalidBattleStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBattleStateError";
  }
}

export class UnimplementedRoundMechanicsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnimplementedRoundMechanicsError";
  }
}
