import { Database } from '@google-cloud/spanner';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { make_game_view } from '../../domain/games/make_game_view.fixture.js';
import {
  is_spanner_emulator_configured,
  open_emulator_database,
} from '../../sync/stores/spanner_emulator.fixture.js';
import { BeginSendOutcome } from '../enums/begin_send_outcome.enum.js';
import { DeleteDraftOutcome } from '../enums/delete_draft_outcome.enum.js';
import { DraftStatus } from '../enums/draft_status.enum.js';
import { DraftWriteOutcome } from '../enums/draft_write_outcome.enum.js';
import { describe_email_draft_store_contract } from './contracts/email_draft_store.contract.js';
import { make_contract_draft } from './contracts/make_contract_draft.js';
import { serialize_draft_content } from './draft_content_json.js';
import { SpannerEmailDraftStore } from './spanner_email_draft_store.js';

/**
 * Builds a stored row in the shape a JSON-mode query returns.
 * @param overrides Cells to replace.
 * @returns A row.
 */
function make_row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const draft = make_contract_draft('t1', 'd1');
  return {
    tenant_id: 't1',
    draft_id: 'd1',
    subject: 'Games d1',
    status: 'DRAFT',
    filter_json: serialize_draft_content(draft),
    quick_link_id: null,
    recipient_count: null,
    sent_at: null,
    created_at: '1000',
    created_by: 'creator',
    updated_at: '1000',
    updated_by: 'creator',
    ...overrides,
  };
}

/**
 * Builds a database whose reads and read-write transaction record what is asked of them.
 * @param rows Rows every query returns.
 * @returns The spies and the fake database.
 */
function make_database(rows: Record<string, unknown>[]) {
  const run = vi.fn(async (_request: unknown) => [rows]);
  const transaction = {
    run,
    runUpdate: vi.fn(async (_request: unknown) => [1]),
    insert: vi.fn(),
    update: vi.fn(),
    deleteRows: vi.fn(),
    commit: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined),
  };
  const insert = vi.fn(async (_row: unknown) => undefined);
  const database = {
    run,
    table: () => ({ insert }),
    runTransactionAsync: async (work: (tx: typeof transaction) => Promise<unknown>) =>
      work(transaction),
  } as unknown as Database;
  return { run, transaction, insert, database };
}

interface Sent {
  sql: string;
  params: Record<string, unknown>;
}

