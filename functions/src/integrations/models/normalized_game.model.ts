import { GameStatus } from '../enums/game_status.enum.js';
import { INormalizedGameSlot } from './normalized_game_slot.model.js';
import { INormalizedVenue } from './normalized_venue.model.js';

/**
 * A game normalized across scheduling providers. All instants are UTC
 * milliseconds; `game_time_zone` carries the venue-local IANA zone so the
 * local calendar date can be derived for grouping.
 */
export interface INormalizedGame {
  external_id: string;
  organization_external_id: string;
  venue: INormalizedVenue | null;
  start_at: number;
  end_at: number | null;
  game_time_zone: string | null;
  status: GameStatus;
  published: boolean;
  league: string | null;
  age_group: string | null;
  level: string | null;
  game_type: string | null;
  gender: string | null;
  home_team: string | null;
  away_team: string | null;
  /** True while at least one slot is unfilled and the game is open to claim. */
  is_open: boolean;
  /** True when the connected account holds an assignment on this game. */
  is_mine: boolean;
  slots: INormalizedGameSlot[];
  /** Provider's last-modified instant in UTC ms, when supplied. */
  external_updated_at: number | null;
  lock_version: number | null;
  /** Untouched provider payload, kept for the independent copy. */
  raw: Record<string, unknown>;
}
