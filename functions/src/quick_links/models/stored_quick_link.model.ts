import { IQuickLinkRecord } from '../../domain/quick_links/quick_link_record.model.js';
import { IAuditStamp } from '../../sync/models/audit_stamp.model.js';

/**
 * A quick link as stored. Only the token's hash is kept, never the token, so a copy
 * of this row can never be used to open the link.
 */
export interface IStoredQuickLink extends IQuickLinkRecord, IAuditStamp {
  /** UTC milliseconds of the most recent successful public view; null while never viewed. */
  last_viewed_at: number | null;
  /** Successful public views so far. */
  view_count: number;
  /** The email draft this link was created for, when it has one. */
  email_draft_id: string | null;
}
