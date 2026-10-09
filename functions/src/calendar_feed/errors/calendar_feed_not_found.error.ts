/** The tenant has no calendar feed. */
export class CalendarFeedNotFoundError extends Error {
  public constructor(public readonly tenant_id: string) {
    super(`Tenant ${tenant_id} has no calendar feed`);
    this.name = 'CalendarFeedNotFoundError';
  }
}
