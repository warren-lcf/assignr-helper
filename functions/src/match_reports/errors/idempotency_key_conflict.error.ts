/** The idempotency key already belongs to an incident on another of the tenant's reports. */
export class IdempotencyKeyConflictError extends Error {
  public constructor() {
    super('The idempotency key is already used by another report');
    this.name = 'IdempotencyKeyConflictError';
  }
}
