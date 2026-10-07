/** No quick link with that id exists for the tenant. */
export class QuickLinkNotFoundError extends Error {
  public constructor(public readonly link_id: string) {
    super(`Quick link ${link_id} was not found`);
    this.name = 'QuickLinkNotFoundError';
  }
}
