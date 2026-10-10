import { Database } from '@google-cloud/spanner';
import { run_write_transaction } from '../../sync/stores/run_write_transaction.js';
import { to_nullable_number, to_number } from '../../sync/stores/spanner_row_values.js';
import { CALENDAR_FEED_SYSTEM_ACTOR } from '../calendar_feed_limits.constant.js';
import { FeedWriteMode } from '../enums/feed_write_mode.enum.js';
import { CalendarFeedExistsError } from '../errors/calendar_feed_exists.error.js';
import { CalendarFeedNotFoundError } from '../errors/calendar_feed_not_found.error.js';
import { IStoredCalendarFeed } from '../models/stored_calendar_feed.model.js';
import { ICalendarFeedStore } from '../ports/calendar_feed_store.interface.js';
import { ICalendarFeedStoreOptions } from './calendar_feed_store_options.model.js';

const FEED_COLUMNS =
  'tenant_id, token_hash, rotation_count, fetch_count, last_fetched_at, ' +
  'created_at, created_by, updated_at, updated_by';

/**
 * Spanner `ICalendarFeedStore` over the `calendar_feeds` table (one row per tenant). It uses the
 * Spanner client directly instead of core-server's CRUD helpers to match the other stores:
 * callers stamp the rows, and counting fetches through audited writes would write one audit row
 * per calendar refresh. The token is never stored, only its hash; lookups by hash go through the
 * unique index `calendar_feeds_by_token_hash`.
 */
export class SpannerCalendarFeedStore implements ICalendarFeedStore {
  private readonly now: () => number;

  /**
   * Creates a store over an existing database handle.
   * @param database Spanner database holding the `calendar_feeds` table.
   * @param options Optional clock override.
   */
  public constructor(
    private readonly database: Database,
    options: ICalendarFeedStoreOptions = {},
  ) {
    this.now = options.now ?? Date.now;
  }

  /**
   * Reads a tenant's feed.
   * @param tenant_id Owning tenant.
   * @returns The feed, or null when the tenant has none.
   */
  public async get_feed(tenant_id: string): Promise<IStoredCalendarFeed | null> {
    const [rows] = await this.database.run({
      sql: `SELECT ${FEED_COLUMNS} FROM calendar_feeds WHERE tenant_id = @tenant_id`,
      params: { tenant_id },
      types: { tenant_id: 'string' },
      json: true,
    });
    const [row] = rows as Record<string, unknown>[];
    return row ? this.to_feed(row) : null;
  }

