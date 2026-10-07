/**
 * A scheduling organization (an assignor's site in Assignr) visible to the
 * connected account.
 */
export interface INormalizedOrganization {
  /** Provider-side identifier. */
  external_id: string;
  name: string;
  /** Provider visibility flags, e.g. whether all games are shown to officials. */
  flags: Record<string, boolean>;
}
