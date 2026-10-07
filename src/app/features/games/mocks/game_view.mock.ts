import { GameStatus } from '../enums/game_status.enum';
import { IGameDateGroup } from '../models/game_date_group.model';
import { IGameLocationGroup } from '../models/game_location_group.model';
import { IGameView } from '../models/game_view.model';
import { IGamesResult } from '../models/games_result.model';

/** Saturday 10 October 2026, as a calendar date (UTC midnight). */
export const SATURDAY_DATE = Date.UTC(2026, 9, 10);
/** Sunday 11 October 2026, as a calendar date (UTC midnight). */
export const SUNDAY_DATE = Date.UTC(2026, 9, 11);

/**
 * Builds a game fixture.
 * @param overrides Fields to change from an open, scheduled under-12 game with one open slot of two.
 * @returns The game.
 */
export function make_game_view(overrides: Partial<IGameView> = {}): IGameView {
  return {
    game_id: 'game-1',
    connection_id: 'conn-1',
    organization_id: 'org-1',
    organization_name: 'Metro Youth Soccer',
    venue_name: 'Field 3',
    location_group: 'Riverside Park',
    local_date: SATURDAY_DATE,
    start_at: SATURDAY_DATE + 14 * 3_600_000,
    end_at: SATURDAY_DATE + 15 * 3_600_000 + 15 * 60_000,
    status: GameStatus.SCHEDULED,
    level: 'Premier',
    league: 'Fall League',
    age_group: 'U12',
    game_type: 'Regular season',
    gender: 'Boys',
    home_team: 'Lions',
    away_team: 'Tigers',
    is_open: true,
    is_mine: false,
    open_slot_count: 1,
    total_slot_count: 2,
    my_position: null,
    fee_minor: null,
    currency: null,
    ...overrides,
  };
}

/** An open game with one slot left of two. */
export const OPEN_GAME: IGameView = make_game_view();

/** A game the referee is assigned to, fully staffed. */
export const MINE_GAME: IGameView = make_game_view({
  game_id: 'game-2',
  start_at: SATURDAY_DATE + 16 * 3_600_000,
  home_team: 'Hawks',
  away_team: 'Owls',
  is_open: false,
  is_mine: true,
  open_slot_count: 0,
  total_slot_count: 3,
  my_position: 'Center',
  age_group: 'U14',
});

/** A cancelled game. */
export const CANCELLED_GAME: IGameView = make_game_view({
  game_id: 'game-3',
  start_at: SUNDAY_DATE + 13 * 3_600_000,
  local_date: SUNDAY_DATE,
  status: GameStatus.CANCELLED,
  is_open: false,
  open_slot_count: 0,
});

/** A game with no teams, venue, organization or tags yet. */
export const BARE_GAME: IGameView = make_game_view({
  game_id: 'game-4',
  location_group: 'Location to be announced',
  local_date: null,
  home_team: null,
  away_team: null,
  venue_name: null,
  organization_name: null,
  level: null,
  league: null,
  age_group: null,
  game_type: null,
  gender: null,
  open_slot_count: 0,
  total_slot_count: 0,
});

/**
 * Builds a date group fixture.
 * @param local_date The calendar date.
 * @param games The games on it.
 * @returns The group.
 */
export function make_date_group(local_date: number | null, games: IGameView[]): IGameDateGroup {
  return { local_date, games };
}

/** Riverside Park: two games on Saturday, one cancelled on Sunday. */
export const RIVERSIDE_LOCATION: IGameLocationGroup = {
  location_label: 'Riverside Park',
  dates: [
    make_date_group(SATURDAY_DATE, [OPEN_GAME, MINE_GAME]),
    make_date_group(SUNDAY_DATE, [CANCELLED_GAME]),
  ],
};

/** The placeholder location, listed last by the backend. */
export const UNKNOWN_LOCATION: IGameLocationGroup = {
  location_label: 'Location to be announced',
  dates: [make_date_group(null, [BARE_GAME])],
};

/** A typical result: one real location and the placeholder. */
export const GAMES_RESULT: IGamesResult = {
  locations: [RIVERSIDE_LOCATION, UNKNOWN_LOCATION],
  total: 4,
  truncated: false,
};

/** A result with nothing in it. */
export const EMPTY_GAMES_RESULT: IGamesResult = { locations: [], total: 0, truncated: false };

/**
 * Builds a result fixture.
 * @param overrides Fields to change from the typical result.
 * @returns The result.
 */
export function make_games_result(overrides: Partial<IGamesResult> = {}): IGamesResult {
  return { ...GAMES_RESULT, ...overrides };
}
