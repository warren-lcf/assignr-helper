/** Which games a quick link shows. Empty lists and null bounds mean "no restriction". */
export interface IQuickLinkScope {
  /** Organizations whose games are shown; empty means all. */
  organization_ids: string[];
  /** Levels shown (matched by the server); empty means all. */
  levels: string[];
  /** First date shown, UTC-midnight milliseconds, inclusive; null for no start. */
  date_start: number | null;
  /** Last date shown, UTC-midnight milliseconds, inclusive; null for no end. */
  date_end: number | null;
}
