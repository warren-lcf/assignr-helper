import { IFeedView } from './feed_view.model';

/** The payload of `GET` and `DELETE /api/my_schedule/feed`: the feed, or null when there is none. */
export interface IFeedResult {
  feed: IFeedView | null;
}
