/** The tenant already holds as many contacts as it may. */
export class ContactLimitReachedError extends Error {
  public constructor(public readonly limit: number) {
    super(`A tenant may hold at most ${limit} contacts`);
    this.name = 'ContactLimitReachedError';
  }
}
