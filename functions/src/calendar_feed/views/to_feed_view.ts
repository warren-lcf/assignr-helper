import { CalendarFeedStatus } from '../enums/calendar_feed_status.enum.js';
import { IStoredCalendarFeed } from '../models/stored_calendar_feed.model.js';
import { IFeedView } from './calendar_feed_view.model.js';

/**
 * Projects a stored feed to its API shape, built from an explicit allow-list of fields so
 * neither the token hash nor anything added to the row later can leak.
 * @param feed Stored feed.
 * @returns The view.
 */
export function to_feed_view(feed: IStoredCalendarFeed): IFeedView {
  return {
    status: CalendarFeedStatus.ACTIVE,
    created_at: feed.created_at,
    last_fetched_at: feed.last_fetched_at,
    fetch_count: feed.fetch_count,
    rotation_count: feed.rotation_count,
  };
}
