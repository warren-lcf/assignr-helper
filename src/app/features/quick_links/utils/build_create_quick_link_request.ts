import { QUICK_LINK_EXPIRY_PRESET } from '../constants/quick_link_expiry_preset.constant';
import { MS_PER_DAY } from '../constants/quick_link_limits.constant';
import { ICreateQuickLinkFormModel } from '../models/create_quick_link_form.model';
import { ICreateQuickLinkRequest } from '../models/create_quick_link_request.model';
import { IQuickLinkScope } from '../models/quick_link_scope.model';
import { clean_levels } from './clean_levels';
import { to_utc_midnight } from './to_utc_midnight';

/**
 * Builds the create request from the dialog's form. Only restrictions that
 * were set are sent in `scope`; `expires_at` is always sent (null for "Never").
 * @param model The form value.
 * @param now The current time in UTC milliseconds; expiry presets count from it.
 * @returns The request body.
 */
export function build_create_quick_link_request(
  model: ICreateQuickLinkFormModel,
  now: number = Date.now(),
): ICreateQuickLinkRequest {
  const scope: Partial<IQuickLinkScope> = {};
  const levels = clean_levels(model.levels);
  if (levels.length > 0) scope.levels = levels;
  if (model.date_start) scope.date_start = to_utc_midnight(model.date_start);
  if (model.date_end) scope.date_end = to_utc_midnight(model.date_end);

  const request: ICreateQuickLinkRequest = {};
  if (Object.keys(scope).length > 0) request.scope = scope;
  // Always explicit: leaving expires_at out would also mean "never expires", so the choice is sent either way.
  const days = QUICK_LINK_EXPIRY_PRESET[model.expiry].days;
  request.expires_at = days === null ? null : now + days * MS_PER_DAY;
  return request;
}
