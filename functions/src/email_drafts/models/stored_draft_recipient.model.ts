import { DeliveryErrorCode } from '../../email_delivery/enums/delivery_error_code.enum.js';
import { IAuditStamp } from '../../sync/models/audit_stamp.model.js';
import { DeliveryStatus } from '../enums/delivery_status.enum.js';

/** What happened when a draft was sent to one contact. It holds the contact id, never the address. */
export interface IStoredDraftRecipient extends IAuditStamp {
  tenant_id: string;
  draft_id: string;
  contact_id: string;
  status: DeliveryStatus;
  /** The vendor's id for the accepted message. */
  provider_message_id: string | null;
  /** Safe machine code of the failure; null for a delivered email. */
  error_code: DeliveryErrorCode | null;
  /** UTC milliseconds the vendor accepted the email. */
  sent_at: number | null;
}
