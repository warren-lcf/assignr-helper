import { IStoredMatchIncident } from '../models/stored_match_incident.model.js';

/**
 * Orders incidents oldest first: by `created_at`, then by `incident_id`.
 * @param a First incident.
 * @param b Second incident.
 * @returns A negative number when `a` comes first, positive when `b` does, zero when equal.
 */
export function compare_incidents(a: IStoredMatchIncident, b: IStoredMatchIncident): number {
  if (a.created_at !== b.created_at) {
    return a.created_at - b.created_at;
  }
  if (a.incident_id === b.incident_id) {
    return 0;
  }
  return a.incident_id < b.incident_id ? -1 : 1;
}
