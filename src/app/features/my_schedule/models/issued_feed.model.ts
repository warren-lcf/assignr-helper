import { IFeedView } from './feed_view.model';

/**
 * The payload of the two calls that make a link: the feed, the secret token and the path of the
 * calendar file. The token appears in these responses only; callers must not keep it anywhere but
 * the one panel that shows it.
 */
export interface IIssuedFeed {
  feed: IFeedView;
  /** The secret part of the link. */
  token: string;
  /** Where the calendar file is served, such as `/api/public/cal/<token>.ics`. */
  path: string;
}
