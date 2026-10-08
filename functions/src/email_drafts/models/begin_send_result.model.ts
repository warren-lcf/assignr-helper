import { DraftStatus } from '../enums/draft_status.enum.js';
import { BeginSendOutcome } from '../enums/begin_send_outcome.enum.js';
import { IStoredEmailDraft } from './stored_email_draft.model.js';

/** The result of taking the send lock on a draft. */
export interface IBeginSendResult {
  outcome: BeginSendOutcome;
  /** The draft, now SENDING, when the outcome is STARTED; otherwise the draft as found, or null if there is none. */
  draft: IStoredEmailDraft | null;
  /**
   * The status to put the draft back to if the send has to be abandoned before anything was
   * sent: DRAFT or PARTIALLY_SENT. Meaningful only when the outcome is STARTED.
   */
  revert_to: DraftStatus;
}
