import type { FeedTokenStore } from '@hch-shared-libraries/core-server';
import { FeedWriteMode } from '../enums/feed_write_mode.enum.js';
import { IStoredCalendarFeed } from '../models/stored_calendar_feed.model.js';

/**
 * Persistence port for calendar feeds. It is core-server's `FeedTokenStore` (the library ships no
 * store) with `subscriber_id` meaning `tenant_id`, plus a status read and one write that the
 * owner service can make conditional. One row per tenant, so a tenant has at most one live link.
 */
export interface ICalendarFeedStore extends FeedTokenStore {
  /**
   * Reads a tenant's feed.
   * @param tenant_id Owning tenant.
   * @returns The feed, or null when the tenant has none.
   */
  get_feed(tenant_id: string): Promise<IStoredCalendarFeed | null>;

  /**
   * Writes a tenant's token hash in one atomic step, so two simultaneous callers cannot both
   * succeed in `CREATE_ONLY` mode and a replaced token stops working in the same write.
   * Creating stamps `created_*` and `updated_*`. Replacing keeps `created_*`, adds one to
   * `rotation_count`, resets the fetch counters (the new link has not been fetched yet) and
   * stamps `updated_*`.
   * @param tenant_id Owning tenant.
   * @param token_hash SHA-256 hex of the new token.
   * @param actor Actor to stamp.
   * @param mode Whether to create, replace or either.
   * @returns The feed as it is now.
   * @throws CalendarFeedExistsError in `CREATE_ONLY` mode when the tenant already has a feed.
   * @throws CalendarFeedNotFoundError in `REPLACE_ONLY` mode when the tenant has none.
   * @throws Error when another tenant already uses this hash (the unique index rejects it).
   */
  write_feed_token(
    tenant_id: string,
    token_hash: string,
    actor: string,
    mode: FeedWriteMode,
  ): Promise<IStoredCalendarFeed>;
}
