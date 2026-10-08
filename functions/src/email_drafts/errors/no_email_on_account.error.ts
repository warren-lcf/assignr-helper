/** The signed-in account has no verified email address to send a test message to. */
export class NoEmailOnAccountError extends Error {
  public constructor() {
    super('The signed-in account has no verified email address');
    this.name = 'NoEmailOnAccountError';
  }
}
