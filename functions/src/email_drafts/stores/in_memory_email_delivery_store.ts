import { DeliveryStatus } from '../enums/delivery_status.enum.js';
import { IStoredDraftRecipient } from '../models/stored_draft_recipient.model.js';
import { IEmailDeliveryStore } from '../ports/email_delivery_store.interface.js';

/** In-memory `IEmailDeliveryStore` for tests and local development. Reads and writes are copies. */
export class InMemoryEmailDeliveryStore implements IEmailDeliveryStore {
  private readonly rows = new Map<string, IStoredDraftRecipient>();

  /** @inheritdoc */
  public async list_recipients(
    tenant_id: string,
    draft_id: string,
  ): Promise<IStoredDraftRecipient[]> {
    return [...this.rows.values()]
      .filter((row) => row.tenant_id === tenant_id && row.draft_id === draft_id)
      .sort((a, b) => {
        if (a.contact_id === b.contact_id) {
          return 0;
        }
        return a.contact_id < b.contact_id ? -1 : 1;
      })
      .map((row) => structuredClone(row));
  }

  /** @inheritdoc */
  public async record_result(recipient: IStoredDraftRecipient): Promise<boolean> {
    const key = JSON.stringify([recipient.tenant_id, recipient.draft_id, recipient.contact_id]);
    const existing = this.rows.get(key);
    if (existing?.status === DeliveryStatus.SENT) {
      return false;
    }
    this.rows.set(
      key,
      structuredClone(
        existing
          ? { ...recipient, created_at: existing.created_at, created_by: existing.created_by }
          : recipient,
      ),
    );
    return true;
  }
}
