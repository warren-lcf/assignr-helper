import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { make_contract_tenant_id } from '../../../sync/stores/contracts/make_contract_tenant_id.js';
import { CALENDAR_FEED_SYSTEM_ACTOR } from '../../calendar_feed_limits.constant.js';
import { FeedWriteMode } from '../../enums/feed_write_mode.enum.js';
import { CalendarFeedExistsError } from '../../errors/calendar_feed_exists.error.js';
import { CalendarFeedNotFoundError } from '../../errors/calendar_feed_not_found.error.js';
import { ICalendarFeedStore } from '../../ports/calendar_feed_store.interface.js';

/** Generous per-test timeout so a store backed by a real database can run the suite. */
const CONTRACT_TIMEOUT_MS = 60_000;

/**
 * Derives a distinct 64 character hash for a test, so several feeds never collide on the unique
 * hash index, even across runs against a shared database.
 * @param tenant_id Tenant the hash is for.
 * @param label Which of the tenant's hashes.
 * @returns A SHA-256 hex digest.
 */
function hash_of(tenant_id: string, label: string): string {
  return createHash('sha256').update(`${tenant_id}/${label}`).digest('hex');
}

/**
 * Registers the behavioural contract every `ICalendarFeedStore` must satisfy. Each test works in
 * fresh random tenants, so it neither assumes an empty store nor touches other tenants' rows.
 * @param label Name of the implementation under test.
 * @param make Creates a store; called once per test.
 * @returns Nothing; registers a Vitest `describe` block.
 */
