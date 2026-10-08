import { QUICK_LINK_EXPIRY_DEFAULT_DAYS } from '../constants/email_limits.constant';
import { RecipientMode } from '../enums/recipient_mode.enum';
import { IDraftFormModel } from '../models/draft_form.model';

/**
 * A fresh draft form: no filters, no quick link (expiring in two weeks if one
 * is added), going to everyone who agreed.
 * @returns The blank form value.
 */
export function blank_draft_form(): IDraftFormModel {
  return {
    subject: '',
    intro: '',
    search: '',
    level: '',
    league: '',
    age_group: '',
    location_group: '',
    organization_id: null,
    connection_id: null,
    only_with_open_slots: false,
    date_from: null,
    date_to: null,
    include_quick_link: false,
    quick_link_expiry_days: QUICK_LINK_EXPIRY_DEFAULT_DAYS,
    recipient_mode: RecipientMode.ALL_CONSENTED,
    contact_ids: [],
  };
}
