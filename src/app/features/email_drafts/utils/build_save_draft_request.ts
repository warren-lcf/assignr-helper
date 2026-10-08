import {
  DRAFT_SEARCH_MAX_LENGTH,
  QUICK_LINK_EXPIRY_DEFAULT_DAYS,
} from '../constants/email_limits.constant';
import { RecipientMode } from '../enums/recipient_mode.enum';
import { IDraftFilters } from '../models/draft_filters.model';
import { IDraftFormModel } from '../models/draft_form.model';
import { ISaveDraftRequest } from '../models/save_draft_request.model';
import { to_utc_midnight } from '../../quick_links/utils/to_utc_midnight';

/**
 * Turns the editor form value into the API request: text is trimmed, anything
 * unset is left out of the filters, picked days become UTC-midnight
 * milliseconds, and the chosen contacts are only sent for a chosen-people
 * draft. The result has a stable shape, so two equal drafts serialize alike
 * (which is how unsaved changes are detected).
 * @param model The form value.
 * @returns The request body.
 */
export function build_save_draft_request(model: IDraftFormModel): ISaveDraftRequest {
  const filters: IDraftFilters = {};
  const search = model.search.trim().slice(0, DRAFT_SEARCH_MAX_LENGTH).trim();
  if (search) filters.search = search;
  if (model.level) filters.level = model.level;
  if (model.league) filters.league = model.league;
  if (model.age_group) filters.age_group = model.age_group;
  if (model.location_group) filters.location_group = model.location_group;
  if (model.organization_id) filters.organization_id = model.organization_id;
  if (model.connection_id) filters.connection_id = model.connection_id;
  if (model.only_with_open_slots) filters.only_with_open_slots = true;
  if (model.date_from) filters.date_from = to_utc_midnight(model.date_from);
  if (model.date_to) filters.date_to = to_utc_midnight(model.date_to);

  const intro = model.intro.trim();
  return {
    subject: model.subject.trim(),
    intro: intro ? intro : null,
    filters,
    include_quick_link: model.include_quick_link,
    quick_link_expiry_days: model.quick_link_expiry_days ?? QUICK_LINK_EXPIRY_DEFAULT_DAYS,
    recipient_mode: model.recipient_mode,
    ...(model.recipient_mode === RecipientMode.SELECTED
      ? { contact_ids: [...model.contact_ids].sort() }
      : {}),
  };
}
