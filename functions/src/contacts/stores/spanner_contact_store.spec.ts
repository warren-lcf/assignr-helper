import { Database } from '@google-cloud/spanner';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { hash_email_address } from '../../domain/email/hash_email_address.js';
import {
  is_spanner_emulator_configured,
  open_emulator_database,
} from '../../sync/stores/spanner_emulator.fixture.js';
import { ConsentStatus } from '../enums/consent_status.enum.js';
import { CreateContactOutcome } from '../enums/create_contact_outcome.enum.js';
import { describe_contact_store_contract } from './contracts/contact_store.contract.js';
import { make_contract_contact } from './contracts/make_contract_contact.js';
import { SpannerContactStore } from './spanner_contact_store.js';

/**
 * Builds a stored row in the shape a JSON-mode query returns.
 * @param overrides Cells to replace.
 * @returns A row.
 */
function make_row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenant_id: 't1',
    contact_id: 'c1',
    display_name: 'Sam',
    email_address: 'sam@example.com',
    consent_status: 'GRANTED',
    consent_updated_at: '1000',
    unsubscribed_at: null,
    created_at: '1000',
    created_by: 'c',
    updated_at: '1000',
    updated_by: 'c',
    ...overrides,
  };
}

/**
 * Builds a database whose reads and read-write transaction record what is asked of them.
 * @param rows Rows every query returns, in order of call (the last repeats).
 * @returns The spies and the fake database.
 */
