import { DraftWriteOutcome } from '../enums/draft_write_outcome.enum.js';
import { IStoredEmailDraft } from './stored_email_draft.model.js';

/** The result of writing a draft's content. */
export interface IDraftWriteResult {
  outcome: DraftWriteOutcome;
  /** The draft as written when the outcome is UPDATED; otherwise the draft as found, or null if there is none. */
  draft: IStoredEmailDraft | null;
}
