import { Database } from '@google-cloud/spanner';
import { DeliveryErrorCode } from '../../email_delivery/enums/delivery_error_code.enum.js';
import { run_write_transaction } from '../../sync/stores/run_write_transaction.js';
import {
  to_nullable_number,
  to_nullable_string,
  to_number,
} from '../../sync/stores/spanner_row_values.js';
import { DeliveryStatus } from '../enums/delivery_status.enum.js';
import { IStoredDraftRecipient } from '../models/stored_draft_recipient.model.js';
import { IEmailDeliveryStore } from '../ports/email_delivery_store.interface.js';

const RECIPIENT_COLUMNS =
  'tenant_id, draft_id, contact_id, status, provider_message_id, error_code, sent_at, ' +
  'created_at, created_by, updated_at, updated_by';

/**
 * Spanner `IEmailDeliveryStore` over `email_draft_recipients`. It uses the Spanner client
 * directly to match the other stores. Each result is written in a read-write transaction that
 * first reads the row, so a delivered (SENT) recipient is never overwritten by a racing writer.
 * The table holds contact ids only, never addresses.
 */
export class SpannerEmailDeliveryStore implements IEmailDeliveryStore {
  /**
   * Creates a store over an existing database handle.
   * @param database Spanner database holding the `email_draft_recipients` table.
   */
  public constructor(private readonly database: Database) {}

  /** @inheritdoc */
  public async list_recipients(
    tenant_id: string,
    draft_id: string,
  ): Promise<IStoredDraftRecipient[]> {
    const [rows] = await this.database.run({
      sql:
        `SELECT ${RECIPIENT_COLUMNS} FROM email_draft_recipients ` +
        'WHERE tenant_id = @tenant_id AND draft_id = @draft_id ORDER BY contact_id',
      params: { tenant_id, draft_id },
      types: { tenant_id: 'string', draft_id: 'string' },
      json: true,
    });
    return (rows as Record<string, unknown>[]).map((row) => this.to_recipient(row));
  }

  /** @inheritdoc */
  public async record_result(recipient: IStoredDraftRecipient): Promise<boolean> {
    return run_write_transaction(this.database, async (transaction) => {
      const [rows] = await transaction.run({
        sql:
          `SELECT ${RECIPIENT_COLUMNS} FROM email_draft_recipients ` +
          'WHERE tenant_id = @tenant_id AND draft_id = @draft_id AND contact_id = @contact_id',
        params: {
          tenant_id: recipient.tenant_id,
          draft_id: recipient.draft_id,
          contact_id: recipient.contact_id,
        },
        types: { tenant_id: 'string', draft_id: 'string', contact_id: 'string' },
        json: true,
      });
      const [row] = rows as Record<string, unknown>[];
      const existing = row ? this.to_recipient(row) : null;
      if (existing?.status === DeliveryStatus.SENT) {
        return false;
      }
      transaction.upsert('email_draft_recipients', {
        tenant_id: recipient.tenant_id,
        draft_id: recipient.draft_id,
        contact_id: recipient.contact_id,
        status: recipient.status,
        provider_message_id: recipient.provider_message_id,
        error_code: recipient.error_code,
        sent_at: recipient.sent_at,
        created_at: existing?.created_at ?? recipient.created_at,
        created_by: existing?.created_by ?? recipient.created_by,
        updated_at: recipient.updated_at,
        updated_by: recipient.updated_by,
      });
      return true;
    });
  }

  /**
   * Maps a query row to the stored model.
   * @param row Row selected with `RECIPIENT_COLUMNS` in JSON mode.
   * @returns The recipient.
   * @throws Error naming `status` when it holds an unknown value.
   */
  private to_recipient(row: Record<string, unknown>): IStoredDraftRecipient {
    const status = String(row['status']);
    if (
      status !== (DeliveryStatus.SENT as string) &&
      status !== (DeliveryStatus.FAILED as string)
    ) {
      throw new Error('Column status holds an unknown value');
    }
    return {
      tenant_id: String(row['tenant_id']),
      draft_id: String(row['draft_id']),
      contact_id: String(row['contact_id']),
      status: status as DeliveryStatus,
      provider_message_id: to_nullable_string(row['provider_message_id']),
      error_code: to_nullable_string(row['error_code']) as DeliveryErrorCode | null,
      sent_at: to_nullable_number(row['sent_at'], 'sent_at'),
      created_at: to_number(row['created_at'], 'created_at'),
      created_by: String(row['created_by']),
      updated_at: to_number(row['updated_at'], 'updated_at'),
      updated_by: String(row['updated_by']),
    };
  }
}
