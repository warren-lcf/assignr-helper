import { IGameGroupDate } from './game_group_date.model.js';
import { IGameGroupLocation } from './game_group_location.model.js';
import { IGameListItem } from './game_list_item.model.js';
import { UNKNOWN_LOCATION_LABEL } from './unknown_location_label.constant.js';

const location_collator = new Intl.Collator('en-US', { sensitivity: 'base', numeric: true });

/**
 * Resolves the label a game is grouped under.
 * @param item The game.
 * @returns `location_group`, else `venue_name`, else the unknown-location label.
 */
function location_label_of(item: IGameListItem): string {
  return item.location_group ?? item.venue_name ?? UNKNOWN_LOCATION_LABEL;
}

/**
 * Compares two games by start instant, then game id so ties stay stable.
 * @param a First game.
 * @param b Second game.
 * @returns Negative, zero or positive ordering value.
 */
function compare_games(a: IGameListItem, b: IGameListItem): number {
  if (a.start_at !== b.start_at) {
    return a.start_at - b.start_at;
  }
  if (a.game_id < b.game_id) {
    return -1;
  }
  return a.game_id > b.game_id ? 1 : 0;
}

/**
 * Compares two optional calendar dates ascending with unknown dates last.
 * @param a First date or null.
 * @param b Second date or null.
 * @returns Negative, zero or positive ordering value.
 */
function compare_dates(a: number | null, b: number | null): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return a - b;
}

/**
 * Compares two location labels case-insensitively with the unknown location
 * last; labels that differ only by case fall back to code-unit order.
 * @param a First label.
 * @param b Second label.
 * @returns Negative or positive ordering value.
 */
function compare_locations(a: string, b: string): number {
  const a_unknown = a === UNKNOWN_LOCATION_LABEL;
  const b_unknown = b === UNKNOWN_LOCATION_LABEL;
  if (a_unknown !== b_unknown) {
    return a_unknown ? 1 : -1;
  }
  const compared = location_collator.compare(a, b);
  if (compared !== 0) {
    return compared;
  }
  return a < b ? -1 : 1;
}

/**
 * Groups games by location then date for the "games available" view.
 * Locations are sorted alphabetically (case-insensitive) with the unknown
 * location last; dates ascend with unknown dates last; games within a date
 * ascend by start time then id. The input is not mutated.
 * @param items Games to group.
 * @returns Locations, each with its dated game buckets.
 */
export function group_games(items: IGameListItem[]): IGameGroupLocation[] {
  const by_location = new Map<string, Map<number | null, IGameListItem[]>>();

  for (const item of items) {
    const label = location_label_of(item);
    const by_date = by_location.get(label) ?? new Map<number | null, IGameListItem[]>();
    const games = by_date.get(item.local_date) ?? [];
    games.push(item);
    by_date.set(item.local_date, games);
    by_location.set(label, by_date);
  }

  const locations: IGameGroupLocation[] = [...by_location.entries()].map(([label, by_date]) => {
    const dates: IGameGroupDate[] = [...by_date.entries()]
      .map(([local_date, games]) => ({ local_date, games: [...games].sort(compare_games) }))
      .sort((a, b) => compare_dates(a.local_date, b.local_date));
    return { location_label: label, dates };
  });

  return locations.sort((a, b) => compare_locations(a.location_label, b.location_label));
}
