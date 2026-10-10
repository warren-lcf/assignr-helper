/** The tenant already has a calendar feed, so a second one cannot be created (rotate it instead). */
export class CalendarFeedExistsError extends Error {
  public constructor(public readonly tenant_id: string) {
    super(`Tenant ${tenant_id} already has a calendar feed`);
    this.name = 'CalendarFeedExistsError';
  }
}
