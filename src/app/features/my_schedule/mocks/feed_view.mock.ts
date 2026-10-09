import { FeedStatus } from '../enums/feed_status.enum';
import { IFeedView } from '../models/feed_view.model';
import { IIssuedFeed } from '../models/issued_feed.model';

/** An obviously fake token; specs assert it never leaves the one-time panel. */
export const FAKE_FEED_TOKEN = 'unit-fake-token-never-real-0123456789';

/**
 * Builds a feed fixture.
 * @param overrides Fields to change from a feed no calendar app has read yet.
 * @returns The feed.
 */
export function make_feed_view(overrides: Partial<IFeedView> = {}): IFeedView {
  return {
    status: FeedStatus.ACTIVE,
    created_at: Date.UTC(2026, 9, 5, 15, 4, 0),
    last_fetched_at: null,
    fetch_count: 0,
    rotation_count: 0,
    ...overrides,
  };
}

/** A feed no calendar app has read yet. */
export const FRESH_FEED: IFeedView = make_feed_view();

/** A feed a calendar app has read 1,234 times, most recently on 9 October 2026. */
export const USED_FEED: IFeedView = make_feed_view({
  last_fetched_at: Date.UTC(2026, 9, 9, 15, 42, 0),
  fetch_count: 1234,
  rotation_count: 1,
});

/**
 * Builds the answer of a create or rotate call.
 * @param overrides Fields to change from a fresh feed with the fake token.
 * @returns The issued feed.
 */
export function make_issued_feed(overrides: Partial<IIssuedFeed> = {}): IIssuedFeed {
  return {
    feed: FRESH_FEED,
    token: FAKE_FEED_TOKEN,
    path: `/api/public/cal/${FAKE_FEED_TOKEN}.ics`,
    ...overrides,
  };
}
