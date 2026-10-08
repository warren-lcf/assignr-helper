import { IQuickLinkScope } from '../domain/quick_links/quick_link_scope.model.js';
import { QUICK_LINK_LIMITS } from '../quick_links/quick_link_limits.constant.js';
import { IDraftFilters } from './models/draft_filters.model.js';

/**
 * Rounds an instant down to the UTC midnight that starts its day.
 * @param instant UTC milliseconds.
 * @returns UTC-midnight milliseconds.
 */
function floor_to_utc_midnight(instant: number): number {
  return instant - (instant % QUICK_LINK_LIMITS.MS_PER_DAY);
}

/**
 * Works out what a draft's quick link may show. A link can only be narrowed by organization,
 * level and a calendar-date window, so those parts of the draft's filters carry over; the rest
 * (league, age group, location, search, connection, open-position flag) cannot be expressed in a
 * scope, so the link may show somewhat more than the email lists. The date window is approximate
 * by up to a day because the draft filters on kick-off instants and a link on calendar dates.
 * @param filters The draft's filters.
 * @returns A scope that passes the quick-link rules.
 */
export function build_quick_link_scope(filters: IDraftFilters): IQuickLinkScope {
  const date_start = filters.date_from === null ? null : floor_to_utc_midnight(filters.date_from);
  const date_end = filters.date_to === null ? null : floor_to_utc_midnight(filters.date_to);
  const window_is_usable =
    (date_start === null || date_start <= QUICK_LINK_LIMITS.MAX_SCOPE_DATE) &&
    (date_end === null || date_end <= QUICK_LINK_LIMITS.MAX_SCOPE_DATE) &&
    (date_start === null || date_end === null || date_end >= date_start);
  return {
    organization_ids: filters.organization_id === null ? [] : [filters.organization_id],
    levels: filters.level === null ? [] : [filters.level],
    date_start: window_is_usable ? date_start : null,
    date_end: window_is_usable ? date_end : null,
  };
}