  /**
   * Writes a tenant's token hash inside one read-write transaction: the row is read and then
   * inserted or updated, so of two simultaneous `CREATE_ONLY` writes exactly one succeeds (the
   * other is retried by Spanner, sees the row and fails with `CalendarFeedExistsError`), and a
   * replaced hash stops matching in the same commit.
   * @param tenant_id Owning tenant.
   * @param token_hash SHA-256 hex of the new token.
   * @param actor Actor to stamp.
   * @param mode Whether to create, replace or either.
   * @returns The feed as it is now.
   * @throws CalendarFeedExistsError in `CREATE_ONLY` mode when the tenant already has a feed.
   * @throws CalendarFeedNotFoundError in `REPLACE_ONLY` mode when the tenant has none.
   * @throws Error when another tenant already uses this hash (the unique index rejects it).
   */
  public async write_feed_token(
    tenant_id: string,
    token_hash: string,
    actor: string,
    mode: FeedWriteMode,
  ): Promise<IStoredCalendarFeed> {
    const now = this.now();
    return run_write_transaction(this.database, async (transaction) => {
      const [rows] = await transaction.run({
        sql: `SELECT ${FEED_COLUMNS} FROM calendar_feeds WHERE tenant_id = @tenant_id`,
        params: { tenant_id },
        types: { tenant_id: 'string' },
        json: true,
      });
      const [row] = rows as Record<string, unknown>[];
      const existing = row ? this.to_feed(row) : null;
      if (existing && mode === FeedWriteMode.CREATE_ONLY) {
        throw new CalendarFeedExistsError(tenant_id);
      }
      if (!existing && mode === FeedWriteMode.REPLACE_ONLY) {
        throw new CalendarFeedNotFoundError(tenant_id);
      }
      if (existing) {
        const replaced: IStoredCalendarFeed = {
          ...existing,
          token_hash,
          rotation_count: existing.rotation_count + 1,
          fetch_count: 0,
          last_fetched_at: null,
          updated_at: now,
          updated_by: actor,
        };
        transaction.update('calendar_feeds', {
          tenant_id,
          token_hash,
          rotation_count: replaced.rotation_count,
          fetch_count: 0,
          last_fetched_at: null,
          updated_at: now,
          updated_by: actor,
        });
        return replaced;
      }
      const created: IStoredCalendarFeed = {
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
      transaction.insert('calendar_feeds', { ...created });
      return created;
    });
  }

  /**
   * Library entry point: creates the feed or replaces its token, stamped with the system actor.
   * @param subscriber_id The tenant id.
   * @param token_hash SHA-256 hex of the new token.
   * @returns Resolves when committed.
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
   * Finds the tenant whose current token has this hash through the unique index on `token_hash`.
   * @param token_hash SHA-256 hex of the presented token.
   * @returns The tenant id, or null when no feed has that hash.
   */
  public async find_subscriber_by_token_hash(token_hash: string): Promise<string | null> {
    const [rows] = await this.database.run({
      sql:
        'SELECT tenant_id FROM calendar_feeds@{FORCE_INDEX=calendar_feeds_by_token_hash} ' +
        'WHERE token_hash = @token_hash',
      params: { token_hash },
      types: { token_hash: 'string' },
      json: true,
    });
    const [row] = rows as Record<string, unknown>[];
    return row ? String(row['tenant_id']) : null;
  }

  /**
   * Counts one fetch with a single atomic UPDATE, so simultaneous fetches are all counted.
   * `last_fetched_at` only moves forward. An unknown tenant updates nothing.
   * @param subscriber_id The tenant id.
   * @param fetched_at_utc_ms UTC milliseconds of the fetch.
   * @returns Resolves when committed.
   */
  public async record_fetch(subscriber_id: string, fetched_at_utc_ms: number): Promise<void> {
    await run_write_transaction(this.database, async (transaction) => {
      await transaction.runUpdate({
        sql:
          'UPDATE calendar_feeds SET fetch_count = fetch_count + 1, ' +
          'last_fetched_at = IF(last_fetched_at IS NULL OR last_fetched_at < @now, @now, last_fetched_at) ' +
          'WHERE tenant_id = @tenant_id',
        params: { tenant_id: subscriber_id, now: fetched_at_utc_ms },
        types: { tenant_id: 'string', now: 'int64' },
      });
    });
  }

  /**
   * Removes a tenant's feed, so its token stops working. Removing nothing is not an error.
   * @param subscriber_id The tenant id.
   * @returns Resolves when committed.
   */
  public async delete_token(subscriber_id: string): Promise<void> {
    await run_write_transaction(this.database, async (transaction) => {
      await transaction.runUpdate({
        sql: 'DELETE FROM calendar_feeds WHERE tenant_id = @tenant_id',
        params: { tenant_id: subscriber_id },
        types: { tenant_id: 'string' },
      });
    });
  }

  /**
   * Maps a query row to the stored model.
   * @param row Row selected with `FEED_COLUMNS` in JSON mode.
   * @returns The feed.
   */
  private to_feed(row: Record<string, unknown>): IStoredCalendarFeed {
    return {
      tenant_id: String(row['tenant_id']),
      token_hash: String(row['token_hash']),
      rotation_count: to_number(row['rotation_count'], 'rotation_count'),
      fetch_count: to_number(row['fetch_count'], 'fetch_count'),
      last_fetched_at: to_nullable_number(row['last_fetched_at'], 'last_fetched_at'),
      created_at: to_number(row['created_at'], 'created_at'),
      created_by: String(row['created_by']),
      updated_at: to_number(row['updated_at'], 'updated_at'),
      updated_by: String(row['updated_by']),
    };
  }
}
