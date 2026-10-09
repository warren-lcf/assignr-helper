import { CalendarFeedStatus } from '../enums/calendar_feed_status.enum.js';

/** A calendar feed as the API returns it: never the token, its hash, the tenant id or audit stamps. */
export interface IFeedView {
  status: CalendarFeedStatus;
  /** UTC milliseconds the feed was first created. */
  created_at: number;
  /** UTC milliseconds of the latest fetch of the current link, or null if it was never fetched. */
  last_fetched_at: number | null;
  /** Fetches of the current link (starts again at 0 when the link is rotated). */
  fetch_count: number;
  /** How many times the link was replaced. */
  rotation_count: number;
}
