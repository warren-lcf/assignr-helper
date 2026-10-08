import { IDraftFormModel } from '../models/draft_form.model';
import { IEmailDraft } from '../models/email_draft.model';
import { from_utc_midnight } from './from_utc_midnight';

/**
 * Turns a stored draft into the editor form value: absent filters become
 * "any", stored calendar days become local dates for the pickers.
 * @param draft The stored draft.
 * @returns The form value.
 */
export function draft_to_form_model(draft: IEmailDraft): IDraftFormModel {
  const filters = draft.filters;
  return {
    subject: draft.subject,
    intro: draft.intro ?? '',
    search: filters.search ?? '',
    level: filters.level ?? '',
    league: filters.league ?? '',
    age_group: filters.age_group ?? '',
    location_group: filters.location_group ?? '',
    organization_id: filters.organization_id ?? null,
    connection_id: filters.connection_id ?? null,
    only_with_open_slots: filters.only_with_open_slots ?? false,
    date_from: typeof filters.date_from === 'number' ? from_utc_midnight(filters.date_from) : null,
    date_to: typeof filters.date_to === 'number' ? from_utc_midnight(filters.date_to) : null,
    include_quick_link: draft.include_quick_link,
    quick_link_expiry_days: draft.quick_link_expiry_days,
    recipient_mode: draft.recipient_mode,
    contact_ids: [...draft.contact_ids],
  };
}
