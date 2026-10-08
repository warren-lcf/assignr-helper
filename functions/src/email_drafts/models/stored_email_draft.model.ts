import { IAuditStamp } from '../../sync/models/audit_stamp.model.js';
import { DraftStatus } from '../enums/draft_status.enum.js';
import { IDraftContent } from './draft_content.model.js';

/**
 * An email draft as stored. The email itself is never stored: it is rendered from live data at
 * preview and send time, so a game that was taken drops out of it.
 */
export interface IStoredEmailDraft extends IDraftContent, IAuditStamp {
  tenant_id: string;
  draft_id: string;
  status: DraftStatus;
  /** The quick link minted by the latest send; the token is never stored. */
  quick_link_id: string | null;
  /** Recipients the email has been delivered to; null before any send. */
  recipient_count: number | null;
  /** UTC milliseconds of the latest send that delivered to anyone. */
  sent_at: number | null;
}
