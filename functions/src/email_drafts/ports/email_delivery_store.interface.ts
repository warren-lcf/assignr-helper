import { IStoredDraftRecipient } from '../models/stored_draft_recipient.model.js';

/** Persistence port for what happened when a draft was sent to each contact. Scoped by `tenant_id`. */
export interface IEmailDeliveryStore {
  /**
   * Lists the recipients recorded for a draft.
   * @param tenant_id Owning tenant.
   * @param draft_id Draft id.
   * @returns One row per contact attempted, ordered by contact id.
   */
  list_recipients(tenant_id: string, draft_id: string): Promise<IStoredDraftRecipient[]>;

  /**
   * Records the result of one attempt. A recipient already recorded as SENT is final: the row is
   * left exactly as it was and false is returned, so a late or repeated write can never turn a
   * delivered email back into a failure or send a second time. Anything else is inserted or
   * replaced (a FAILED row keeps its original `created_at` and `created_by`).
   * @param recipient Complete row.
   * @returns True when the row was written; false when a SENT row already existed.
   */
  record_result(recipient: IStoredDraftRecipient): Promise<boolean>;
}
