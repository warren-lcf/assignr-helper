import type { FeedTokenStore } from '@hch-shared-libraries/core-server';
import { FeedWriteMode } from './enums/feed_write_mode.enum.js';
import { IStoredCalendarFeed } from './models/stored_calendar_feed.model.js';
import { ICalendarFeedStore } from './ports/calendar_feed_store.interface.js';

/**
 * Adapts the calendar feed store to core-server's `FeedTokenStore` for ONE owner operation. The
 * library's `set_token` knows neither who is acting nor whether the feed may already exist, so this
 * adapter supplies both: the actor is stamped on the row, and the write mode makes the library's
 * `issue_feed_token` fail when a feed exists and `rotate_feed_token` fail when there is none, inside
 * the store's single transaction. Build a new one for every operation.
 */
export class ActorScopedFeedTokenStore implements FeedTokenStore {
  /** The feed row after the library's `set_token` call, or null before it. */
  public written: IStoredCalendarFeed | null = null;

  /**
   * Creates the adapter.
   * @param store The calendar feed store.
   * @param actor User id to stamp as `created_by` and `updated_by`.
   * @param mode Whether the write may create, replace or either.
   */
  public constructor(
    private readonly store: ICalendarFeedStore,
    private readonly actor: string,
    private readonly mode: FeedWriteMode,
  ) {}

  /**
   * Writes the token hash with the actor and mode of this operation.
   * @param subscriber_id The tenant id.
   * @param token_hash SHA-256 hex of the new token.
   * @returns Resolves when written.
   * @throws CalendarFeedExistsError or CalendarFeedNotFoundError as the mode requires.
   */
  public async set_token(subscriber_id: string, token_hash: string): Promise<void> {
    this.written = await this.store.write_feed_token(
      subscriber_id,
      token_hash,
      this.actor,
      this.mode,
    );
  }

  /**
   * Delegates to the store.
   * @param token_hash SHA-256 hex of a token.
   * @returns The tenant id, or null.
   */
  public find_subscriber_by_token_hash(token_hash: string): Promise<string | null> {
    return this.store.find_subscriber_by_token_hash(token_hash);
  }

  /**
   * Delegates to the store.
   * @param subscriber_id The tenant id.
   * @param fetched_at_utc_ms UTC milliseconds of the fetch.
   * @returns Resolves when recorded.
   */
  public record_fetch(subscriber_id: string, fetched_at_utc_ms: number): Promise<void> {
    return this.store.record_fetch(subscriber_id, fetched_at_utc_ms);
  }

  /**
   * Delegates to the store.
   * @param subscriber_id The tenant id.
   * @returns Resolves when removed.
   */
  public delete_token(subscriber_id: string): Promise<void> {
    return this.store.delete_token(subscriber_id);
  }
}