function make_database(...rows: Record<string, unknown>[][]) {
  let call = 0;
  const run = vi.fn(async (_request: unknown) => [rows[Math.min(call++, rows.length - 1)] ?? []]);
  const transaction = {
    run,
    insert: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    deleteRows: vi.fn(),
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

interface Sent {
  sql: string;
  params: Record<string, unknown>;
  types: Record<string, unknown>;
}

describe('SpannerContactStore without a database round trip', () => {
  it('maps a row, converting INT64 strings to numbers', async () => {
    const { database } = make_database([make_row({ consent_updated_at: '1786234970000' })]);

    const contact = await new SpannerContactStore(database).get_contact('t1', 'c1');

    expect(contact).toEqual({
      tenant_id: 't1',
      contact_id: 'c1',
      display_name: 'Sam',
      email_address: 'sam@example.com',
      consent_status: ConsentStatus.GRANTED,
      consent_updated_at: 1786234970000,
      unsubscribed_at: null,
      created_at: 1000,
      created_by: 'c',
      updated_at: 1000,
      updated_by: 'c',
    });
  });

  it('refuses a row with an unknown consent status', async () => {
    const { database } = make_database([make_row({ consent_status: 'MAYBE' })]);

    await expect(new SpannerContactStore(database).get_contact('t1', 'c1')).rejects.toThrow(
      /consent_status/,
    );
  });

  it('returns null when no row matches', async () => {
    const { database } = make_database([]);

    expect(await new SpannerContactStore(database).get_contact('t1', 'nope')).toBeNull();
  });

  it('filters every read on the tenant id and binds values as parameters', async () => {
    const { run, database } = make_database([]);
    const store = new SpannerContactStore(database);

    await store.get_contact('t1', 'c1');
    await store.find_contacts('t1', ['c1', 'c2']);
    await store.list_contacts('t1', { consent_status: ConsentStatus.GRANTED, limit: 5 });
    await store.count_contacts('t1');

    expect(run).toHaveBeenCalledTimes(4);
    for (const [sent] of run.mock.calls) {
      const request = sent as Sent;
      expect(request.sql).toContain('tenant_id = @tenant_id');
      expect(request.params['tenant_id']).toBe('t1');
      expect(request.sql).not.toContain('c1');
    }
  });

  it('does not query for an empty id list or a limit below one', async () => {
    const { run, database } = make_database([]);
    const store = new SpannerContactStore(database);

    expect(await store.find_contacts('t1', [])).toEqual([]);
    expect(await store.list_contacts('t1', { consent_status: null, limit: 0 })).toEqual([]);
    expect(await store.list_contacts('t1', { consent_status: null, limit: Number.NaN })).toEqual(
      [],
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('orders by lower-cased name and passes the limit and consent as parameters', async () => {
    const { run, database } = make_database([]);

    await new SpannerContactStore(database).list_contacts('t1', {
      consent_status: ConsentStatus.UNSUBSCRIBED,
      limit: 7,
    });

    const [sent] = run.mock.calls[0] as [Sent];
    expect(sent.sql).toContain('ORDER BY LOWER(display_name), contact_id LIMIT @row_limit');
    expect(sent.sql).toContain('consent_status = @consent_status');
    expect(sent.params).toEqual({ tenant_id: 't1', row_limit: 7, consent_status: 'UNSUBSCRIBED' });
  });

  it('counts with COUNT(*), reading the INT64 cell', async () => {
    const { database } = make_database([{ total: '12' }]);

    expect(await new SpannerContactStore(database).count_contacts('t1')).toBe(12);
  });

  it('counts zero when there is no row', async () => {
    const { database } = make_database([]);

    expect(await new SpannerContactStore(database).count_contacts('t1')).toBe(0);
  });

  describe('create_contact', () => {
    it('checks suppression and the address index inside one transaction, then inserts', async () => {
      const { transaction, database } = make_database([], []);
      const contact = make_contract_contact('t1', 'c1', { email_address: 'Sam@Example.com' });

      const outcome = await new SpannerContactStore(database).create_contact(contact);

      expect(outcome).toBe(CreateContactOutcome.CREATED);
      const [suppression, existing] = transaction.run.mock.calls.map(([sent]) => sent as Sent);
      expect(suppression.sql).toContain('email_suppressions');
      expect(suppression.params['email_hash']).toBe(hash_email_address('sam@example.com'));
      expect(existing.sql).toContain('FORCE_INDEX=contacts_by_email');
      expect(existing.params['email_address']).toBe('sam@example.com');
      expect(transaction.insert).toHaveBeenCalledWith(
        'contacts',
        expect.objectContaining({ contact_id: 'c1', email_address: 'sam@example.com' }),
      );
      expect(transaction.commit).toHaveBeenCalledTimes(1);
    });

    it('stores no suppression hash alongside an address and never the address in a suppression query', async () => {
      const { transaction, database } = make_database([], []);

      await new SpannerContactStore(database).create_contact(
        make_contract_contact('t1', 'c1', { email_address: 'sam@example.com' }),
      );

      const [suppression] = transaction.run.mock.calls.map(([sent]) => sent as Sent);
      expect(JSON.stringify(suppression)).not.toContain('sam@example.com');
    });

    it('reports a suppressed address without inserting', async () => {
      const { transaction, database } = make_database([{ email_hash: 'x' }]);

      const outcome = await new SpannerContactStore(database).create_contact(
        make_contract_contact('t1', 'c1'),
      );

      expect(outcome).toBe(CreateContactOutcome.SUPPRESSED);
      expect(transaction.insert).not.toHaveBeenCalled();
    });

    it('reports an existing address without inserting', async () => {
      const { transaction, database } = make_database([], [{ contact_id: 'other' }]);

      const outcome = await new SpannerContactStore(database).create_contact(
        make_contract_contact('t1', 'c1'),
      );

      expect(outcome).toBe(CreateContactOutcome.EMAIL_EXISTS);
      expect(transaction.insert).not.toHaveBeenCalled();
    });

    it('reads a unique index violation at commit as an existing address', async () => {
      const { transaction, database } = make_database([], []);
      transaction.commit.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 6 }));

      const outcome = await new SpannerContactStore(database).create_contact(
        make_contract_contact('t1', 'c1'),
      );

      expect(outcome).toBe(CreateContactOutcome.EMAIL_EXISTS);
    });

    it('rethrows any other failure', async () => {
      const { transaction, database } = make_database([], []);
      transaction.commit.mockRejectedValueOnce(Object.assign(new Error('down'), { code: 14 }));

      await expect(
        new SpannerContactStore(database).create_contact(make_contract_contact('t1', 'c1')),
      ).rejects.toThrow('down');
    });
  });

  describe('delete_contact', () => {
    it('keeps a hashed suppression for an unsubscribed contact, then deletes the row', async () => {
      const { transaction, database } = make_database([
        make_row({ consent_status: 'UNSUBSCRIBED', unsubscribed_at: '5' }),
      ]);

      const deleted = await new SpannerContactStore(database).delete_contact(
        't1',
        'c1',
        9000,
        'me',
      );

      expect(deleted?.contact_id).toBe('c1');
      expect(transaction.upsert).toHaveBeenCalledWith('email_suppressions', {
        tenant_id: 't1',
        email_hash: hash_email_address('sam@example.com'),
        unsubscribed_at: 5,
        created_at: 9000,
        created_by: 'me',
        updated_at: 9000,
        updated_by: 'me',
      });
      expect(JSON.stringify(transaction.upsert.mock.calls)).not.toContain('sam@example.com');
      expect(transaction.deleteRows).toHaveBeenCalledWith('contacts', [['t1', 'c1']]);
    });

    it('keeps no suppression for a contact who had consented', async () => {
      const { transaction, database } = make_database([make_row()]);

      await new SpannerContactStore(database).delete_contact('t1', 'c1', 9000, 'me');

      expect(transaction.upsert).not.toHaveBeenCalled();
      expect(transaction.deleteRows).toHaveBeenCalledTimes(1);
    });

    it('does nothing for an unknown contact', async () => {
      const { transaction, database } = make_database([]);

      expect(await new SpannerContactStore(database).delete_contact('t1', 'x', 1, 'me')).toBeNull();
      expect(transaction.deleteRows).not.toHaveBeenCalled();
    });
  });

  describe('mark_unsubscribed', () => {
    it('reads then updates in one transaction', async () => {
      const { transaction, database } = make_database([make_row()]);

      const result = await new SpannerContactStore(database).mark_unsubscribed(
        't1',
        'c1',
        7000,
        'x',
      );

      expect(result?.changed).toBe(true);
      expect(result?.contact).toMatchObject({
        consent_status: ConsentStatus.UNSUBSCRIBED,
        unsubscribed_at: 7000,
        updated_by: 'x',
      });
      expect(transaction.update).toHaveBeenCalledWith('contacts', {
        tenant_id: 't1',
        contact_id: 'c1',
        consent_status: 'UNSUBSCRIBED',
        consent_updated_at: 7000,
        unsubscribed_at: 7000,
        updated_at: 7000,
        updated_by: 'x',
      });
    });

    it('writes nothing for a contact who has already unsubscribed', async () => {
      const { transaction, database } = make_database([
        make_row({ consent_status: 'UNSUBSCRIBED', unsubscribed_at: '4000' }),
      ]);

      const result = await new SpannerContactStore(database).mark_unsubscribed(
        't1',
        'c1',
        7000,
        'x',
      );

      expect(result).toMatchObject({ changed: false, contact: { unsubscribed_at: 4000 } });
      expect(transaction.update).not.toHaveBeenCalled();
    });

    it('returns null for an unknown contact', async () => {
      const { transaction, database } = make_database([]);

      expect(
        await new SpannerContactStore(database).mark_unsubscribed('t1', 'x', 1, 'x'),
      ).toBeNull();
      expect(transaction.update).not.toHaveBeenCalled();
    });
  });
});

describe.skipIf(!is_spanner_emulator_configured())(
  'SpannerContactStore (emulator)',
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

    describe_contact_store_contract('Spanner', () => new SpannerContactStore(database));
  },
);
