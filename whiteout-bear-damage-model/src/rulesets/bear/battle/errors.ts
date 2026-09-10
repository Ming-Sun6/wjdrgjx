export class InvalidBearBattleContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBearBattleContextError";
  }
}
