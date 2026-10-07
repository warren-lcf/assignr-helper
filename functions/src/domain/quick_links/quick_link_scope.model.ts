/** Which games a quick link exposes. Empty lists and null bounds mean "no restriction". */
export interface IQuickLinkScope {
  /** Organizations whose games are visible; empty means all. */
  organization_ids: string[];
  /** Game levels that are visible; empty means all. */
  levels: string[];
  /** First visible calendar date (UTC-midnight milliseconds, inclusive), or null. */
  date_start: number | null;
  /** Last visible calendar date (UTC-midnight milliseconds, inclusive), or null. */
  date_end: number | null;
}
