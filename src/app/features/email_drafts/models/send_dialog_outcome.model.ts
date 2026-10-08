import { SendOutcomeKind } from '../enums/send_outcome_kind.enum';
import { ISendDraftResult } from './send_draft_result.model';

/** How the send confirmation dialog closed, when it did not simply get cancelled. */
export interface ISendDialogOutcome {
  kind: SendOutcomeKind;
  /** Present for a SENT outcome. */
  result?: ISendDraftResult;
}
