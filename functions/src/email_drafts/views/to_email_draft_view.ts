import { IStoredEmailDraft } from '../models/stored_email_draft.model.js';
import { IEmailDraftView } from './email_draft_view.model.js';

/**
 * Projects a stored draft to its API shape. The tenant id, the quick link id and the audit actors
 * are left out; each field is copied by name so a new stored field can never leak by accident.
 * @param draft Stored draft.
 * @returns The view.
 */
export function to_email_draft_view(draft: IStoredEmailDraft): IEmailDraftView {
  return {
    draft_id: draft.draft_id,
    subject: draft.subject,
    intro: draft.intro,
    filters: { ...draft.filters },
    include_quick_link: draft.include_quick_link,
    quick_link_expiry_days: draft.quick_link_expiry_days,
    recipient_mode: draft.recipient_mode,
    contact_ids: [...draft.contact_ids],
    status: draft.status,
    recipient_count: draft.recipient_count,
    sent_at: draft.sent_at,
    created_at: draft.created_at,
    updated_at: draft.updated_at,
  };
}
