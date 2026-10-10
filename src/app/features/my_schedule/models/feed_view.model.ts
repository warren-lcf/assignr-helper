import { FeedStatus } from '../enums/feed_status.enum';

/** The person's calendar feed as the backend reports it. Never carries the link's secret. */
export interface IFeedView {
  status: FeedStatus;
  /** When the feed was created, UTC milliseconds. */
  created_at: number;
  /** When a calendar app last read the feed, UTC milliseconds; null when none has. */
  last_fetched_at: number | null;
  /** How many times a calendar app has read the feed. */
  fetch_count: number;
  /** How many times the link has been replaced. */
  rotation_count: number;
}
