import { Database } from '@google-cloud/spanner';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DeliveryErrorCode } from '../../email_delivery/enums/delivery_error_code.enum.js';
import {
  is_spanner_emulator_configured,
  open_emulator_database,
} from '../../sync/stores/spanner_emulator.fixture.js';
import { DeliveryStatus } from '../enums/delivery_status.enum.js';
import { IStoredDraftRecipient } from '../models/stored_draft_recipient.model.js';
import { describe_email_delivery_store_contract } from './contracts/email_delivery_store.contract.js';
import { SpannerEmailDeliveryStore } from './spanner_email_delivery_store.js';

/**
 * Builds a stored row in the shape a JSON-mode query returns.
 * @param overrides Cells to replace.
 * @returns A row.
 */
function make_row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenant_id: 't1',
    draft_id: 'd1',
    contact_id: 'c1',
    status: 'SENT',
    provider_message_id: 'msg-1',
    error_code: null,
    sent_at: '5000',
    created_at: '5000',
    created_by: 'sender',
    updated_at: '5000',
    updated_by: 'sender',
    ...overrides,
  };
}

const NEW_RESULT: IStoredDraftRecipient = {
  tenant_id: 't1',
  draft_id: 'd1',
  contact_id: 'c1',
  status: DeliveryStatus.SENT,
  provider_message_id: 'msg-2',
  error_code: null,
  sent_at: 9000,
  created_at: 9000,
  created_by: 'later',
  updated_at: 9000,
  updated_by: 'later',
};

/**
 * Builds a database whose reads and read-write transaction record what is asked of them.
 * @param rows Rows every query returns.
 * @returns The spies and the fake database.
 */
function make_database(rows: Record<string, unknown>[]) {
  const run = vi.fn(async (_request: unknown) => [rows]);
  const transaction = {
    run,
    upsert: vi.fn(),
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

describe('SpannerEmailDeliveryStore without a database round trip', () => {
  it('lists recipients of one draft of one tenant, binding the ids as parameters', async () => {
    const { run, database } = make_database([make_row()]);

    const listed = await new SpannerEmailDeliveryStore(database).list_recipients('t1', 'd1');

    expect(listed).toEqual([
      {
        tenant_id: 't1',
        draft_id: 'd1',
        contact_id: 'c1',
        status: DeliveryStatus.SENT,
        provider_message_id: 'msg-1',
        error_code: null,
        sent_at: 5000,
        created_at: 5000,
        created_by: 'sender',
        updated_at: 5000,
        updated_by: 'sender',
      },
    ]);
    const [sent] = run.mock.calls[0] as [{ sql: string; params: object }];
    expect(sent.sql).toContain('tenant_id = @tenant_id AND draft_id = @draft_id');
    expect(sent.params).toEqual({ tenant_id: 't1', draft_id: 'd1' });
  });

  it('refuses a row with an unknown status', async () => {
    const { database } = make_database([make_row({ status: 'QUEUED' })]);

    await expect(
      new SpannerEmailDeliveryStore(database).list_recipients('t1', 'd1'),
    ).rejects.toThrow(/status/);
  });

  it('reads a failure with its safe code', async () => {
    const { database } = make_database([
      make_row({
        status: 'FAILED',
        error_code: 'PROVIDER_AUTH',
        provider_message_id: null,
        sent_at: null,
      }),
    ]);

    const [row] = await new SpannerEmailDeliveryStore(database).list_recipients('t1', 'd1');

    expect(row).toMatchObject({
      status: DeliveryStatus.FAILED,
      error_code: DeliveryErrorCode.PROVIDER_AUTH,
      sent_at: null,
    });
  });

  it('inserts a first result', async () => {
    const { transaction, database } = make_database([]);

    expect(await new SpannerEmailDeliveryStore(database).record_result(NEW_RESULT)).toBe(true);

    expect(transaction.upsert).toHaveBeenCalledWith('email_draft_recipients', {
      tenant_id: 't1',
      draft_id: 'd1',
      contact_id: 'c1',
      status: 'SENT',
      provider_message_id: 'msg-2',
      error_code: null,
      sent_at: 9000,
      created_at: 9000,
      created_by: 'later',
      updated_at: 9000,
      updated_by: 'later',
    });
  });

  it('keeps the original created stamp when replacing a failure', async () => {
    const { transaction, database } = make_database([
      make_row({
        status: 'FAILED',
        error_code: 'PROVIDER_UNAVAILABLE',
        created_at: '1000',
        created_by: 'first',
      }),
    ]);

    expect(await new SpannerEmailDeliveryStore(database).record_result(NEW_RESULT)).toBe(true);

    expect(transaction.upsert).toHaveBeenCalledWith(
      'email_draft_recipients',
      expect.objectContaining({ created_at: 1000, created_by: 'first', updated_by: 'later' }),
    );
  });

  it('writes nothing over a recipient who was already delivered to', async () => {
    const { transaction, database } = make_database([make_row()]);

    expect(await new SpannerEmailDeliveryStore(database).record_result(NEW_RESULT)).toBe(false);

    expect(transaction.upsert).not.toHaveBeenCalled();
  });
});

describe.skipIf(!is_spanner_emulator_configured())(
  'SpannerEmailDeliveryStore (emulator)',
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

    describe_email_delivery_store_contract(
      'Spanner',
      () => new SpannerEmailDeliveryStore(database),
    );
  },
);
