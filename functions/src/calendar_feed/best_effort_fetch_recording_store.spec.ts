import { describe, expect, it, vi } from 'vitest';
import { BestEffortFetchRecordingStore } from './best_effort_fetch_recording_store.js';
import { InMemoryCalendarFeedStore } from './stores/in_memory_calendar_feed_store.js';

const HASH = 'a'.repeat(64);

describe('BestEffortFetchRecordingStore', () => {
  it('records a fetch when the inner store can', async () => {
    const inner = new InMemoryCalendarFeedStore();
    await inner.set_token('t1', HASH);

    await new BestEffortFetchRecordingStore(inner).record_fetch('t1', 5000);

    expect(await inner.get_feed('t1')).toMatchObject({ fetch_count: 1, last_fetched_at: 5000 });
  });

  it('logs and swallows a failure to record, naming the tenant and not the hash', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const inner = new InMemoryCalendarFeedStore();
    vi.spyOn(inner, 'record_fetch').mockRejectedValue(new Error('spanner unavailable'));

    await expect(
      new BestEffortFetchRecordingStore(inner).record_fetch('t1', 5000),
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[1]).toBe('t1');
    expect(JSON.stringify(error.mock.calls)).not.toContain(HASH);
    error.mockRestore();
  });

  it('hands every other call to the inner store unchanged', async () => {
    const inner = new InMemoryCalendarFeedStore();
    const wrapper = new BestEffortFetchRecordingStore(inner);

    await wrapper.set_token('t1', HASH);
    expect(await wrapper.find_subscriber_by_token_hash(HASH)).toBe('t1');
    await wrapper.delete_token('t1');

    expect(await inner.get_feed('t1')).toBeNull();
  });

  it('does not hide a failure to look a token up', async () => {
    const inner = new InMemoryCalendarFeedStore();
    vi.spyOn(inner, 'find_subscriber_by_token_hash').mockRejectedValue(new Error('down'));

    await expect(
      new BestEffortFetchRecordingStore(inner).find_subscriber_by_token_hash(HASH),
    ).rejects.toThrow('down');
  });
});
