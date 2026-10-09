import { format_count } from '../../games/utils/format_count';
import { IFeedActivityText } from '../models/feed_activity_text.model';
import { IFeedView } from '../models/feed_view.model';

/**
 * Words how a feed is being used: when a calendar app last read it (or that none has) and how many
 * times in all.
 * @param feed The feed.
 * @param format_date Formats a UTC-millisecond instant for the viewer.
 * @param translate Translates an English key.
 * @returns The two values.
 */
export function describe_feed_activity(
  feed: Pick<IFeedView, 'last_fetched_at' | 'fetch_count'>,
  format_date: (utc_ms: number) => string,
  translate: (key: string) => string,
): IFeedActivityText {
  return {
    last_fetched:
      feed.last_fetched_at === null
        ? translate('Not fetched yet')
        : format_date(feed.last_fetched_at),
    fetch_count: format_count(feed.fetch_count),
  };
}
