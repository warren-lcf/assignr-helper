import { IPublicGame } from '../models/public_game.model';
import { IPublicGamesResult } from '../models/public_games_result.model';
import { IPublicLocationGroup } from '../models/public_location_group.model';

const HOUR_MS = 3_600_000;

/** Saturday 2026-10-10 and Sunday 2026-10-11 at UTC midnight. */
export const SATURDAY = Date.UTC(2026, 9, 10);
export const SUNDAY = Date.UTC(2026, 9, 11);

/** A fixed "as of" for specs: 2026-10-07 15:04 UTC. */
export const AS_OF = Date.UTC(2026, 9, 7, 15, 4, 0);

/** The secret the public specs open the page with. Obviously fake. */
export const PUBLIC_FAKE_TOKEN = 'fake-public-token-0123456789';

/**
 * Builds a public game fixture.
 * @param overrides Fields to change from a Saturday 2 PM game with one open spot.
 * @returns The game.
 */
export function make_public_game(overrides: Partial<IPublicGame> = {}): IPublicGame {
  return {
    game_id: 'g1',
    start_at: SATURDAY + 14 * HOUR_MS,
    local_date: SATURDAY,
    venue_name: 'Field 3',
    location_group: 'Riverside Park',
    level: 'Premier',
    league: 'Fall League',
    home_team: 'Lions',
    away_team: 'Tigers',
    open_slot_count: 1,
    slots: [
      { position: 'Referee', is_open: true },
      { position: 'Asst. Referee', is_open: false },
    ],
    fee_minor: null,
    currency: null,
    ...overrides,
  };
}

/** Riverside Park: two games on Saturday, one on Sunday. */
export const RIVERSIDE_LOCATION: IPublicLocationGroup = {
  location_label: 'Riverside Park',
  dates: [
    {
      local_date: SATURDAY,
      games: [
        make_public_game({ game_id: 'g1' }),
        make_public_game({
          game_id: 'g2',
          start_at: SATURDAY + 16 * HOUR_MS,
          home_team: 'Hawks',
          away_team: 'Owls',
          level: 'Select',
          open_slot_count: 3,
          slots: [
            { position: 'Referee', is_open: true },
            { position: 'Asst. Referee', is_open: true },
            { position: 'Mentor', is_open: true },
          ],
        }),
      ],
    },
    {
      local_date: SUNDAY,
      games: [
        make_public_game({
          game_id: 'g3',
          local_date: SUNDAY,
          start_at: SUNDAY + 13 * HOUR_MS,
          home_team: 'Rams',
          away_team: 'Bulls',
          open_slot_count: 0,
          slots: [],
        }),
      ],
    },
  ],
};

/** A location the server could not resolve, with a game whose date and teams are not known. */
export const UNKNOWN_LOCATION: IPublicLocationGroup = {
  location_label: 'Location to be announced',
  dates: [
    {
      local_date: null,
      games: [
        make_public_game({
          game_id: 'g4',
          local_date: null,
          location_group: null,
          venue_name: null,
          level: null,
          league: null,
          home_team: null,
          away_team: null,
        }),
      ],
    },
  ],
};

/**
 * Builds a public answer.
 * @param overrides Fields to change from the two-location answer with facet lists.
 * @returns The answer.
 */
export function make_public_games_result(
  overrides: Partial<IPublicGamesResult> = {},
): IPublicGamesResult {
  return {
    as_of: AS_OF,
    total: 4,
    locations: [RIVERSIDE_LOCATION, UNKNOWN_LOCATION],
    levels: ['Premier', 'Select'],
    leagues: ['Fall League'],
    location_groups: ['Riverside Park', 'Location to be announced'],
    ...overrides,
  };
}

/** The usual answer. */
export const PUBLIC_GAMES_RESULT: IPublicGamesResult = make_public_games_result();

/** An answer with no games. */
export const EMPTY_PUBLIC_GAMES_RESULT: IPublicGamesResult = make_public_games_result({
  total: 0,
  locations: [],
  levels: [],
  leagues: [],
  location_groups: [],
});
