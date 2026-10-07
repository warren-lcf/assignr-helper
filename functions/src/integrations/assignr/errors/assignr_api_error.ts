/** A non-success response from the Assignr API. */
export class AssignrApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'AssignrApiError';
  }
}
