import { DraftStatus } from '../enums/draft_status.enum';
import { SendResultStatus } from '../enums/send_result_status.enum';
import { ISendDraftResult } from '../models/send_draft_result.model';

/** A send that reached both consenting contacts. */
export const FULL_SEND_RESULT: ISendDraftResult = {
  status: DraftStatus.SENT,
  sent: 2,
  failed: 0,
  results: [
    { contact_id: 'contact-1', status: SendResultStatus.SENT, error_code: null },
    { contact_id: 'contact-2', status: SendResultStatus.SENT, error_code: null },
  ],
};

/** A send where one recipient failed and one was skipped. */
export const PARTIAL_SEND_RESULT: ISendDraftResult = {
  status: DraftStatus.PARTIALLY_SENT,
  sent: 1,
  failed: 1,
  results: [
    { contact_id: 'contact-1', status: SendResultStatus.SENT, error_code: null },
    { contact_id: 'contact-2', status: SendResultStatus.FAILED, error_code: 'PROVIDER_REJECTED' },
    {
      contact_id: 'contact-3',
      status: SendResultStatus.SKIPPED_UNSUBSCRIBED,
      error_code: null,
    },
  ],
};
