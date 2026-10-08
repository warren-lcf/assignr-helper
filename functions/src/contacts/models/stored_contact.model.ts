import { IAuditStamp } from '../../sync/models/audit_stamp.model.js';
import { ConsentStatus } from '../enums/consent_status.enum.js';

/**
 * A person the owner emails, as stored. The address is personal data (PII): it is stored
 * lower-cased, shown only to the tenant's owner, and masked everywhere else.
 */
export interface IStoredContact extends IAuditStamp {
  tenant_id: string;
  contact_id: string;
  display_name: string;
  /** Trimmed and lower-cased; unique within the tenant. */
  email_address: string;
  consent_status: ConsentStatus;
  /** UTC milliseconds the consent was last given or withdrawn. */
  consent_updated_at: number | null;
  /** UTC milliseconds the person unsubscribed; null while consent is granted. */
  unsubscribed_at: number | null;
}
