import { describe, expect, it } from 'vitest';
import { IGameLocationGroup } from '../models/game_location_group.model';
import { SATURDAY_DATE, SUNDAY_DATE, make_game_view } from '../mocks/game_view.mock';
import { flatten_games_by_date } from './flatten_games_by_date';

const HOUR = 3_600_000;

describe('flatten_games_by_date', () => {
  it('merges every location into one list per date, ordered by kick-off', () => {
    const locations: IGameLocationGroup[] = [
      {
        location_label: 'Lakeside Fields',
        dates: [
          {
            local_date: SATURDAY_DATE,
            games: [make_game_view({ game_id: 'lake-9am', start_at: SATURDAY_DATE + 9 * HOUR })],
          },
        ],
      },
      {
        location_label: 'Riverside Park',
        dates: [
          {
            local_date: SATURDAY_DATE,
            games: [
              make_game_view({ game_id: 'river-2pm', start_at: SATURDAY_DATE + 14 * HOUR }),
              make_game_view({ game_id: 'river-4pm', start_at: SATURDAY_DATE + 16 * HOUR }),
            ],
          },
          {
            local_date: SUNDAY_DATE,
            games: [make_game_view({ game_id: 'river-sun', start_at: SUNDAY_DATE + 13 * HOUR })],
          },
        ],
      },
    ];

    const flat = flatten_games_by_date(locations);

    expect(flat.map((date) => date.local_date)).toEqual([SATURDAY_DATE, SUNDAY_DATE]);
    expect(flat[0]?.games.map((game) => game.game_id)).toEqual([
      'lake-9am',
      'river-2pm',
      'river-4pm',
    ]);
    expect(flat[1]?.games.map((game) => game.game_id)).toEqual(['river-sun']);
  });

  it('orders by kick-off even when the later game comes from the first location', () => {
    const flat = flatten_games_by_date([
      {
        location_label: 'Riverside Park',
        dates: [
          {
            local_date: SATURDAY_DATE,
            games: [
              make_game_view({ game_id: 'river-4pm', start_at: SATURDAY_DATE + 16 * HOUR }),
              make_game_view({ game_id: 'river-2pm', start_at: SATURDAY_DATE + 14 * HOUR }),
            ],
          },
        ],
      },
      {
        location_label: 'Lakeside Fields',
        dates: [
          {
            local_date: SATURDAY_DATE,
            games: [make_game_view({ game_id: 'lake-9am', start_at: SATURDAY_DATE + 9 * HOUR })],
          },
        ],
      },
    ]);

    expect(flat[0]?.games.map((game) => game.game_id)).toEqual([
      'lake-9am',
      'river-2pm',
      'river-4pm',
    ]);
  });

  it('puts earlier dates first whatever order the locations arrive in', () => {
    const flat = flatten_games_by_date([
      {
        location_label: 'B',
        dates: [{ local_date: SUNDAY_DATE, games: [make_game_view({ game_id: 'sun' })] }],
      },
      {
        location_label: 'A',
        dates: [{ local_date: SATURDAY_DATE, games: [make_game_view({ game_id: 'sat' })] }],
      },
    ]);

    expect(flat.map((date) => date.local_date)).toEqual([SATURDAY_DATE, SUNDAY_DATE]);
  });

  it('lists games with an unknown date last', () => {
    const flat = flatten_games_by_date([
      {
        location_label: 'A',
        dates: [
          { local_date: null, games: [make_game_view({ game_id: 'tbd' })] },
          { local_date: SATURDAY_DATE, games: [make_game_view({ game_id: 'sat' })] },
        ],
      },
    ]);

    expect(flat.map((date) => date.local_date)).toEqual([SATURDAY_DATE, null]);
  });

  it('breaks a tie on kick-off by game id so the order is stable', () => {
    const flat = flatten_games_by_date([
      {
        location_label: 'A',
        dates: [
          {
            local_date: SATURDAY_DATE,
            games: [
              make_game_view({ game_id: 'b', start_at: SATURDAY_DATE + 10 * HOUR }),
              make_game_view({ game_id: 'a', start_at: SATURDAY_DATE + 10 * HOUR }),
            ],
          },
        ],
      },
    ]);

    expect(flat[0]?.games.map((game) => game.game_id)).toEqual(['a', 'b']);
  });

  it('keeps every game and does not change its input', () => {
    const locations: IGameLocationGroup[] = [
      {
        location_label: 'A',
        dates: [
          {
            local_date: SATURDAY_DATE,
            games: [
              make_game_view({ game_id: 'late', start_at: SATURDAY_DATE + 16 * HOUR }),
              make_game_view({ game_id: 'early', start_at: SATURDAY_DATE + 9 * HOUR }),
            ],
          },
        ],
      },
    ];

    const flat = flatten_games_by_date(locations);

    expect(flat.flatMap((date) => date.games)).toHaveLength(2);
    expect(locations[0]?.dates[0]?.games.map((game) => game.game_id)).toEqual(['late', 'early']);
  });

  it('returns an empty list when there are no games', () => {
    expect(flatten_games_by_date([])).toEqual([]);
  });
});
