import { Database } from '@google-cloud/spanner';
import { hash_email_address } from '../../domain/email/hash_email_address.js';
import { run_write_transaction } from '../../sync/stores/run_write_transaction.js';
import { to_nullable_number, to_number } from '../../sync/stores/spanner_row_values.js';
import { ConsentStatus } from '../enums/consent_status.enum.js';
import { CreateContactOutcome } from '../enums/create_contact_outcome.enum.js';
import { IListContactsOptions } from '../models/list_contacts_options.model.js';
import { IMarkUnsubscribedResult } from '../models/mark_unsubscribed_result.model.js';
import { IStoredContact } from '../models/stored_contact.model.js';
import { IContactStore } from '../ports/contact_store.interface.js';

const CONTACT_COLUMNS =
  'tenant_id, contact_id, display_name, email_address, consent_status, consent_updated_at, ' +
  'unsubscribed_at, created_at, created_by, updated_at, updated_by';

/** gRPC status ALREADY_EXISTS, which Spanner raises for a duplicate key or unique index entry. */
const GRPC_ALREADY_EXISTS = 6;

/**
 * Spanner `IContactStore` over the `contacts` and `email_suppressions` tables. It uses the
 * Spanner client directly instead of core-server's CRUD helpers to match the other stores:
 * callers stamp the rows and write the audit rows themselves. Addresses are lower-cased on the
 * way in, so the unique index `contacts_by_email` is effectively case-insensitive.
 */
export class SpannerContactStore implements IContactStore {
  /**
   * Creates a store over an existing database handle.
   * @param database Spanner database holding the contact tables.
   */
  public constructor(private readonly database: Database) {}

  /** @inheritdoc */
  public async create_contact(contact: IStoredContact): Promise<CreateContactOutcome> {
    const email_address = contact.email_address.toLowerCase();
    try {
      return await run_write_transaction(this.database, async (transaction) => {
        const [suppressed] = await transaction.run({
          sql:
            'SELECT email_hash FROM email_suppressions ' +
            'WHERE tenant_id = @tenant_id AND email_hash = @email_hash',
          params: { tenant_id: contact.tenant_id, email_hash: hash_email_address(email_address) },
          types: { tenant_id: 'string', email_hash: 'string' },
          json: true,
        });
        if (suppressed.length > 0) {
          return CreateContactOutcome.SUPPRESSED;
        }
        const [existing] = await transaction.run({
          sql:
            'SELECT contact_id FROM contacts@{FORCE_INDEX=contacts_by_email} ' +
            'WHERE tenant_id = @tenant_id AND email_address = @email_address',
          params: { tenant_id: contact.tenant_id, email_address },
          types: { tenant_id: 'string', email_address: 'string' },
          json: true,
        });
        if (existing.length > 0) {
          return CreateContactOutcome.EMAIL_EXISTS;
        }
        transaction.insert('contacts', {
          tenant_id: contact.tenant_id,
          contact_id: contact.contact_id,
          display_name: contact.display_name,
          email_address,
          consent_status: contact.consent_status,
          consent_updated_at: contact.consent_updated_at,
          unsubscribed_at: contact.unsubscribed_at,
          created_at: contact.created_at,
          created_by: contact.created_by,
          updated_at: contact.updated_at,
          updated_by: contact.updated_by,
        });
        return CreateContactOutcome.CREATED;
      });
    } catch (error) {
      // Two simultaneous creators both found nothing; the unique index rejected the later commit.
      if ((error as { code?: unknown } | null)?.code === GRPC_ALREADY_EXISTS) {
        return CreateContactOutcome.EMAIL_EXISTS;
      }
      throw error;
    }
  }

  /** @inheritdoc */
  public async get_contact(tenant_id: string, contact_id: string): Promise<IStoredContact | null> {
    const [rows] = await this.database.run({
      sql:
        `SELECT ${CONTACT_COLUMNS} FROM contacts ` +
        'WHERE tenant_id = @tenant_id AND contact_id = @contact_id',
      params: { tenant_id, contact_id },
      types: { tenant_id: 'string', contact_id: 'string' },
      json: true,
    });
    const [row] = rows as Record<string, unknown>[];
    return row ? this.to_contact(row) : null;
  }

  /** @inheritdoc */
  public async find_contacts(tenant_id: string, contact_ids: string[]): Promise<IStoredContact[]> {
    const unique_ids = [...new Set(contact_ids)];
    if (unique_ids.length === 0) {
      return [];
    }
    const [rows] = await this.database.run({
      sql:
        `SELECT ${CONTACT_COLUMNS} FROM contacts ` +
        'WHERE tenant_id = @tenant_id AND contact_id IN UNNEST(@contact_ids)',
      params: { tenant_id, contact_ids: unique_ids },
      types: { tenant_id: 'string', contact_ids: { type: 'array', child: 'string' } },
      json: true,
    });
    return (rows as Record<string, unknown>[]).map((row) => this.to_contact(row));
  }

