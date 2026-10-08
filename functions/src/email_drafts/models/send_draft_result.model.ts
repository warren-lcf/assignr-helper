import { DraftStatus } from '../enums/draft_status.enum.js';
import { ISendResultRow } from './send_result_row.model.js';

/** The outcome of sending a draft. */
export interface ISendDraftResult {
  /** SENT when every eligible recipient has now been delivered to, otherwise PARTIALLY_SENT. */
  status: DraftStatus.SENT | DraftStatus.PARTIALLY_SENT;
  /** Emails the vendor accepted in this call. */
  sent: number;
  /** Emails that failed in this call. */
  failed: number;
  results: ISendResultRow[];
}
