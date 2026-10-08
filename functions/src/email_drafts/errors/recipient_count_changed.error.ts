/** The number of eligible recipients is not the number the owner confirmed. */
export class RecipientCountChangedError extends Error {
  public constructor(
    public readonly current: number,
    public readonly confirmed: number,
  ) {
    super(`The eligible recipient count is now ${current}, not ${confirmed}`);
    this.name = 'RecipientCountChangedError';
  }
}
