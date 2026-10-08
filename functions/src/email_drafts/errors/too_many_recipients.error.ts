/** More people are eligible than one send may email. */
export class TooManyRecipientsError extends Error {
  public constructor(
    public readonly eligible: number,
    public readonly limit: number,
  ) {
    super(`${eligible} recipients exceeds the limit of ${limit} per send`);
    this.name = 'TooManyRecipientsError';
  }
}
