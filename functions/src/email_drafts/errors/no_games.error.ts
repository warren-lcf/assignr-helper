/** No open game matches the draft's filters, and an empty digest is never sent. */
export class NoGamesError extends Error {
  public constructor() {
    super('No open games match this draft, so there is nothing to send');
    this.name = 'NoGamesError';
  }
}
