import { resolve_time_zone } from '../domain/time/resolve_time_zone.js';
import { IStoredVenue } from '../sync/models/stored_venue.model.js';

/**
 * Chooses the time zone an email shows game times in: the most common valid zone among the
 * tenant's venues (ties go to the zone seen first, in zone-name order). One email has one zone,
 * and until a tenant setting exists the venues are the best evidence of where its games are.
 * @param venues The tenant's venues.
 * @returns An IANA zone name, or null when no venue has a usable one (the email then uses UTC).
 */
export function pick_digest_time_zone(venues: IStoredVenue[]): string | null {
  const counts = new Map<string, number>();
  for (const venue of venues) {
    const zone = venue.time_zone?.trim() ?? '';
    if (zone !== '' && resolve_time_zone(zone) === zone) {
      counts.set(zone, (counts.get(zone) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let best_count = 0;
  for (const [zone, count] of [...counts.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    if (count > best_count) {
      best = zone;
      best_count = count;
    }
  }
  return best;
}
