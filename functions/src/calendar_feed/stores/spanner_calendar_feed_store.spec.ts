import { Database } from '@google-cloud/spanner';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  is_spanner_emulator_configured,
  open_emulator_database,
} from '../../sync/stores/spanner_emulator.fixture.js';
import { CALENDAR_FEED_SYSTEM_ACTOR } from '../calendar_feed_limits.constant.js';
import { FeedWriteMode } from '../enums/feed_write_mode.enum.js';
import { CalendarFeedExistsError } from '../errors/calendar_feed_exists.error.js';
import { CalendarFeedNotFoundError } from '../errors/calendar_feed_not_found.error.js';
import { describe_calendar_feed_store_contract } from './contracts/calendar_feed_store.contract.js';
import { SpannerCalendarFeedStore } from './spanner_calendar_feed_store.js';

/**
 * Builds a stored row in the shape a JSON-mode query returns.
 * @param overrides Cells to replace.
 * @returns A row.
 */
function make_row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenant_id: 't1',
    token_hash: 'a'.repeat(64),
    rotation_count: '2',
    fetch_count: '7',
    last_fetched_at: '9000',
    created_at: '1000',
    created_by: 'creator',
    updated_at: '3000',
    updated_by: 'updater',
    ...overrides,
  };
}

/**
 * Builds a database whose `run` records its request and returns the given rows, and whose
 * read-write transaction records the work done inside it.
 * @param rows Rows every query returns.
 * @returns The spies and the fake database.
 */
function make_database(rows: Record<string, unknown>[] = []) {
  const run = vi.fn(async (_request: unknown) => [rows]);
  const transaction = {
    run: vi.fn(async (_request: unknown) => [rows]),
    insert: vi.fn(),
    update: vi.fn(),
    runUpdate: vi.fn(async (_request: unknown) => [1]),
    commit: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined),
  };
  const database = {
    run,
    runTransactionAsync: async (work: (tx: typeof transaction) => Promise<unknown>) =>
      work(transaction),
  } as unknown as Database;
  return { run, transaction, database };
}