export function describe_calendar_feed_store_contract(
  label: string,
  make: () => ICalendarFeedStore,
): void {
  describe(`${label} calendar feed store contract`, { timeout: CONTRACT_TIMEOUT_MS }, () => {
    describe('write_feed_token', () => {
      it('creates a feed stamped with the actor and the current time', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const before = Date.now();

        const created = await store.write_feed_token(
          tenant_id,
          hash_of(tenant_id, 'a'),
          'owner-1',
          FeedWriteMode.CREATE_ONLY,
        );

        const after = Date.now();
        expect(created).toMatchObject({
          tenant_id,
          token_hash: hash_of(tenant_id, 'a'),
          rotation_count: 0,
          fetch_count: 0,
          last_fetched_at: null,
          created_by: 'owner-1',
          updated_by: 'owner-1',
        });
        expect(created.created_at).toBeGreaterThanOrEqual(before);
        expect(created.created_at).toBeLessThanOrEqual(after);
        expect(created.updated_at).toBe(created.created_at);
        expect(await store.get_feed(tenant_id)).toEqual(created);
      });

      it('refuses to create a second feed and leaves the first untouched', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const first = await store.write_feed_token(
          tenant_id,
          hash_of(tenant_id, 'a'),
          'owner-1',
          FeedWriteMode.CREATE_ONLY,
        );

        await expect(
          store.write_feed_token(
            tenant_id,
            hash_of(tenant_id, 'b'),
            'owner-2',
            FeedWriteMode.CREATE_ONLY,
          ),
        ).rejects.toBeInstanceOf(CalendarFeedExistsError);

        expect(await store.get_feed(tenant_id)).toEqual(first);
        expect(await store.find_subscriber_by_token_hash(hash_of(tenant_id, 'a'))).toBe(tenant_id);
        expect(await store.find_subscriber_by_token_hash(hash_of(tenant_id, 'b'))).toBeNull();
      });

      it('lets exactly one of two simultaneous creates succeed', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();

        const outcomes = await Promise.allSettled([
          store.write_feed_token(
            tenant_id,
            hash_of(tenant_id, 'a'),
            'owner-1',
            FeedWriteMode.CREATE_ONLY,
          ),
          store.write_feed_token(
            tenant_id,
            hash_of(tenant_id, 'b'),
            'owner-2',
            FeedWriteMode.CREATE_ONLY,
          ),
        ]);

        const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
        const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(CalendarFeedExistsError);
        const winner = (await store.get_feed(tenant_id))?.token_hash;
        expect([hash_of(tenant_id, 'a'), hash_of(tenant_id, 'b')]).toContain(winner);
      });

      it('refuses to replace a feed that does not exist and creates nothing', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();

        await expect(
          store.write_feed_token(
            tenant_id,
            hash_of(tenant_id, 'a'),
            'owner-1',
            FeedWriteMode.REPLACE_ONLY,
          ),
        ).rejects.toBeInstanceOf(CalendarFeedNotFoundError);

        expect(await store.get_feed(tenant_id)).toBeNull();
        expect(await store.find_subscriber_by_token_hash(hash_of(tenant_id, 'a'))).toBeNull();
      });

      it('replaces the token in one write: the old hash stops matching, the new one matches', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const created = await store.write_feed_token(
          tenant_id,
          hash_of(tenant_id, 'a'),
          'owner-1',
          FeedWriteMode.CREATE_ONLY,
        );

        const replaced = await store.write_feed_token(
          tenant_id,
          hash_of(tenant_id, 'b'),
          'owner-2',
          FeedWriteMode.REPLACE_ONLY,
        );

        expect(replaced).toMatchObject({
          tenant_id,
          token_hash: hash_of(tenant_id, 'b'),
          rotation_count: 1,
          created_at: created.created_at,
          created_by: 'owner-1',
          updated_by: 'owner-2',
        });
        expect(replaced.updated_at).toBeGreaterThanOrEqual(created.updated_at);
        expect(await store.get_feed(tenant_id)).toEqual(replaced);
        expect(await store.find_subscriber_by_token_hash(hash_of(tenant_id, 'a'))).toBeNull();
        expect(await store.find_subscriber_by_token_hash(hash_of(tenant_id, 'b'))).toBe(tenant_id);
      });

      it('starts the fetch count of the new link from zero', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.set_token(tenant_id, hash_of(tenant_id, 'a'));
        await store.record_fetch(tenant_id, 5000);

        const replaced = await store.write_feed_token(
          tenant_id,
          hash_of(tenant_id, 'b'),
          'owner-2',
          FeedWriteMode.REPLACE_ONLY,
        );

        expect(replaced.fetch_count).toBe(0);
        expect((await store.get_feed(tenant_id))?.fetch_count).toBe(0);
      });

      it('clears the last fetch time of the new link', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.set_token(tenant_id, hash_of(tenant_id, 'a'));
        await store.record_fetch(tenant_id, 5000);

        const replaced = await store.write_feed_token(
          tenant_id,
          hash_of(tenant_id, 'b'),
          'owner-2',
          FeedWriteMode.REPLACE_ONLY,
        );

        expect(replaced.last_fetched_at).toBeNull();
        expect((await store.get_feed(tenant_id))?.last_fetched_at).toBeNull();
      });

      it('counts every replacement', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.write_feed_token(
          tenant_id,
          hash_of(tenant_id, 'a'),
          'o',
          FeedWriteMode.CREATE_ONLY,
        );

        await store.write_feed_token(
          tenant_id,
          hash_of(tenant_id, 'b'),
          'o',
          FeedWriteMode.REPLACE_ONLY,
        );
        const third = await store.write_feed_token(
          tenant_id,
          hash_of(tenant_id, 'c'),
          'o',
          FeedWriteMode.REPLACE_ONLY,
        );

        expect(third.rotation_count).toBe(2);
      });

      it('upserts: creates when absent and replaces when present', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();

        const created = await store.write_feed_token(
          tenant_id,
          hash_of(tenant_id, 'a'),
          'o',
          FeedWriteMode.UPSERT,
        );
        const replaced = await store.write_feed_token(
          tenant_id,
          hash_of(tenant_id, 'b'),
          'o',
          FeedWriteMode.UPSERT,
        );

        expect(created.rotation_count).toBe(0);
        expect(replaced.rotation_count).toBe(1);
        expect(await store.find_subscriber_by_token_hash(hash_of(tenant_id, 'a'))).toBeNull();
      });

      it('rejects a hash another tenant already uses', async () => {
        const store = make();
        const tenant_a = make_contract_tenant_id();
        const tenant_b = make_contract_tenant_id();
        await store.write_feed_token(
          tenant_a,
          hash_of(tenant_a, 'a'),
          'o',
          FeedWriteMode.CREATE_ONLY,
        );

        await expect(
          store.write_feed_token(tenant_b, hash_of(tenant_a, 'a'), 'o', FeedWriteMode.CREATE_ONLY),
        ).rejects.toThrow();

        expect(await store.get_feed(tenant_b)).toBeNull();
        expect(await store.find_subscriber_by_token_hash(hash_of(tenant_a, 'a'))).toBe(tenant_a);
      });
    });

    describe('set_token (the library entry point)', () => {
      it('creates the feed, stamped with the system actor', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();

        await store.set_token(tenant_id, hash_of(tenant_id, 'a'));

        expect(await store.get_feed(tenant_id)).toMatchObject({
          token_hash: hash_of(tenant_id, 'a'),
          rotation_count: 0,
          created_by: CALENDAR_FEED_SYSTEM_ACTOR,
          updated_by: CALENDAR_FEED_SYSTEM_ACTOR,
        });
      });

      it('replaces the token of an existing feed and counts the rotation', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.set_token(tenant_id, hash_of(tenant_id, 'a'));

        await store.set_token(tenant_id, hash_of(tenant_id, 'b'));

        expect(await store.get_feed(tenant_id)).toMatchObject({
          token_hash: hash_of(tenant_id, 'b'),
          rotation_count: 1,
        });
        expect(await store.find_subscriber_by_token_hash(hash_of(tenant_id, 'a'))).toBeNull();
      });
    });

    describe('get_feed and find_subscriber_by_token_hash', () => {
      it('return null for an unknown tenant and an unknown hash', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();

        expect(await store.get_feed(tenant_id)).toBeNull();
        expect(await store.find_subscriber_by_token_hash(hash_of(tenant_id, 'nothing'))).toBeNull();
      });

      it('keep tenants apart: each hash resolves to its own tenant only', async () => {
        const store = make();
        const tenant_a = make_contract_tenant_id();
        const tenant_b = make_contract_tenant_id();
        await store.set_token(tenant_a, hash_of(tenant_a, 'a'));
        await store.set_token(tenant_b, hash_of(tenant_b, 'a'));

        expect(await store.find_subscriber_by_token_hash(hash_of(tenant_a, 'a'))).toBe(tenant_a);
        expect(await store.find_subscriber_by_token_hash(hash_of(tenant_b, 'a'))).toBe(tenant_b);
        expect((await store.get_feed(tenant_a))?.token_hash).toBe(hash_of(tenant_a, 'a'));
        expect((await store.get_feed(tenant_b))?.token_hash).toBe(hash_of(tenant_b, 'a'));
      });

      it('return copies a caller cannot use to change the store', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.set_token(tenant_id, hash_of(tenant_id, 'a'));

        const first = await store.get_feed(tenant_id);
        first!.rotation_count = 99;
        first!.token_hash = 'tampered';

        expect(await store.get_feed(tenant_id)).toMatchObject({
          rotation_count: 0,
          token_hash: hash_of(tenant_id, 'a'),
        });
      });
    });

    describe('record_fetch', () => {
      it('counts each fetch and keeps the latest time, leaving the audit stamps alone', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const created = await store.write_feed_token(
          tenant_id,
          hash_of(tenant_id, 'a'),
          'owner-1',
          FeedWriteMode.CREATE_ONLY,
        );

        await store.record_fetch(tenant_id, 5000);
        await store.record_fetch(tenant_id, 7000);

        expect(await store.get_feed(tenant_id)).toEqual({
          ...created,
          fetch_count: 2,
          last_fetched_at: 7000,
        });
      });

      it('never moves the last fetch time backward', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.set_token(tenant_id, hash_of(tenant_id, 'a'));
        await store.record_fetch(tenant_id, 9000);

        await store.record_fetch(tenant_id, 3000);

        expect(await store.get_feed(tenant_id)).toMatchObject({
          fetch_count: 2,
          last_fetched_at: 9000,
        });
      });

      it('counts all of several simultaneous fetches', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.set_token(tenant_id, hash_of(tenant_id, 'a'));

        await Promise.all([1, 2, 3, 4, 5].map((n) => store.record_fetch(tenant_id, n * 1000)));

        expect(await store.get_feed(tenant_id)).toMatchObject({
          fetch_count: 5,
          last_fetched_at: 5000,
        });
      });

      it('ignores an unknown tenant and creates nothing', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();

        await expect(store.record_fetch(tenant_id, 1000)).resolves.toBeUndefined();

        expect(await store.get_feed(tenant_id)).toBeNull();
      });

      it('only counts for the tenant it names', async () => {
        const store = make();
        const tenant_a = make_contract_tenant_id();
        const tenant_b = make_contract_tenant_id();
        await store.set_token(tenant_a, hash_of(tenant_a, 'a'));
        await store.set_token(tenant_b, hash_of(tenant_b, 'a'));

        await store.record_fetch(tenant_a, 4000);

        expect((await store.get_feed(tenant_a))?.fetch_count).toBe(1);
        expect((await store.get_feed(tenant_b))?.fetch_count).toBe(0);
      });
    });

    describe('delete_token', () => {
      it('removes the feed so its hash stops matching', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.set_token(tenant_id, hash_of(tenant_id, 'a'));

        await store.delete_token(tenant_id);

        expect(await store.get_feed(tenant_id)).toBeNull();
        expect(await store.find_subscriber_by_token_hash(hash_of(tenant_id, 'a'))).toBeNull();
      });

      it('succeeds when there is nothing to remove', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();

        await expect(store.delete_token(tenant_id)).resolves.toBeUndefined();
        await expect(store.delete_token(tenant_id)).resolves.toBeUndefined();
      });

      it("removes only that tenant's feed", async () => {
        const store = make();
        const tenant_a = make_contract_tenant_id();
        const tenant_b = make_contract_tenant_id();
        await store.set_token(tenant_a, hash_of(tenant_a, 'a'));
        await store.set_token(tenant_b, hash_of(tenant_b, 'a'));

        await store.delete_token(tenant_a);

        expect(await store.get_feed(tenant_b)).not.toBeNull();
        expect(await store.find_subscriber_by_token_hash(hash_of(tenant_b, 'a'))).toBe(tenant_b);
      });

      it('lets the tenant create a fresh feed afterwards, counting from zero again', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.set_token(tenant_id, hash_of(tenant_id, 'a'));
        await store.set_token(tenant_id, hash_of(tenant_id, 'b'));
        await store.delete_token(tenant_id);

        const again = await store.write_feed_token(
          tenant_id,
          hash_of(tenant_id, 'c'),
          'o',
          FeedWriteMode.CREATE_ONLY,
        );

        expect(again.rotation_count).toBe(0);
        expect(await store.find_subscriber_by_token_hash(hash_of(tenant_id, 'b'))).toBeNull();
      });
    });
  });
}
