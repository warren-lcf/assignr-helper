import { describe, expect, it } from 'vitest';
import { FeedWriteMode } from '../enums/feed_write_mode.enum.js';
import { describe_calendar_feed_store_contract } from './contracts/calendar_feed_store.contract.js';
import { InMemoryCalendarFeedStore } from './in_memory_calendar_feed_store.js';

describe_calendar_feed_store_contract('InMemory', () => new InMemoryCalendarFeedStore());

describe('InMemoryCalendarFeedStore', () => {
  it('stamps rows with the injected clock', async () => {
    const store = new InMemoryCalendarFeedStore({ now: () => 4242 });

    const created = await store.write_feed_token(
      't1',
      'a'.repeat(64),
      'owner',
      FeedWriteMode.UPSERT,
    );
    const replaced = await store.write_feed_token(
      't1',
      'b'.repeat(64),
      'owner',
      FeedWriteMode.UPSERT,
    );

    expect(created).toMatchObject({ created_at: 4242, updated_at: 4242 });
    expect(replaced).toMatchObject({ created_at: 4242, updated_at: 4242 });
  });

  it('lets a tenant write the hash it already has without tripping the uniqueness check', async () => {
    const store = new InMemoryCalendarFeedStore();
    await store.set_token('t1', 'a'.repeat(64));

    await expect(store.set_token('t1', 'a'.repeat(64))).resolves.toBeUndefined();
  });
});
