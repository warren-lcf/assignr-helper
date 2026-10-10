import { CALENDAR_FEED_SYSTEM_ACTOR } from '../calendar_feed_limits.constant.js';
import { FeedWriteMode } from '../enums/feed_write_mode.enum.js';
import { CalendarFeedExistsError } from '../errors/calendar_feed_exists.error.js';
import { CalendarFeedNotFoundError } from '../errors/calendar_feed_not_found.error.js';
import { IStoredCalendarFeed } from '../models/stored_calendar_feed.model.js';
import { ICalendarFeedStore } from '../ports/calendar_feed_store.interface.js';
import { ICalendarFeedStoreOptions } from './calendar_feed_store_options.model.js';

/** In-memory `ICalendarFeedStore` for tests and local development. Reads and returns are copies. */
export class InMemoryCalendarFeedStore implements ICalendarFeedStore {
  private readonly rows = new Map<string, IStoredCalendarFeed>();
  private readonly now: () => number;

  /**
   * Creates an empty store.
   * @param options Optional clock override.
   */
  public constructor(options: ICalendarFeedStoreOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  /**
   * Reads a tenant's feed.
   * @param tenant_id Owning tenant.
   * @returns A copy of the feed, or null when the tenant has none.
   */
  public async get_feed(tenant_id: string): Promise<IStoredCalendarFeed | null> {
    const row = this.rows.get(tenant_id);
    return row ? structuredClone(row) : null;
  }

  /**
   * Writes a tenant's token hash; see `ICalendarFeedStore.write_feed_token`.
   * @param tenant_id Owning tenant.
   * @param token_hash SHA-256 hex of the new token.
   * @param actor Actor to stamp.
   * @param mode Whether to create, replace or either.
   * @returns A copy of the feed as it is now.
   * @throws CalendarFeedExistsError in `CREATE_ONLY` mode when the tenant already has a feed.
   * @throws CalendarFeedNotFoundError in `REPLACE_ONLY` mode when the tenant has none.
   * @throws Error when another tenant already uses this hash.
   */
  public async write_feed_token(
    tenant_id: string,
    token_hash: string,
    actor: string,
    mode: FeedWriteMode,
  ): Promise<IStoredCalendarFeed> {
    const existing = this.rows.get(tenant_id);
    if (existing && mode === FeedWriteMode.CREATE_ONLY) {
      throw new CalendarFeedExistsError(tenant_id);
    }
    if (!existing && mode === FeedWriteMode.REPLACE_ONLY) {
      throw new CalendarFeedNotFoundError(tenant_id);
    }
    if ([...this.rows.values()].some((row) => row.token_hash === token_hash && row !== existing)) {
      throw new Error('A calendar feed with this token hash already exists');
    }
    const now = this.now();
    const written: IStoredCalendarFeed = existing
      ? {
          ...existing,
          token_hash,
          rotation_count: existing.rotation_count + 1,
          fetch_count: 0,
          last_fetched_at: null,
          updated_at: now,
          updated_by: actor,
        }
      : {
          tenant_id,
          token_hash,
          rotation_count: 0,
          fetch_count: 0,
          last_fetched_at: null,
          created_at: now,
          created_by: actor,
          updated_at: now,
          updated_by: actor,
        };
    this.rows.set(tenant_id, written);
    return structuredClone(written);
  }

  /**
   * Library entry point: creates the feed or replaces its token, stamped with the system actor.
   * @param subscriber_id The tenant id.
   * @param token_hash SHA-256 hex of the new token.
   * @returns Resolves when saved.
   */
  public async set_token(subscriber_id: string, token_hash: string): Promise<void> {
    await this.write_feed_token(
      subscriber_id,
      token_hash,
      CALENDAR_FEED_SYSTEM_ACTOR,
      FeedWriteMode.UPSERT,
    );
  }

  /**
   * Finds the tenant whose current token has this hash, across all tenants.
   * @param token_hash SHA-256 hex of the presented token.
   * @returns The tenant id, or null when no feed has that hash.
   */
  public async find_subscriber_by_token_hash(token_hash: string): Promise<string | null> {
    const row = [...this.rows.values()].find((candidate) => candidate.token_hash === token_hash);
    return row ? row.tenant_id : null;
  }

  /**
   * Counts one fetch and moves `last_fetched_at` forward (never backward). Audit stamps are left
   * alone because a fetch is not an edit. An unknown tenant is ignored.
   * @param subscriber_id The tenant id.
   * @param fetched_at_utc_ms UTC milliseconds of the fetch.
   * @returns Resolves when counted.
   */
  public async record_fetch(subscriber_id: string, fetched_at_utc_ms: number): Promise<void> {
    const existing = this.rows.get(subscriber_id);
    if (!existing) {
      return;
    }
    this.rows.set(subscriber_id, {
      ...existing,
      fetch_count: existing.fetch_count + 1,
      last_fetched_at:
        existing.last_fetched_at !== null && existing.last_fetched_at > fetched_at_utc_ms
          ? existing.last_fetched_at
          : fetched_at_utc_ms,
    });
  }

  /**
   * Removes a tenant's feed, so its token stops working. Removing nothing is not an error.
   * @param subscriber_id The tenant id.
   * @returns Resolves when removed.
   */
  public async delete_token(subscriber_id: string): Promise<void> {
    this.rows.delete(subscriber_id);
  }
}
