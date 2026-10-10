import { describe, expect, it } from 'vitest';
import { IStoredCalendarFeed } from '../models/stored_calendar_feed.model.js';
import { to_feed_view } from './to_feed_view.js';

const FEED: IStoredCalendarFeed = {
  tenant_id: 't1',
  token_hash: 'a'.repeat(64),
  rotation_count: 2,
  fetch_count: 7,
  last_fetched_at: 9000,
  created_at: 1000,
  created_by: 'creator',
  updated_at: 3000,
  updated_by: 'updater',
};

describe('to_feed_view', () => {
  it('exposes exactly the status, times and counters', () => {
    expect(to_feed_view(FEED)).toEqual({
      status: 'ACTIVE',
      created_at: 1000,
      last_fetched_at: 9000,
      fetch_count: 7,
      rotation_count: 2,
    });
  });

  it('keeps a never-fetched feed as null', () => {
    expect(to_feed_view({ ...FEED, last_fetched_at: null }).last_fetched_at).toBeNull();
  });

  it('never carries the token hash, the tenant or the audit actors', () => {
    const serialized = JSON.stringify(to_feed_view(FEED));

    for (const hidden of ['a'.repeat(64), 't1', 'creator', 'updater', 'token_hash', 'tenant_id']) {
      expect(serialized).not.toContain(hidden);
    }
  });
});
