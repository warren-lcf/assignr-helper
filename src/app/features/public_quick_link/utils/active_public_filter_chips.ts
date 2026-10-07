import { ActiveFilterChip } from '@hch-shared-libraries/ui-kit/data';
import { PublicFilterKey } from '../enums/public_filter_key.enum';
import { IPublicGamesFilters } from '../models/public_games_filters.model';
import { format_public_location_label } from './format_public_location_label';

/** Translates an English key. */
type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * The removable chips for the active facet filters (search is shown in its own field).
 * @param filters The chosen filters.
 * @param translate Translates an English key.
 * @returns One chip per active facet, keyed by {@link PublicFilterKey}.
 */
export function active_public_filter_chips(
  filters: IPublicGamesFilters,
  translate: Translate,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (filters.level) {
    chips.push({
      key: PublicFilterKey.LEVEL,
      label: translate('Level: {{value}}', { value: filters.level }),
    });
  }
  if (filters.league) {
    chips.push({
      key: PublicFilterKey.LEAGUE,
      label: translate('League: {{value}}', { value: filters.league }),
    });
  }
  if (filters.location_group) {
    chips.push({
      key: PublicFilterKey.LOCATION_GROUP,
      label: translate('Location: {{value}}', {
        value: format_public_location_label(filters.location_group, translate),
      }),
    });
  }
  return chips;
}

/**
 * Whether anything narrows the list: search text or a facet.
 * @param filters The chosen filters.
 * @returns True when "Clear filters" would change something.
 */
export function has_active_public_filters(filters: IPublicGamesFilters): boolean {
  return (
    filters.search.trim().length > 0 ||
    Boolean(filters.level || filters.league || filters.location_group)
  );
}
