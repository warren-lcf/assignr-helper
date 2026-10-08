import { DraftStatus } from '../enums/draft_status.enum';
import { ISendRecipientResult } from './send_recipient_result.model';

/** The payload of the send draft request. */
export interface ISendDraftResult {
  status: DraftStatus.SENT | DraftStatus.PARTIALLY_SENT;
  sent: number;
  failed: number;
  results: ISendRecipientResult[];
}
