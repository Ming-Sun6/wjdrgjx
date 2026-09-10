export class InvalidProbabilityError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidProbabilityError";
  }
}

export class ProbabilityMassError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ProbabilityMassError";
  }
}

export class UnsupportedProbabilityStateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "UnsupportedProbabilityStateError";
  }
}