  /** @inheritdoc */
  public async list_contacts(
    tenant_id: string,
    options: IListContactsOptions,
  ): Promise<IStoredContact[]> {
    const row_limit = Math.floor(options.limit);
    if (!(row_limit >= 1)) {
      return [];
    }
    const params: Record<string, unknown> = { tenant_id, row_limit };
    const types: Record<string, unknown> = { tenant_id: 'string', row_limit: 'int64' };
    let consent_filter = '';
    if (options.consent_status !== null) {
      consent_filter = ' AND consent_status = @consent_status';
      params['consent_status'] = options.consent_status;
      types['consent_status'] = 'string';
    }
    const [rows] = await this.database.run({
      sql:
        `SELECT ${CONTACT_COLUMNS} FROM contacts WHERE tenant_id = @tenant_id${consent_filter} ` +
        'ORDER BY LOWER(display_name), contact_id LIMIT @row_limit',
      params,
      types: types as Record<string, 'string' | 'int64'>,
      json: true,
    });
    return (rows as Record<string, unknown>[]).map((row) => this.to_contact(row));
  }

  /** @inheritdoc */
  public async count_contacts(tenant_id: string): Promise<number> {
    const [rows] = await this.database.run({
      sql: 'SELECT COUNT(*) AS total FROM contacts WHERE tenant_id = @tenant_id',
      params: { tenant_id },
      types: { tenant_id: 'string' },
      json: true,
    });
    const [row] = rows as Record<string, unknown>[];
    return row ? to_number(row['total'], 'total') : 0;
  }

  /** @inheritdoc */
  public async delete_contact(
    tenant_id: string,
    contact_id: string,
    now: number,
    actor: string,
  ): Promise<IStoredContact | null> {
    return run_write_transaction(this.database, async (transaction) => {
      const [rows] = await transaction.run({
        sql:
          `SELECT ${CONTACT_COLUMNS} FROM contacts ` +
          'WHERE tenant_id = @tenant_id AND contact_id = @contact_id',
        params: { tenant_id, contact_id },
        types: { tenant_id: 'string', contact_id: 'string' },
        json: true,
      });
      const [row] = rows as Record<string, unknown>[];
      if (!row) {
        return null;
      }
      const existing = this.to_contact(row);
      if (existing.consent_status === ConsentStatus.UNSUBSCRIBED) {
        transaction.upsert('email_suppressions', {
          tenant_id,
          email_hash: hash_email_address(existing.email_address.toLowerCase()),
          unsubscribed_at: existing.unsubscribed_at ?? now,
          created_at: now,
          created_by: actor,
          updated_at: now,
          updated_by: actor,
        });
      }
      transaction.deleteRows('contacts', [[tenant_id, contact_id]]);
      return existing;
    });
  }

  /** @inheritdoc */
  public async mark_unsubscribed(
    tenant_id: string,
    contact_id: string,
    now: number,
    actor: string,
  ): Promise<IMarkUnsubscribedResult | null> {
    return run_write_transaction(this.database, async (transaction) => {
      const [rows] = await transaction.run({
        sql:
          `SELECT ${CONTACT_COLUMNS} FROM contacts ` +
          'WHERE tenant_id = @tenant_id AND contact_id = @contact_id',
        params: { tenant_id, contact_id },
        types: { tenant_id: 'string', contact_id: 'string' },
        json: true,
      });
      const [row] = rows as Record<string, unknown>[];
      if (!row) {
        return null;
      }
      const before = this.to_contact(row);
      if (before.consent_status === ConsentStatus.UNSUBSCRIBED) {
        return { contact: before, before, changed: false };
      }
      transaction.update('contacts', {
        tenant_id,
        contact_id,
        consent_status: ConsentStatus.UNSUBSCRIBED,
        consent_updated_at: now,
        unsubscribed_at: now,
        updated_at: now,
        updated_by: actor,
      });
      return {
        contact: {
          ...before,
          consent_status: ConsentStatus.UNSUBSCRIBED,
          consent_updated_at: now,
          unsubscribed_at: now,
          updated_at: now,
          updated_by: actor,
        },
        before,
        changed: true,
      };
    });
  }

  /**
   * Maps a query row to the stored model.
   * @param row Row selected with `CONTACT_COLUMNS` in JSON mode.
   * @returns The contact.
   * @throws Error naming `consent_status` when it holds an unknown value.
   */
  private to_contact(row: Record<string, unknown>): IStoredContact {
    const consent_status = String(row['consent_status']);
    if (
      consent_status !== (ConsentStatus.GRANTED as string) &&
      consent_status !== (ConsentStatus.UNSUBSCRIBED as string)
    ) {
      throw new Error('Column consent_status holds an unknown value');
    }
    return {
      tenant_id: String(row['tenant_id']),
      contact_id: String(row['contact_id']),
      display_name: String(row['display_name']),
      email_address: String(row['email_address']),
      consent_status: consent_status as ConsentStatus,
      consent_updated_at: to_nullable_number(row['consent_updated_at'], 'consent_updated_at'),
      unsubscribed_at: to_nullable_number(row['unsubscribed_at'], 'unsubscribed_at'),
      created_at: to_number(row['created_at'], 'created_at'),
      created_by: String(row['created_by']),
      updated_at: to_number(row['updated_at'], 'updated_at'),
      updated_by: String(row['updated_by']),
    };
  }
}
