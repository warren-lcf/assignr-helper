import type { Database } from '@google-cloud/spanner';
import { describe, expect, it, vi } from 'vitest';
import { SpannerConnectionStore } from './spanner_connection_store.js';

function row(connection_id: string, scopes_json: string): Record<string, unknown> {
  return {
    tenant_id: 't1',
    connection_id,
    provider: 'ASSIGNR',
    status: 'CONNECTED',
    account_label: null,
    external_account_id: null,
    secret_ref: null,
    scopes_json,
    last_sync_at: null,
    last_error: null,
    created_at: '1',
    created_by: 'seed',
    updated_at: '1',
    updated_by: 'seed',
  };
}

function store_returning(rows: Record<string, unknown>[]): SpannerConnectionStore {
  const database = { run: vi.fn(async () => [rows]) } as unknown as Database;
  return new SpannerConnectionStore(database);
}

describe('SpannerConnectionStore.list_syncable_connections resilience', () => {
  it('skips an unreadable row, logs the real error, and still returns the readable ones', async () => {
    const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = store_returning([
      row('good-1', '["read"]'),
      row('broken', '{not json'),
      row('good-2', '[]'),
    ]);

    const connections = await store.list_syncable_connections(10);

    expect(connections.map((connection) => connection.connection_id)).toEqual(['good-1', 'good-2']);
    expect(error_spy).toHaveBeenCalledWith(
      'Skipping an unreadable connection row',
      'broken',
      expect.any(Error),
    );
    error_spy.mockRestore();
  });

  it('returns nothing, without error, when every row is readable but there are none', async () => {
    expect(await store_returning([]).list_syncable_connections(5)).toEqual([]);
  });
});
