import { GamesScope } from '../enums/games_scope.enum';

/**
 * The query parameters of `GET /api/games`. The backend is strict: it rejects
 * unknown parameters. Omitted fields take the backend's defaults.
 */
export interface IGamesQuery {
  scope: GamesScope;
  /** Free text (at most 100 characters); blank is ignored by the backend. */
  search?: string;
  connection_id?: string;
  organization_id?: string;
  /** Exact, case-insensitive. */
  league?: string;
  level?: string;
  age_group?: string;
  /** Matches the resolved location label, including the placeholder. */
  location_group?: string;
  only_with_open_slots: boolean;
  include_cancelled: boolean;
  /** UTC milliseconds; the backend defaults to three hours ago. */
  from?: number;
  /** UTC milliseconds; the backend defaults to 120 days ahead. */
  to?: number;
}
