import { ActiveFilterChip } from '@hch-shared-libraries/ui-kit/data';
import { GamesFilterKey } from '../enums/games_filter_key.enum';
import { format_location_label } from './format_location_label';
import { IGamesFilters } from '../models/games_filters.model';

/** Translates an English key. */
type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * The removable chips for the active filters (search is shown in its own field).
 * @param filters The chosen filters.
 * @param translate Translates an English key.
 * @returns One chip per active filter, keyed by {@link GamesFilterKey}.
 */
export function active_filter_chips(
  filters: IGamesFilters,
  translate: Translate,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (filters.league) {
    chips.push({
      key: GamesFilterKey.LEAGUE,
      label: translate('League: {{value}}', { value: filters.league }),
    });
  }
  if (filters.level) {
    chips.push({
      key: GamesFilterKey.LEVEL,
      label: translate('Level: {{value}}', { value: filters.level }),
    });
  }
  if (filters.age_group) {
    chips.push({
      key: GamesFilterKey.AGE_GROUP,
      label: translate('Age group: {{value}}', { value: filters.age_group }),
    });
  }
  if (filters.location_group) {
    chips.push({
      key: GamesFilterKey.LOCATION_GROUP,
      label: translate('Location: {{value}}', {
        value: format_location_label(filters.location_group, translate),
      }),
    });
  }
  if (filters.only_with_open_slots) {
    chips.push({
      key: GamesFilterKey.ONLY_WITH_OPEN_SLOTS,
      label: translate('Only games with open slots'),
    });
  }
  if (filters.include_cancelled) {
    chips.push({ key: GamesFilterKey.INCLUDE_CANCELLED, label: translate('Show cancelled') });
  }
  return chips;
}

/**
 * Whether anything beyond the scope narrows the list: search text, a facet or a toggle.
 * @param filters The chosen filters.
 * @returns True when "Clear filters" would change something.
 */
export function has_active_games_filters(filters: IGamesFilters): boolean {
  return (
    filters.search.trim().length > 0 ||
    Boolean(filters.league || filters.level || filters.age_group || filters.location_group) ||
    filters.only_with_open_slots ||
    filters.include_cancelled
  );
}
