import { GameSlotState } from '../../games/enums/game_slot_state.enum';
import { IGameView } from '../../games/models/game_view.model';
import {
  SATURDAY_DATE,
  SUNDAY_DATE,
  make_date_group,
  make_game_view,
} from '../../games/mocks/game_view.mock';
import { IGameLocationGroup } from '../../games/models/game_location_group.model';
import { IGamesResult } from '../../games/models/games_result.model';

/** An hour in milliseconds. */
const HOUR = 3_600_000;

/**
 * Builds a game the referee is assigned to.
 * @param overrides Fields to change from a Saturday 9:00 AM (Chicago) game where the referee is Center.
 * @returns The game.
 */
export function make_my_game(overrides: Partial<IGameView> = {}): IGameView {
  return make_game_view({
    game_id: 'mine-1',
    is_open: false,
    is_mine: true,
    open_slot_count: 0,
    total_slot_count: 2,
    slots: [
      { position: 'Center', state: GameSlotState.MINE },
      { position: 'Asst. Referee', state: GameSlotState.FILLED },
    ],
    my_position: 'Center',
    ...overrides,
  });
}

/** Saturday 2:00 PM UTC (9:00 AM Chicago). */
export const SATURDAY_MORNING_GAME: IGameView = make_my_game();

/** Saturday 4:00 PM UTC at another venue. */
export const SATURDAY_AFTERNOON_GAME: IGameView = make_my_game({
  game_id: 'mine-2',
  start_at: SATURDAY_DATE + 16 * HOUR,
  end_at: null,
  home_team: 'Hawks',
  away_team: 'Owls',
  location_group: 'Lakeside Fields',
  venue_name: 'Pitch 1',
  level: 'Select',
  my_position: 'Asst. Referee',
  slots: [
    { position: 'Referee', state: GameSlotState.FILLED },
    { position: 'Asst. Referee', state: GameSlotState.MINE },
  ],
});

/** Sunday 1:00 PM UTC. */
export const SUNDAY_GAME: IGameView = make_my_game({
  game_id: 'mine-3',
  local_date: SUNDAY_DATE,
  start_at: SUNDAY_DATE + 13 * HOUR,
  end_at: SUNDAY_DATE + 14 * HOUR + 15 * 60_000,
  home_team: 'Rams',
  away_team: 'Bulls',
});

/**
 * Groups games the way the backend does for a result: by location, then date.
 * @param games The games, each with its location and date set.
 * @returns The locations A to Z, each with its dates ascending.
 */
export function group_games_for_result(games: readonly IGameView[]): IGameLocationGroup[] {
  const labels = [...new Set(games.map((game) => game.location_group))].sort();
  return labels.map((location_label) => {
    const here = games.filter((game) => game.location_group === location_label);
    const dates = [...new Set(here.map((game) => game.local_date))].sort(
      (a, b) => (a ?? Infinity) - (b ?? Infinity),
    );
    return {
      location_label,
      dates: dates.map((local_date) =>
        make_date_group(
          local_date,
          here
            .filter((game) => game.local_date === local_date)
            .sort((a, b) => a.start_at - b.start_at),
        ),
      ),
    };
  });
}

/**
 * Builds a games result the way `GET /api/games` answers.
 * @param games The games.
 * @returns The result.
 */
export function make_schedule_result(games: readonly IGameView[]): IGamesResult {
  return { locations: group_games_for_result(games), total: games.length, truncated: false };
}

/** Three assigned games over two days and two venues. */
export const SCHEDULE_RESULT: IGamesResult = make_schedule_result([
  SATURDAY_MORNING_GAME,
  SATURDAY_AFTERNOON_GAME,
  SUNDAY_GAME,
]);

/** Nothing assigned. */
export const EMPTY_SCHEDULE_RESULT: IGamesResult = make_schedule_result([]);
