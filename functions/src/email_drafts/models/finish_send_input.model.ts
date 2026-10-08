import { DraftStatus } from '../enums/draft_status.enum.js';

/** How a send ended, to be recorded on the draft. */
export interface IFinishSendInput {
  /** SENT when every eligible recipient has been delivered to, otherwise PARTIALLY_SENT. */
  status: DraftStatus.SENT | DraftStatus.PARTIALLY_SENT;
  /** Recipients delivered to so far, across all attempts. */
  recipient_count: number;
  /** The quick link minted by this send; null leaves any earlier one in place. */
  quick_link_id: string | null;
  /** UTC milliseconds of this send when it delivered to anyone; null leaves the earlier time. */
  sent_at: number | null;
}
