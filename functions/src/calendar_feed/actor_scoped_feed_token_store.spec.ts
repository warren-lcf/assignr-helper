import { describe, expect, it, vi } from 'vitest';
import { ActorScopedFeedTokenStore } from './actor_scoped_feed_token_store.js';
import { FeedWriteMode } from './enums/feed_write_mode.enum.js';
import { CalendarFeedExistsError } from './errors/calendar_feed_exists.error.js';
import { CalendarFeedNotFoundError } from './errors/calendar_feed_not_found.error.js';
import { InMemoryCalendarFeedStore } from './stores/in_memory_calendar_feed_store.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

describe('ActorScopedFeedTokenStore', () => {
  it('writes with its actor and mode and remembers the written row', async () => {
    const store = new InMemoryCalendarFeedStore();
    const adapter = new ActorScopedFeedTokenStore(store, 'owner-1', FeedWriteMode.CREATE_ONLY);

    await adapter.set_token('t1', HASH_A);

    expect(adapter.written).toMatchObject({ tenant_id: 't1', created_by: 'owner-1' });
    expect(await store.get_feed('t1')).toEqual(adapter.written);
  });

  it('has nothing written before set_token is called', () => {
    const adapter = new ActorScopedFeedTokenStore(
      new InMemoryCalendarFeedStore(),
      'owner-1',
      FeedWriteMode.CREATE_ONLY,
    );

    expect(adapter.written).toBeNull();
  });

  it('refuses to create over an existing feed when the mode is create-only', async () => {
    const store = new InMemoryCalendarFeedStore();
    await store.set_token('t1', HASH_A);
    const adapter = new ActorScopedFeedTokenStore(store, 'owner-1', FeedWriteMode.CREATE_ONLY);

    await expect(adapter.set_token('t1', HASH_B)).rejects.toBeInstanceOf(CalendarFeedExistsError);

    expect(adapter.written).toBeNull();
  });

  it('refuses to replace a missing feed when the mode is replace-only', async () => {
    const adapter = new ActorScopedFeedTokenStore(
      new InMemoryCalendarFeedStore(),
      'owner-1',
      FeedWriteMode.REPLACE_ONLY,
    );

    await expect(adapter.set_token('t1', HASH_A)).rejects.toBeInstanceOf(CalendarFeedNotFoundError);
  });

  it('hands lookups, fetch recording and deletion to the store unchanged', async () => {
    const store = new InMemoryCalendarFeedStore();
    const find = vi.spyOn(store, 'find_subscriber_by_token_hash');
    const record = vi.spyOn(store, 'record_fetch');
    const remove = vi.spyOn(store, 'delete_token');
    const adapter = new ActorScopedFeedTokenStore(store, 'owner-1', FeedWriteMode.UPSERT);
    await adapter.set_token('t1', HASH_A);

    expect(await adapter.find_subscriber_by_token_hash(HASH_A)).toBe('t1');
    await adapter.record_fetch('t1', 5000);
    await adapter.delete_token('t1');

    expect(find).toHaveBeenCalledWith(HASH_A);
    expect(record).toHaveBeenCalledWith('t1', 5000);
    expect(remove).toHaveBeenCalledWith('t1');
    expect(await store.get_feed('t1')).toBeNull();
  });
});
