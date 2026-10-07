import { Database } from '@google-cloud/spanner';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  is_spanner_emulator_configured,
  open_emulator_database,
} from '../../sync/stores/spanner_emulator.fixture.js';
import { describe_quick_link_store_contract } from './contracts/quick_link_store.contract.js';
import { SpannerQuickLinkStore } from './spanner_quick_link_store.js';

/**
 * Builds a database whose `run` records its request and returns the given rows.
 * @param rows Rows every query returns.
 * @returns The `run` spy and the fake database.
 */
function make_recording_database(rows: Record<string, unknown>[] = []) {
  const run = vi.fn(async (_request: unknown) => [rows]);
  return { run, database: { run } as unknown as Database };
}

/**
 * Builds a stored row in the shape a JSON-mode query returns.
 * @param overrides Cells to replace.
 * @returns A row.
 */
function make_row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenant_id: 't1',
    link_id: 'l1',
    token_hash: 'a'.repeat(64),
    scope_json: JSON.stringify({
      organization_ids: [],
      levels: [],
      date_start: null,
      date_end: null,
    }),
    expires_at: null,
    revoked_at: null,
    last_viewed_at: null,
    view_count: '3',
    email_draft_id: null,
    created_at: '1000',
    created_by: 'c',
    updated_at: '1000',
    updated_by: 'c',
    ...overrides,
  };
}

describe('SpannerQuickLinkStore without a database round trip', () => {
  it('looks a token hash up through the unique index, binding it as a parameter', async () => {
    const { run, database } = make_recording_database([make_row()]);

    const link = await new SpannerQuickLinkStore(database).find_by_token_hash('b'.repeat(64));

    const [request] = run.mock.calls.map(
      ([sent]) => sent as { sql: string; types: Record<string, string>; params: object },
    );
    expect(request?.sql).toContain('FORCE_INDEX=quick_links_by_token_hash');
    expect(request?.sql).toContain('WHERE token_hash = @token_hash');
    expect(request?.sql).not.toContain('b'.repeat(64));
    expect(request?.params).toEqual({ token_hash: 'b'.repeat(64) });
    expect(link).toMatchObject({ link_id: 'l1', view_count: 3, created_at: 1000 });
  });

  it('returns null when no row matches', async () => {
    const { database } = make_recording_database();
    const store = new SpannerQuickLinkStore(database);

    expect(await store.find_by_token_hash('c'.repeat(64))).toBeNull();
    expect(await store.get_link('t1', 'l1')).toBeNull();
  });

  it('filters every tenant read on the tenant id', async () => {
    const { run, database } = make_recording_database();
    const store = new SpannerQuickLinkStore(database);

    await store.get_link('t1', 'l1');
    await store.list_links('t1');

    for (const [sent] of run.mock.calls) {
      const request = sent as { sql: string; params: Record<string, unknown> };
      expect(request.sql).toContain('tenant_id = @tenant_id');
      expect(request.params['tenant_id']).toBe('t1');
    }
  });

  it.each([
    ['is corrupt JSON', '{broken'],
    ['is missing', null],
    ['is not an object', '[]'],
    [
      'has a non-list organization_ids',
      '{"organization_ids":"x","levels":[],"date_start":null,"date_end":null}',
    ],
    [
      'has a non-string level',
      '{"organization_ids":[],"levels":[3],"date_start":null,"date_end":null}',
    ],
    [
      'has a non-numeric date',
      '{"organization_ids":[],"levels":[],"date_start":"x","date_end":null}',
    ],
    ['lacks the date bounds', '{"organization_ids":[],"levels":[]}'],
  ])(
    'refuses a link whose stored scope %s rather than treating it as unrestricted',
    async (_case, scope_json) => {
      const { database } = make_recording_database([make_row({ scope_json })]);
      const store = new SpannerQuickLinkStore(database);

      await expect(store.find_by_token_hash('d'.repeat(64))).rejects.toThrow(/scope_json/);
      await expect(store.get_link('t1', 'l1')).rejects.toThrow(/scope_json/);
    },
  );
});

/**
 * Builds a database whose read-write transaction records the work done inside it.
 * @param rows Rows every transactional query returns.
 * @param row_count Rows an UPDATE statement reports as changed.
 * @returns The transaction spies, an `insert` spy for the table, and the fake database.
 */