describe('SpannerEmailDraftStore without a database round trip', () => {
  it('maps a row, reading the content from filter_json and INT64 cells as numbers', async () => {
    const { database } = make_database([make_row({ recipient_count: '4', sent_at: '9000' })]);

    const draft = await new SpannerEmailDraftStore(database).get_draft('t1', 'd1');

    expect(draft).toEqual({
      ...make_contract_draft('t1', 'd1'),
      recipient_count: 4,
      sent_at: 9000,
    });
  });

  it('refuses a row with an unknown status or unreadable content', async () => {
    const bad_status = make_database([make_row({ status: 'ARCHIVED' })]);
    const bad_content = make_database([make_row({ filter_json: '{oops' })]);

    await expect(
      new SpannerEmailDraftStore(bad_status.database).get_draft('t1', 'd1'),
    ).rejects.toThrow(/status/);
    await expect(
      new SpannerEmailDraftStore(bad_content.database).get_draft('t1', 'd1'),
    ).rejects.toThrow(/filter_json/);
  });

  it('returns null when no row matches', async () => {
    const { database } = make_database([]);

    expect(await new SpannerEmailDraftStore(database).get_draft('t1', 'nope')).toBeNull();
  });

  it('filters every read on the tenant id and binds values as parameters', async () => {
    const { run, database } = make_database([]);
    const store = new SpannerEmailDraftStore(database);

    await store.get_draft('t1', 'd1');
    await store.list_drafts('t1', 5);
    await store.list_draft_games('t1', 'd1');

    for (const [sent] of run.mock.calls) {
      const request = sent as Sent;
      expect(request.sql).toContain('tenant_id = @tenant_id');
      expect(request.params['tenant_id']).toBe('t1');
      expect(request.sql).not.toContain('d1');
    }
  });

  it('does not query for a limit below one', async () => {
    const { run, database } = make_database([]);

    expect(await new SpannerEmailDraftStore(database).list_drafts('t1', 0)).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it('inserts a draft with the content in filter_json and no body', async () => {
    const { insert, database } = make_database([]);
    const draft = make_contract_draft('t1', 'd1', { subject: 'Hello' });

    await new SpannerEmailDraftStore(database).create_draft(draft);

    const [row] = insert.mock.calls[0] as [Record<string, unknown>];
    expect(row).toMatchObject({
      tenant_id: 't1',
      draft_id: 'd1',
      subject: 'Hello',
      status: 'DRAFT',
    });
    expect(row['filter_json']).toBe(serialize_draft_content(draft));
    expect(Object.keys(row)).not.toContain('body_html');
  });

  describe('update_draft', () => {
    it('reads then updates subject, content and version in one transaction', async () => {
      const { transaction, database } = make_database([make_row()]);
      const content = { ...make_contract_draft('t1', 'd1'), subject: 'New' };

      const result = await new SpannerEmailDraftStore(database).update_draft(
        't1',
        'd1',
        1000,
        content,
        5000,
        'editor',
      );

      expect(result.outcome).toBe(DraftWriteOutcome.UPDATED);
      expect(transaction.update).toHaveBeenCalledWith('email_drafts', {
        tenant_id: 't1',
        draft_id: 'd1',
        subject: 'New',
        filter_json: serialize_draft_content(content),
        updated_at: 5000,
        updated_by: 'editor',
      });
    });

    it('writes nothing when the version is stale, the draft is locked or missing', async () => {
      const stale = make_database([make_row({ updated_at: '2000' })]);
      const locked = make_database([make_row({ status: 'SENDING' })]);
      const missing = make_database([]);
      const content = make_contract_draft('t1', 'd1');

      const results = await Promise.all([
        new SpannerEmailDraftStore(stale.database).update_draft('t1', 'd1', 1000, content, 5, 'a'),
        new SpannerEmailDraftStore(locked.database).update_draft('t1', 'd1', 1000, content, 5, 'a'),
        new SpannerEmailDraftStore(missing.database).update_draft(
          't1',
          'd1',
          1000,
          content,
          5,
          'a',
        ),
      ]);

      expect(results.map((r) => r.outcome)).toEqual([
        DraftWriteOutcome.STALE,
        DraftWriteOutcome.NOT_DRAFT,
        DraftWriteOutcome.NOT_FOUND,
      ]);
      for (const { transaction } of [stale, locked, missing]) {
        expect(transaction.update).not.toHaveBeenCalled();
      }
    });
  });

  describe('delete_draft', () => {
    it('deletes a DRAFT by key inside the transaction that checked it', async () => {
      const { transaction, database } = make_database([make_row()]);

      expect(await new SpannerEmailDraftStore(database).delete_draft('t1', 'd1')).toBe(
        DeleteDraftOutcome.DELETED,
      );
      expect(transaction.deleteRows).toHaveBeenCalledWith('email_drafts', [['t1', 'd1']]);
    });

    it('keeps a draft that was sent, and reports a missing one', async () => {
      const sent = make_database([make_row({ status: 'SENT' })]);
      const missing = make_database([]);

      expect(await new SpannerEmailDraftStore(sent.database).delete_draft('t1', 'd1')).toBe(
        DeleteDraftOutcome.NOT_DRAFT,
      );
      expect(await new SpannerEmailDraftStore(missing.database).delete_draft('t1', 'd1')).toBe(
        DeleteDraftOutcome.NOT_FOUND,
      );
      expect(sent.transaction.deleteRows).not.toHaveBeenCalled();
    });
  });

  describe('begin_send', () => {
    it('locks a DRAFT with one status update', async () => {
      const { transaction, database } = make_database([make_row()]);

      const result = await new SpannerEmailDraftStore(database).begin_send(
        't1',
        'd1',
        5000,
        'me',
        600_000,
      );

      expect(result.outcome).toBe(BeginSendOutcome.STARTED);
      expect(result.revert_to).toBe(DraftStatus.DRAFT);
      expect(transaction.update).toHaveBeenCalledWith('email_drafts', {
        tenant_id: 't1',
        draft_id: 'd1',
        status: 'SENDING',
        updated_at: 5000,
        updated_by: 'me',
      });
    });

    it('refuses a draft that is sending recently or already sent, writing nothing', async () => {
      const sending = make_database([make_row({ status: 'SENDING', updated_at: '4000' })]);
      const sent = make_database([make_row({ status: 'SENT' })]);

      const a = await new SpannerEmailDraftStore(sending.database).begin_send(
        't1',
        'd1',
        5000,
        'me',
        600_000,
      );
      const b = await new SpannerEmailDraftStore(sent.database).begin_send(
        't1',
        'd1',
        5000,
        'me',
        600_000,
      );

      expect(a.outcome).toBe(BeginSendOutcome.NOT_SENDABLE);
      expect(b.outcome).toBe(BeginSendOutcome.NOT_SENDABLE);
      expect(sending.transaction.update).not.toHaveBeenCalled();
      expect(sent.transaction.update).not.toHaveBeenCalled();
    });

    it('takes over a stale lock and reverts to PARTIALLY_SENT', async () => {
      const { database } = make_database([make_row({ status: 'SENDING', updated_at: '1000' })]);

      const result = await new SpannerEmailDraftStore(database).begin_send(
        't1',
        'd1',
        700_000,
        'me',
        600_000,
      );

      expect(result.outcome).toBe(BeginSendOutcome.STARTED);
      expect(result.revert_to).toBe(DraftStatus.PARTIALLY_SENT);
    });

    it('reports a missing draft', async () => {
      const { database } = make_database([]);

      const result = await new SpannerEmailDraftStore(database).begin_send('t1', 'd1', 1, 'me', 1);

      expect(result.outcome).toBe(BeginSendOutcome.NOT_FOUND);
    });
  });

  describe('finish_send and revert_send', () => {
    it('records the totals on a SENDING draft, keeping earlier values for nulls', async () => {
      const { transaction, database } = make_database([
        make_row({ status: 'SENDING', quick_link_id: 'ql-old', sent_at: '3000' }),
      ]);

      const finished = await new SpannerEmailDraftStore(database).finish_send(
        't1',
        'd1',
        {
          status: DraftStatus.PARTIALLY_SENT,
          recipient_count: 2,
          quick_link_id: null,
          sent_at: null,
        },
        8000,
        'me',
      );

      expect(finished).toMatchObject({
        quick_link_id: 'ql-old',
        sent_at: 3000,
        recipient_count: 2,
      });
      expect(transaction.update).toHaveBeenCalledWith('email_drafts', {
        tenant_id: 't1',
        draft_id: 'd1',
        status: 'PARTIALLY_SENT',
        recipient_count: 2,
        quick_link_id: 'ql-old',
        sent_at: 3000,
        updated_at: 8000,
        updated_by: 'me',
      });
    });

    it('changes nothing for a draft that is not SENDING', async () => {
      const { transaction, database } = make_database([make_row({ status: 'SENT' })]);
      const store = new SpannerEmailDraftStore(database);

      expect(
        await store.finish_send(
          't1',
          'd1',
          { status: DraftStatus.SENT, recipient_count: 1, quick_link_id: null, sent_at: 1 },
          1,
          'me',
        ),
      ).toBeNull();
      expect(await store.revert_send('t1', 'd1', DraftStatus.DRAFT, 1, 'me')).toBeNull();
      expect(transaction.update).not.toHaveBeenCalled();
    });

    it('puts a SENDING draft back', async () => {
      const { transaction, database } = make_database([make_row({ status: 'SENDING' })]);

      const reverted = await new SpannerEmailDraftStore(database).revert_send(
        't1',
        'd1',
        DraftStatus.DRAFT,
        6000,
        'me',
      );

      expect(reverted?.status).toBe(DraftStatus.DRAFT);
      expect(transaction.update).toHaveBeenCalledWith('email_drafts', {
        tenant_id: 't1',
        draft_id: 'd1',
        status: 'DRAFT',
        updated_at: 6000,
        updated_by: 'me',
      });
    });
  });

  describe('draft games', () => {
    it('replaces the games with a delete and an insert in one transaction', async () => {
      const { transaction, database } = make_database([]);
      const game = make_game_view({ game_id: 'g1' });

      await new SpannerEmailDraftStore(database).replace_draft_games(
        't1',
        'd1',
        [{ game_id: 'g1', game }],
        7000,
        'me',
      );

      const [delete_request] = transaction.runUpdate.mock.calls[0] as [Sent];
      expect(delete_request.sql).toContain('DELETE FROM email_draft_games');
      expect(delete_request.params).toEqual({ tenant_id: 't1', draft_id: 'd1' });
      expect(transaction.insert).toHaveBeenCalledWith('email_draft_games', [
        {
          tenant_id: 't1',
          draft_id: 'd1',
          game_id: 'g1',
          snapshot_json: JSON.stringify(game),
          created_at: 7000,
          created_by: 'me',
          updated_at: 7000,
          updated_by: 'me',
        },
      ]);
    });

    it('only deletes when there are no games to record', async () => {
      const { transaction, database } = make_database([]);

      await new SpannerEmailDraftStore(database).replace_draft_games('t1', 'd1', [], 7000, 'me');

      expect(transaction.runUpdate).toHaveBeenCalledTimes(1);
      expect(transaction.insert).not.toHaveBeenCalled();
    });

    it('reads the snapshots back as game views', async () => {
      const game = make_game_view({ game_id: 'g1' });
      const { database } = make_database([{ game_id: 'g1', snapshot_json: JSON.stringify(game) }]);

      const games = await new SpannerEmailDraftStore(database).list_draft_games('t1', 'd1');

      expect(games).toEqual([{ game_id: 'g1', game }]);
    });
  });
});

describe.skipIf(!is_spanner_emulator_configured())(
  'SpannerEmailDraftStore (emulator)',
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

    describe_email_draft_store_contract('Spanner', () => new SpannerEmailDraftStore(database));
  },
);
