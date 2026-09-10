export class InvalidDamageComponentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDamageComponentError";
  }
}

