import { GameStatus } from '../../integrations/enums/game_status.enum.js';
import { IGameFilters } from './game_filters.model.js';
import { IGameView } from './game_view.model.js';
import { resolve_location_label } from './resolve_location_label.js';

/**
 * Compares two optional texts for equality, ignoring case and surrounding whitespace.
 * @param value Text on the game, possibly null.
 * @param wanted Text asked for.
 * @returns True when both are the same text apart from case.
 */
function equals_ignoring_case(value: string | null, wanted: string): boolean {
  return value !== null && value.trim().toLowerCase() === wanted.trim().toLowerCase();
}

/**
 * Tests whether a view's searchable text contains the needle.
 * @param view The game view.
 * @param needle Lower-cased, trimmed, non-empty search text.
 * @returns True when any searchable field contains the needle, ignoring case.
 */
function matches_search(view: IGameView, needle: string): boolean {
  const haystacks = [
    view.home_team,
    view.away_team,
    view.league,
    view.level,
    view.age_group,
    view.venue_name,
    view.location_group,
    view.organization_name,
  ];
  return haystacks.some((text) => text !== null && text.toLowerCase().includes(needle));
}

/**
 * Narrows game views to the ones that satisfy every populated filter. Cancelled games are
 * dropped unless `include_cancelled` is set. A blank `search` is ignored. The input is not
 * mutated and the order is kept.
 * @param views Views to narrow.
 * @param filters Filters to apply.
 * @returns The matching views.
 */
export function filter_game_views(views: IGameView[], filters: IGameFilters): IGameView[] {
  const needle = filters.search?.trim().toLowerCase() ?? '';
  return views.filter((view) => {
    if (!filters.include_cancelled && view.status === GameStatus.CANCELLED) return false;
    if (filters.connection_id !== null && view.connection_id !== filters.connection_id) {
      return false;
    }
    if (filters.organization_id !== null && view.organization_id !== filters.organization_id) {
      return false;
    }
    if (filters.league !== null && !equals_ignoring_case(view.league, filters.league)) {
      return false;
    }
    if (filters.level !== null && !equals_ignoring_case(view.level, filters.level)) {
      return false;
    }
    if (filters.age_group !== null && !equals_ignoring_case(view.age_group, filters.age_group)) {
      return false;
    }
    if (
      filters.location_group !== null &&
      !equals_ignoring_case(
        resolve_location_label(view.location_group, view.venue_name),
        filters.location_group,
      )
    ) {
      return false;
    }
    if (filters.only_with_open_slots && view.open_slot_count === 0) return false;
    return needle === '' || matches_search(view, needle);
  });
}