function make_transaction_database(rows: Record<string, unknown>[], row_count = 1) {
  const transaction = {
    run: vi.fn(async (_request: unknown) => [rows]),
    update: vi.fn(),
    runUpdate: vi.fn(async (_request: unknown) => [row_count]),
    commit: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined),
  };
  const insert = vi.fn(async (_row: unknown) => undefined);
  const database = {
    runTransactionAsync: async (work: (tx: typeof transaction) => Promise<unknown>) =>
      work(transaction),
    table: () => ({ insert }),
  } as unknown as Database;
  return { transaction, insert, database };
}

describe('SpannerQuickLinkStore writes without a database round trip', () => {
  it('inserts the token hash and a JSON scope, never a token', async () => {
    const { insert, database } = make_transaction_database([]);
    const link = {
      tenant_id: 't1',
      link_id: 'l1',
      token_hash: 'e'.repeat(64),
      scope: { organization_ids: ['o1'], levels: ['U12'], date_start: null, date_end: null },
      expires_at: 5,
      revoked_at: null,
      last_viewed_at: null,
      view_count: 0,
      email_draft_id: null,
      created_at: 1,
      created_by: 'c',
      updated_at: 1,
      updated_by: 'c',
    };

    await new SpannerQuickLinkStore(database).create_link(link);

    expect(insert).toHaveBeenCalledWith({
      tenant_id: 't1',
      link_id: 'l1',
      token_hash: 'e'.repeat(64),
      scope_json: JSON.stringify(link.scope),
      expires_at: 5,
      revoked_at: null,
      last_viewed_at: null,
      view_count: 0,
      email_draft_id: null,
      created_at: 1,
      created_by: 'c',
      updated_at: 1,
      updated_by: 'c',
    });
  });

  it('revokes an active link with one update of the revocation and the stamp', async () => {
    const { transaction, database } = make_transaction_database([make_row()]);

    const result = await new SpannerQuickLinkStore(database).revoke_link('t1', 'l1', 7000, 'me');

    expect(result?.revoked_now).toBe(true);
    expect(result?.link).toMatchObject({ revoked_at: 7000, updated_at: 7000, updated_by: 'me' });
    expect(transaction.update).toHaveBeenCalledWith('quick_links', {
      tenant_id: 't1',
      link_id: 'l1',
      revoked_at: 7000,
      updated_at: 7000,
      updated_by: 'me',
    });
    expect(transaction.commit).toHaveBeenCalledTimes(1);
  });

  it('writes nothing when the link is already revoked', async () => {
    const { transaction, database } = make_transaction_database([make_row({ revoked_at: '4000' })]);

    const result = await new SpannerQuickLinkStore(database).revoke_link('t1', 'l1', 7000, 'me');

    expect(result).toMatchObject({ revoked_now: false, link: { revoked_at: 4000 } });
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it('returns null and writes nothing when there is no such link', async () => {
    const { transaction, database } = make_transaction_database([]);

    expect(await new SpannerQuickLinkStore(database).revoke_link('t1', 'l1', 1, 'me')).toBeNull();
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it('reads the link inside the same transaction that revokes it', async () => {
    const { transaction, database } = make_transaction_database([make_row()]);

    await new SpannerQuickLinkStore(database).revoke_link('t1', 'l1', 1, 'me');

    const [sent] = transaction.run.mock.calls[0] as [{ sql: string; params: object }];
    expect(sent.sql).toContain('WHERE tenant_id = @tenant_id AND link_id = @link_id');
    expect(sent.params).toEqual({ tenant_id: 't1', link_id: 'l1' });
  });

  it('counts a view with one atomic UPDATE bound as parameters', async () => {
    const { transaction, database } = make_transaction_database([]);

    const counted = await new SpannerQuickLinkStore(database).record_view('t1', 'l1', 9000);

    expect(counted).toBe(true);
    const [sent] = transaction.runUpdate.mock.calls[0] as [
      { sql: string; params: object; types: Record<string, string> },
    ];
    expect(sent.sql).toContain('view_count = view_count + 1');
    expect(sent.sql).toContain('WHERE tenant_id = @tenant_id AND link_id = @link_id');
    expect(sent.sql).not.toContain('9000');
    expect(sent.params).toEqual({ tenant_id: 't1', link_id: 'l1', now: 9000 });
    expect(sent.types['now']).toBe('int64');
  });

  it('reports false when no link was updated', async () => {
    const { database } = make_transaction_database([], 0);

    expect(await new SpannerQuickLinkStore(database).record_view('t1', 'nope', 1)).toBe(false);
  });
});

describe.skipIf(!is_spanner_emulator_configured())(
  'SpannerQuickLinkStore (emulator)',
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

    describe_quick_link_store_contract('Spanner', () => new SpannerQuickLinkStore(database));
  },
);