describe('SpannerCalendarFeedStore without a database round trip', () => {
  it('looks a token hash up through the unique index, binding it as a parameter', async () => {
    const { run, database } = make_database([{ tenant_id: 't1' }]);

    const tenant_id = await new SpannerCalendarFeedStore(database).find_subscriber_by_token_hash(
      'b'.repeat(64),
    );

    const [request] = run.mock.calls.map(
      ([sent]) => sent as { sql: string; types: Record<string, string>; params: object },
    );
    expect(request?.sql).toContain('FORCE_INDEX=calendar_feeds_by_token_hash');
    expect(request?.sql).toContain('WHERE token_hash = @token_hash');
    expect(request?.sql).not.toContain('b'.repeat(64));
    expect(request?.params).toEqual({ token_hash: 'b'.repeat(64) });
    expect(request?.types).toEqual({ token_hash: 'string' });
    expect(tenant_id).toBe('t1');
  });

  it('returns null when no row matches', async () => {
    const { database } = make_database();
    const store = new SpannerCalendarFeedStore(database);

    expect(await store.find_subscriber_by_token_hash('c'.repeat(64))).toBeNull();
    expect(await store.get_feed('t1')).toBeNull();
  });

  it('reads a feed by tenant, converting Spanner numbers', async () => {
    const { run, database } = make_database([make_row()]);

    const feed = await new SpannerCalendarFeedStore(database).get_feed('t1');

    const [sent] = run.mock.calls[0] as [{ sql: string; params: object }];
    expect(sent.sql).toContain('WHERE tenant_id = @tenant_id');
    expect(sent.params).toEqual({ tenant_id: 't1' });
    expect(feed).toEqual({
      tenant_id: 't1',
      token_hash: 'a'.repeat(64),
      rotation_count: 2,
      fetch_count: 7,
      last_fetched_at: 9000,
      created_at: 1000,
      created_by: 'creator',
      updated_at: 3000,
      updated_by: 'updater',
    });
  });

  it('reads a never-fetched feed as null', async () => {
    const { database } = make_database([make_row({ last_fetched_at: null })]);

    expect(
      (await new SpannerCalendarFeedStore(database).get_feed('t1'))?.last_fetched_at,
    ).toBeNull();
  });

  it('creates a feed by inserting the hash with the actor and clock, never a token', async () => {
    const { transaction, database } = make_database([]);

    const created = await new SpannerCalendarFeedStore(database, {
      now: () => 5000,
    }).write_feed_token('t1', 'd'.repeat(64), 'owner-1', FeedWriteMode.CREATE_ONLY);

    expect(transaction.insert).toHaveBeenCalledWith('calendar_feeds', {
      tenant_id: 't1',
      token_hash: 'd'.repeat(64),
      rotation_count: 0,
      fetch_count: 0,
      last_fetched_at: null,
      created_at: 5000,
      created_by: 'owner-1',
      updated_at: 5000,
      updated_by: 'owner-1',
    });
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(created).toMatchObject({ rotation_count: 0, created_at: 5000 });
  });

  it('reads the tenant row inside the transaction that writes', async () => {
    const { transaction, database } = make_database([]);

    await new SpannerCalendarFeedStore(database).write_feed_token(
      't1',
      'd'.repeat(64),
      'o',
      FeedWriteMode.UPSERT,
    );

    const [sent] = transaction.run.mock.calls[0] as [{ sql: string; params: object }];
    expect(sent.sql).toContain('WHERE tenant_id = @tenant_id');
    expect(sent.params).toEqual({ tenant_id: 't1' });
  });

  it('replaces by one update that adds a rotation, resets the fetch counters and keeps created_*', async () => {
    const { transaction, database } = make_database([make_row()]);

    const replaced = await new SpannerCalendarFeedStore(database, {
      now: () => 6000,
    }).write_feed_token('t1', 'e'.repeat(64), 'owner-2', FeedWriteMode.REPLACE_ONLY);

    expect(transaction.update).toHaveBeenCalledWith('calendar_feeds', {
      tenant_id: 't1',
      token_hash: 'e'.repeat(64),
      rotation_count: 3,
      fetch_count: 0,
      last_fetched_at: null,
      updated_at: 6000,
      updated_by: 'owner-2',
    });
    expect(transaction.insert).not.toHaveBeenCalled();
    expect(replaced).toMatchObject({
      rotation_count: 3,
      fetch_count: 0,
      last_fetched_at: null,
      created_at: 1000,
      created_by: 'creator',
    });
  });

  it('refuses to create over an existing feed, writing nothing and rolling back', async () => {
    const { transaction, database } = make_database([make_row()]);

    await expect(
      new SpannerCalendarFeedStore(database).write_feed_token(
        't1',
        'e'.repeat(64),
        'o',
        FeedWriteMode.CREATE_ONLY,
      ),
    ).rejects.toBeInstanceOf(CalendarFeedExistsError);

    expect(transaction.insert).not.toHaveBeenCalled();
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
  });

  it('refuses to replace a missing feed, writing nothing and rolling back', async () => {
    const { transaction, database } = make_database([]);

    await expect(
      new SpannerCalendarFeedStore(database).write_feed_token(
        't1',
        'e'.repeat(64),
        'o',
        FeedWriteMode.REPLACE_ONLY,
      ),
    ).rejects.toBeInstanceOf(CalendarFeedNotFoundError);

    expect(transaction.insert).not.toHaveBeenCalled();
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
  });

  it('writes through set_token as the system actor, creating or replacing', async () => {
    const created = make_database([]);
    await new SpannerCalendarFeedStore(created.database, { now: () => 1 }).set_token(
      't1',
      'f'.repeat(64),
    );
    const replaced = make_database([make_row()]);
    await new SpannerCalendarFeedStore(replaced.database, { now: () => 2 }).set_token(
      't1',
      'f'.repeat(64),
    );

    expect(created.transaction.insert).toHaveBeenCalledWith(
      'calendar_feeds',
      expect.objectContaining({ created_by: CALENDAR_FEED_SYSTEM_ACTOR }),
    );
    expect(replaced.transaction.update).toHaveBeenCalledWith(
      'calendar_feeds',
      expect.objectContaining({ updated_by: CALENDAR_FEED_SYSTEM_ACTOR, rotation_count: 3 }),
    );
  });

  it('counts a fetch with one atomic UPDATE bound as parameters', async () => {
    const { transaction, database } = make_database();

    await new SpannerCalendarFeedStore(database).record_fetch('t1', 9000);

    const [sent] = transaction.runUpdate.mock.calls[0] as [
      { sql: string; params: object; types: Record<string, string> },
    ];
    expect(sent.sql).toContain('fetch_count = fetch_count + 1');
    expect(sent.sql).toContain('WHERE tenant_id = @tenant_id');
    expect(sent.sql).not.toContain('9000');
    expect(sent.params).toEqual({ tenant_id: 't1', now: 9000 });
    expect(sent.types['now']).toBe('int64');
    expect(transaction.commit).toHaveBeenCalledTimes(1);
  });

  it('deletes one tenant by id with a bound parameter', async () => {
    const { transaction, database } = make_database();

    await new SpannerCalendarFeedStore(database).delete_token('t1');

    const [sent] = transaction.runUpdate.mock.calls[0] as [{ sql: string; params: object }];
    expect(sent.sql).toBe('DELETE FROM calendar_feeds WHERE tenant_id = @tenant_id');
    expect(sent.params).toEqual({ tenant_id: 't1' });
  });
});

describe.skipIf(!is_spanner_emulator_configured())(
  'SpannerCalendarFeedStore (emulator)',
  { timeout: 60_000 },
  () => {
    let database: Database;
    let close: () => Promise<void>;

    beforeAll(() => {
      ({ database, close } = open_emulator_database());
    });

    afterAll(async () => {
      await close();
    });

    describe_calendar_feed_store_contract('Spanner', () => new SpannerCalendarFeedStore(database));
  },
);
